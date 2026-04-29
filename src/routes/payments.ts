import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { createPixPayment, getPaymentStatus } from "../services/paymentService";
import { sendPushToBusiness } from "../services/notificationService";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const paymentsRouter = Router();

function getHeaderValue(req: Request, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function parseMercadoPagoSignature(signature: string) {
  return signature.split(",").reduce<{ ts?: string; v1?: string }>((acc, part) => {
    const [key, value] = part.split("=");
    if (key?.trim() === "ts") acc.ts = value?.trim();
    if (key?.trim() === "v1") acc.v1 = value?.trim();
    return acc;
  }, {});
}

function getWebhookDataId(req: Request) {
  const queryDataId = req.query["data.id"];
  const dataId = Array.isArray(queryDataId) ? queryDataId[0] : queryDataId;
  const fallbackDataId = req.body?.data?.id;
  const value = String(dataId ?? fallbackDataId ?? "");

  return /^[a-z0-9]+$/i.test(value) ? value.toLowerCase() : value;
}

function isMercadoPagoWebhookSignatureValid(req: Request) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[mp-webhook] MP_WEBHOOK_SECRET nao configurado; pulando validacao de assinatura.");
    return true;
  }

  const xSignature = getHeaderValue(req, "x-signature");
  const xRequestId = getHeaderValue(req, "x-request-id");

  if (!xSignature || !xRequestId) {
    console.warn("[mp-webhook] assinatura ausente: x-signature ou x-request-id nao informado.");
    return false;
  }

  const { ts, v1 } = parseMercadoPagoSignature(xSignature);
  if (!ts || !v1) {
    console.warn("[mp-webhook] assinatura invalida: ts ou v1 ausente.");
    return false;
  }

  const manifest = `id:${getWebhookDataId(req)};request-id:${xRequestId};ts:${ts};`;
  const expectedSignature = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(v1, "hex");

    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  } catch {
    return false;
  }
}

async function notifyPaidAppointment(appointmentId: string) {
  console.log("[push-confirmed] appointment id:", appointmentId);

  try {
    const { data: appt, error } = await supabase
      .from("appointments")
      .select("business_id, clients(name), services(name), start_time, appointment_date")
      .eq("id", appointmentId)
      .single();

    if (error) {
      console.error("[push-confirmed] error:", error.message);
      return;
    }

    if (!appt) {
      console.error("[push-confirmed] error: appointment not found");
      return;
    }

    const client = Array.isArray(appt.clients) ? appt.clients[0] : (appt.clients as any);
    const service = Array.isArray(appt.services) ? appt.services[0] : (appt.services as any);
    const clientName = client?.name ?? "Cliente";
    const serviceName = service?.name ?? "Serviço";
    const time = appt.start_time?.slice(0, 5) ?? "";
    const [y, mo, d] = (appt.appointment_date ?? "").split("-");
    const dateFormatted = y ? `${d}/${mo}/${y}` : "";

    console.log("[push-confirmed] business id:", appt.business_id);
    console.log("[push-confirmed] sending push");
    const result = await sendPushToBusiness(appt.business_id, {
      title: "Novo agendamento confirmado",
      body: `${clientName} agendou ${serviceName}${dateFormatted ? ` para ${dateFormatted}` : ""} às ${time}`,
      url: "/agenda",
    });

    if (result.sent >= 1) {
      console.log("[push-confirmed] sent ok");
    } else {
      console.error("[push-confirmed] error:", result.errors ?? "push not sent");
    }
  } catch (err: any) {
    console.error("[push-confirmed] error:", err?.message ?? err);
  }
}

// Criar pagamento PIX para sinal
paymentsRouter.post("/pix", async (req: Request, res: Response) => {
  const { appointmentId, businessId, amount, payerEmail, payerName } = req.body;

  if (!appointmentId || !businessId || !amount || !payerName) {
    res.status(400).json({ error: "Campos obrigatórios: appointmentId, businessId, amount, payerName" });
    return;
  }

  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("mp_access_token, name, signal_type, signal_value")
      .eq("id", businessId)
      .single();

    const accessToken = business?.mp_access_token?.trim() || process.env.MP_ACCESS_TOKEN!;

    const pixData = await createPixPayment({
      accessToken,
      amount: Number(amount),
      description: `Sinal - ${business?.name ?? "Agendamento"}`,
      payerEmail: payerEmail ?? "cliente@monettar.app",
      payerName,
      externalReference: appointmentId,
    });

    await supabase
      .from("appointments")
      .update({
        mp_payment_id: String(pixData.paymentId),
        payment_status: "pending",
      })
      .eq("id", appointmentId);

    res.json(pixData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Verificar status do pagamento (polling)
paymentsRouter.get("/status/:paymentId", async (req: Request, res: Response) => {
  const { paymentId } = req.params;
  const { businessId } = req.query;

  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("mp_access_token")
      .eq("id", businessId as string)
      .single();

    const accessToken = business?.mp_access_token?.trim() || process.env.MP_ACCESS_TOKEN!;
    const status = await getPaymentStatus(accessToken, paymentId);

    if (status === "approved") {
      console.log("[push-confirmed] payment paid detected");
      const { data: appt } = await supabase
        .from("appointments")
        .select("id, payment_status")
        .eq("mp_payment_id", paymentId)
        .single();

      if (appt && appt.payment_status !== "paid") {
        await supabase
          .from("appointments")
          .update({ payment_status: "paid", paid_date: new Date().toISOString().slice(0, 10) })
          .eq("id", appt.id);
        await notifyPaidAppointment(appt.id);
      }
    }

    res.json({ status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook do Mercado Pago
paymentsRouter.post("/webhook", async (req: Request, res: Response) => {
  if (!isMercadoPagoWebhookSignatureValid(req)) {
    res.sendStatus(401);
    return;
  }

  const { type, data } = req.body;

  if (type === "payment" && data?.id) {
    try {
      const paymentId = String(data.id);
      const { data: appt } = await supabase
        .from("appointments")
        .select("id, business_id, payment_status")
        .eq("mp_payment_id", paymentId)
        .single();

      let accessToken = process.env.MP_ACCESS_TOKEN!;
      if (appt?.business_id) {
        const { data: business } = await supabase
          .from("businesses")
          .select("mp_access_token")
          .eq("id", appt.business_id)
          .single();
        accessToken = business?.mp_access_token?.trim() || accessToken;
      }

      const status = await getPaymentStatus(accessToken, paymentId);

      if (status === "approved" && appt && appt.payment_status !== "paid") {
        console.log("[push-confirmed] payment paid detected");
        await supabase
          .from("appointments")
          .update({ payment_status: "paid", paid_date: new Date().toISOString().slice(0, 10) })
          .eq("mp_payment_id", paymentId);
        await notifyPaidAppointment(appt.id);
      }
    } catch (err) {
      console.error("Webhook error:", err);
    }
  }

  res.sendStatus(200);
});
