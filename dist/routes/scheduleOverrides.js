"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleOverridesRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const OVERRIDE_TYPES = new Set([
    "block_full_day",
    "block_time_range",
    "open_full_day",
    "open_time_range",
    "personal_commitment",
]);
const MAX_COMMITMENT_BUFFER_MINUTES = 120;
exports.scheduleOverridesRouter = (0, express_1.Router)();
function isValidTime(time) {
    if (typeof time !== "string")
        return false;
    const match = time.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (!match)
        return false;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}
function timeToMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}
function normalizeCommitmentBuffer(value) {
    const buffer = Number(value ?? 0);
    if (!Number.isFinite(buffer) || buffer < 0)
        return 0;
    if (buffer > MAX_COMMITMENT_BUFFER_MINUTES)
        return MAX_COMMITMENT_BUFFER_MINUTES;
    return Math.floor(buffer);
}
async function insertScheduleOverride(payload) {
    const result = await supabase
        .from("schedule_overrides")
        .insert(payload)
        .select()
        .single();
    if (!result.error || !("reason" in payload))
        return result;
    const fallbackPayload = { ...payload };
    delete fallbackPayload.reason;
    return supabase
        .from("schedule_overrides")
        .insert(fallbackPayload)
        .select()
        .single();
}
exports.scheduleOverridesRouter.get("/", async (req, res) => {
    const { businessId, date } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    let query = supabase
        .from("schedule_overrides")
        .select("*")
        .eq("business_id", businessId)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true });
    if (date)
        query = query.eq("date", date);
    const { data, error } = await query;
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data ?? []);
});
exports.scheduleOverridesRouter.post("/", async (req, res) => {
    const { businessId, date, startTime, endTime, type, reason } = req.body;
    if (!businessId || !date || !type) {
        res.status(400).json({ error: "businessId, date e type sao obrigatorios" });
        return;
    }
    if (!OVERRIDE_TYPES.has(type)) {
        res.status(400).json({ error: "Tipo de excecao invalido" });
        return;
    }
    const isTimeRange = type === "block_time_range" ||
        type === "open_time_range" ||
        type === "personal_commitment";
    if (isTimeRange && (!isValidTime(startTime) || !isValidTime(endTime))) {
        res.status(400).json({ error: "startTime e endTime validos sao obrigatorios" });
        return;
    }
    if (isTimeRange && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        res.status(400).json({ error: "endTime deve ser maior que startTime" });
        return;
    }
    const bufferBeforeMinutes = normalizeCommitmentBuffer(req.body.bufferBeforeMinutes);
    const bufferAfterMinutes = normalizeCommitmentBuffer(req.body.bufferAfterMinutes);
    const payload = {
        business_id: businessId,
        date,
        start_time: isTimeRange ? startTime : null,
        end_time: isTimeRange ? endTime : null,
        type,
        reason: type === "personal_commitment" ? String(reason ?? "").trim() || null : null,
        buffer_before_minutes: type === "personal_commitment" ? bufferBeforeMinutes : 0,
        buffer_after_minutes: type === "personal_commitment" ? bufferAfterMinutes : 0,
    };
    const { data, error } = await insertScheduleOverride(payload);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json(data);
});
exports.scheduleOverridesRouter.delete("/:id", async (req, res) => {
    const { businessId } = req.query;
    const { id } = req.params;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    const { error } = await supabase
        .from("schedule_overrides")
        .delete()
        .eq("id", id)
        .eq("business_id", businessId);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ success: true });
});
