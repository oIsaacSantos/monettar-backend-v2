"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cronRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const web_push_1 = __importDefault(require("web-push"));
const notificationService_1 = require("../services/notificationService");
const appointmentsService_1 = require("../services/appointmentsService");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
exports.cronRouter = (0, express_1.Router)();
let vapidConfigured = false;
exports.cronRouter.post("/expire-payments", async (req, res) => {
    if (!isCronAuthorized(req)) {
        res.status(401).json({ error: "Não autorizado" });
        return;
    }
    try {
        const result = await (0, appointmentsService_1.expirePendingAppointments)();
        console.log("[cron/expire-payments]", result);
        res.json({ ok: true, ...result });
    }
    catch (err) {
        console.error("[cron/expire-payments] error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
exports.cronRouter.post("/reconcile-payments", async (req, res) => {
    if (!isCronAuthorized(req)) {
        res.status(401).json({ error: "Não autorizado" });
        return;
    }
    try {
        const result = await (0, appointmentsService_1.reconcileMercadoPagoPayments)();
        console.log("[cron/reconcile-payments]", result);
        res.json({ ok: true, ...result });
    }
    catch (err) {
        console.error("[cron/reconcile-payments] error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
function configureWebPush() {
    if (vapidConfigured)
        return;
    const email = process.env.VAPID_EMAIL;
    const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!email || !publicKey || !privateKey) {
        const message = `VAPID env vars not configured. Present: email=${!!email} publicKey=${!!publicKey} privateKey=${!!privateKey}`;
        console.error(`[push-test] ${message}`);
        throw new Error(message);
    }
    web_push_1.default.setVapidDetails(email, publicKey, privateKey);
    vapidConfigured = true;
}
function isCronAuthorized(req) {
    return req.headers["x-cron-secret"] === process.env.CRON_SECRET;
}
exports.cronRouter.post("/day-start", async (req, res) => {
    if (!isCronAuthorized(req)) {
        res.status(401).json({ error: "Não autorizado" });
        return;
    }
    const { data: businesses } = await supabase
        .from("businesses")
        .select("id, work_start_time");
    for (const b of businesses ?? []) {
        await (0, notificationService_1.sendDayStartNotification)(b.id);
    }
    res.json({ ok: true });
});
exports.cronRouter.post("/push-test", async (req, res) => {
    if (!isCronAuthorized(req)) {
        res.status(401).json({ success: false, error: "Nao autorizado" });
        return;
    }
    const { businessId } = req.body;
    if (!businessId) {
        res.status(400).json({ success: false, error: "businessId obrigatorio" });
        return;
    }
    try {
        const { data: subscriptions, error } = await supabase
            .from("push_subscriptions")
            .select("*")
            .eq("business_id", businessId);
        console.log("[push-test] businessId:", businessId);
        console.log("[push-test] subscriptions encontradas:", subscriptions);
        console.log("[push-test] erro supabase:", error);
        if (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                found: 0,
                sent: 0,
                failed: 1,
            });
            return;
        }
        if (!subscriptions || subscriptions.length === 0) {
            res.json({
                success: false,
                message: "Nenhuma subscription encontrada",
                found: 0,
                sent: 0,
                failed: 0,
            });
            return;
        }
        configureWebPush();
        let sent = 0;
        let failed = 0;
        const errors = [];
        for (const sub of subscriptions) {
            try {
                await web_push_1.default.sendNotification(JSON.parse(sub.subscription), JSON.stringify({
                    title: "Teste de notificacao",
                    body: "Se voce recebeu isso, o push esta funcionando.",
                }));
                sent++;
            }
            catch (err) {
                console.log("[push-test] erro envio:", err);
                failed++;
                errors.push(err?.message ?? "Push send error");
            }
        }
        res.json({
            success: true,
            found: subscriptions.length,
            sent,
            failed,
            errors,
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: err?.message ?? "Push test failed",
            found: 0,
            sent: 0,
            failed: 1,
            errors: [err?.message ?? "Push test failed"],
        });
    }
});
