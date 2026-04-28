import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { createPixPayment, getPaymentStatus } from "../services/paymentService";
import { sendPushToBusiness } from "../services/notificationService";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const paymentsRouter = Router();

async function notifyPaidAppointment(appointmentId: string) {
  const { data: appt } = await supabase
    .from("appointments")
    .select("business_id, clients(name), services(name), start_time, appointment_date")
    .eq("id", appointmentId)
    .single();

  if (!appt) return;

  const clientName = (appt.clients as any)?.name ?? "Cliente";
  const serviceName = (appt.services as any)?.name ?? "Serviço";
  const time = appt.start_time?.slice(0, 5) ?? "";

  await sendPushToBusiness(appt.business_id, {
    title: "Novo agendamento confirmado",
    body: `${clientName} agendou ${serviceName} às ${time}`,
    url: "/agenda",
  });
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
