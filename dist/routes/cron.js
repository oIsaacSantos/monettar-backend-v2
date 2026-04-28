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
exports.cronRouter.post("/day-start", async (req, res) => {
    const secret = req.headers["x-cron-secret"];
    if (secret !== process.env.CRON_SECRET) {
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
