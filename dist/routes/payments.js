"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentsRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const crypto_1 = require("crypto");
const paymentService_1 = require("../services/paymentService");
const notificationService_1 = require("../services/notificationService");
const date_1 = require("../utils/date");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
exports.paymentsRouter = (0, express_1.Router)();
function getHeaderValue(req, name) {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}
function parseMercadoPagoSignature(signature) {
    return signature.split(",").reduce((acc, part) => {
        const [key, value] = part.split("=");
        if (key?.trim() === "ts")
            acc.ts = value?.trim();
        if (key?.trim() === "v1")
            acc.v1 = value?.trim();
        return acc;
    }, {});
}
function getWebhookDataId(req) {
    const queryDataId = req.query["data.id"];
    const dataId = Array.isArray(queryDataId) ? queryDataId[0] : queryDataId;
    const fallbackDataId = req.body?.data?.id;
    const value = String(dataId ?? fallbackDataId ?? "");
    return /^[a-z0-9]+$/i.test(value) ? value.toLowerCase() : value;
}
function isMercadoPagoWebhookSignatureValid(req) {
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
    const expectedSignature = (0, crypto_1.createHmac)("sha256", secret).update(manifest).digest("hex");
    try {
        const expectedBuffer = Buffer.from(expectedSignature, "hex");
        const receivedBuffer = Buffer.from(v1, "hex");
        return (expectedBuffer.length === receivedBuffer.length &&
            (0, crypto_1.timingSafeEqual)(expectedBuffer, receivedBuffer));
    }
    catch {
        return false;
    }
}
async function notifyPaidAppointment(appointmentId) {
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
        const client = Array.isArray(appt.clients) ? appt.clients[0] : appt.clients;
        const service = Array.isArray(appt.services) ? appt.services[0] : appt.services;
        const clientName = client?.name ?? "Cliente";
        const serviceName = service?.name ?? "Serviço";
        const time = appt.start_time?.slice(0, 5) ?? "";
        const [y, mo, d] = (appt.appointment_date ?? "").split("-");
        const dateFormatted = y ? `${d}/${mo}/${y}` : "";
        console.log("[push-confirmed] business id:", appt.business_id);
        console.log("[push-confirmed] sending push");
        const result = await (0, notificationService_1.sendPushToBusiness)(appt.business_id, {
            title: "Novo agendamento confirmado",
            body: `${clientName} agendou ${serviceName}${dateFormatted ? ` para ${dateFormatted}` : ""} às ${time}`,
            url: "/agenda",
        });
        if (result.sent >= 1) {
            console.log("[push-confirmed] sent ok");
        }
        else {
            console.error("[push-confirmed] error:", result.errors ?? "push not sent");
        }
    }
    catch (err) {
        console.error("[push-confirmed] error:", err?.message ?? err);
    }
}
// Criar pagamento PIX para sinal
exports.paymentsRouter.post("/pix", async (req, res) => {
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
        const accessToken = business?.mp_access_token?.trim() || process.env.MP_ACCESS_TOKEN;
        const pixData = await (0, paymentService_1.createPixPayment)({
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Verificar status do pagamento (polling)
exports.paymentsRouter.get("/status/:paymentId", async (req, res) => {
    const { paymentId } = req.params;
    const { businessId } = req.query;
    try {
        const { data: business } = await supabase
            .from("businesses")
            .select("mp_access_token")
            .eq("id", businessId)
            .single();
        const accessToken = business?.mp_access_token?.trim() || process.env.MP_ACCESS_TOKEN;
        const status = await (0, paymentService_1.getPaymentStatus)(accessToken, paymentId);
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
                    .update({ payment_status: "paid", paid_date: (0, date_1.todayBRT)() })
                    .eq("id", appt.id);
                await notifyPaidAppointment(appt.id);
            }
        }
        res.json({ status });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Webhook do Mercado Pago
exports.paymentsRouter.post("/webhook", async (req, res) => {
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
            let accessToken = process.env.MP_ACCESS_TOKEN;
            if (appt?.business_id) {
                const { data: business } = await supabase
                    .from("businesses")
                    .select("mp_access_token")
                    .eq("id", appt.business_id)
                    .single();
                accessToken = business?.mp_access_token?.trim() || accessToken;
            }
            const status = await (0, paymentService_1.getPaymentStatus)(accessToken, paymentId);
            if (status === "approved" && appt && appt.payment_status !== "paid") {
                console.log("[push-confirmed] payment paid detected");
                await supabase
                    .from("appointments")
                    .update({ payment_status: "paid", paid_date: (0, date_1.todayBRT)() })
                    .eq("mp_payment_id", paymentId);
                await notifyPaidAppointment(appt.id);
            }
        }
        catch (err) {
            console.error("Webhook error:", err);
        }
    }
    res.sendStatus(200);
});
