"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentsRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const paymentService_1 = require("../services/paymentService");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
exports.paymentsRouter = (0, express_1.Router)();
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
        const accessToken = business?.mp_access_token ?? process.env.MP_ACCESS_TOKEN;
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
        const accessToken = business?.mp_access_token ?? process.env.MP_ACCESS_TOKEN;
        const status = await (0, paymentService_1.getPaymentStatus)(accessToken, paymentId);
        if (status === "approved") {
            const { data: appt } = await supabase
                .from("appointments")
                .select("id")
                .eq("mp_payment_id", paymentId)
                .single();
            if (appt) {
                await supabase
                    .from("appointments")
                    .update({ payment_status: "paid", paid_date: new Date().toISOString().slice(0, 10) })
                    .eq("id", appt.id);
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
    const { type, data } = req.body;
    if (type === "payment" && data?.id) {
        try {
            const accessToken = process.env.MP_ACCESS_TOKEN;
            const status = await (0, paymentService_1.getPaymentStatus)(accessToken, String(data.id));
            if (status === "approved") {
                await supabase
                    .from("appointments")
                    .update({ payment_status: "paid", paid_date: new Date().toISOString().slice(0, 10) })
                    .eq("mp_payment_id", String(data.id));
            }
        }
        catch (err) {
            console.error("Webhook error:", err);
        }
    }
    res.sendStatus(200);
});
