"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cronRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const notificationService_1 = require("../services/notificationService");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
exports.cronRouter = (0, express_1.Router)();
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
        const result = await (0, notificationService_1.sendPushToBusiness)(businessId, {
            title: "Teste de notificacao",
            body: "Se voce recebeu isso, o push esta funcionando.",
            url: "/agenda",
        });
        if (result.sent === 0) {
            res.status(result.error === "No subscription for business" ? 404 : 500).json({
                success: false,
                error: result.error,
                businessId,
                sent: result.sent,
                statusCode: result.statusCode,
            });
            return;
        }
        res.json({
            success: true,
            message: "Push test sent",
            businessId,
            sent: result.sent,
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: err?.message ?? "Push test failed",
            businessId,
            sent: 0,
        });
    }
});
