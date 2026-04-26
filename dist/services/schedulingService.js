"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableSlots = getAvailableSlots;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}
function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
async function getAvailableSlots(businessId, date, durationMinutes, period) {
    const { data: business } = await supabase
        .from("businesses")
        .select("work_start_time, work_end_time")
        .eq("id", businessId)
        .single();
    const workStart = timeToMinutes(business?.work_start_time ?? "08:00");
    const workEnd = timeToMinutes(business?.work_end_time ?? "19:00");
    const lunchStart = timeToMinutes("12:00");
    const lunchEnd = timeToMinutes("13:00");
    const { data: appointments } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("business_id", businessId)
        .eq("appointment_date", date)
        .not("payment_status", "eq", "cancelled");
    const occupied = (appointments ?? []).map((a) => ({
        start: timeToMinutes(a.start_time),
        end: timeToMinutes(a.end_time),
    }));
    const periodRanges = {
        morning: { start: workStart, end: Math.min(lunchStart, workEnd) },
        afternoon: { start: lunchEnd, end: Math.min(timeToMinutes("18:00"), workEnd) },
        evening: { start: timeToMinutes("18:00"), end: workEnd },
    };
    const rangeStart = period ? periodRanges[period].start : workStart;
    const rangeEnd = period ? periodRanges[period].end : workEnd;
    const slots = [];
    let current = rangeStart;
    while (current + durationMinutes <= rangeEnd) {
        const slotEnd = current + durationMinutes;
        const isLunch = current < lunchEnd && slotEnd > lunchStart;
        const isOccupied = occupied.some((o) => current < o.end && slotEnd > o.start);
        if (!isLunch && !isOccupied) {
            slots.push(minutesToTime(current));
        }
        current += 30;
    }
    return slots;
}
