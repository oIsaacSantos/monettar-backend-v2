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
async function getAvailableSlots(businessId, date, durationMinutes, period, bookingMode = false) {
    const { data: business } = await supabase
        .from("businesses")
        .select("work_start_time, work_end_time, work_days_of_week, work_hours_by_day")
        .eq("id", businessId)
        .single();
    const workDays = business?.work_days_of_week ?? [1, 2, 3, 4, 5, 6];
    const targetDayOfWeek = new Date(date + "T12:00:00Z").getUTCDay();
    console.log("[scheduling] business.work_days_of_week:", business?.work_days_of_week, typeof business?.work_days_of_week);
    console.log("[scheduling] targetDayOfWeek:", targetDayOfWeek);
    console.log("[scheduling] workDays:", workDays);
    console.log("[scheduling] includes check:", workDays.includes(targetDayOfWeek));
    if (!workDays.includes(targetDayOfWeek)) {
        return [];
    }
    const workHoursByDay = business?.work_hours_by_day;
    const dayKey = String(targetDayOfWeek);
    const dayStart = workHoursByDay?.[dayKey]?.start ?? business?.work_start_time ?? "08:00";
    const dayEnd = workHoursByDay?.[dayKey]?.end ?? business?.work_end_time ?? "19:00";
    const workStart = timeToMinutes(dayStart);
    const workEnd = timeToMinutes(dayEnd);
    const lunchStart = timeToMinutes("12:00");
    const lunchEnd = timeToMinutes("13:00");
    const { data: appointments } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("business_id", businessId)
        .eq("appointment_date", date)
        .not("payment_status", "eq", "cancelled");
    const buffer = 10;
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
        const isOccupied = occupied.some((o) => current < o.end + buffer && slotEnd > o.start - buffer);
        if (!isLunch && !isOccupied) {
            slots.push(minutesToTime(current));
        }
        current += 30;
    }
    if (!bookingMode) {
        console.log("[scheduling] bookingMode:", bookingMode);
        console.log("[scheduling] slots disponíveis:", slots.length, slots);
        return slots;
    }
    // Curadoria por faixa de antecedência
    const today = new Date();
    const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const [year, month, day] = date.split("-").map(Number);
    const targetUTC = Date.UTC(year, month - 1, day);
    const daysAhead = Math.floor((targetUTC - todayUTC) / (1000 * 60 * 60 * 24));
    let maxSlots;
    if (daysAhead <= 7)
        maxSlots = 2;
    else if (daysAhead <= 20)
        maxSlots = 3;
    else
        maxSlots = 4;
    const shuffled = [...slots].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, maxSlots);
    selected.sort();
    console.log("[scheduling] bookingMode:", bookingMode);
    console.log("[scheduling] daysAhead:", daysAhead);
    console.log("[scheduling] slots disponíveis:", slots.length, slots);
    console.log("[scheduling] maxSlots:", maxSlots);
    console.log("[scheduling] selected:", selected);
    return selected;
}
