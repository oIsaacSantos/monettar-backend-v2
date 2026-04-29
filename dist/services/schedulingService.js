"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableSlots = getAvailableSlots;
const supabase_js_1 = require("@supabase/supabase-js");
const date_1 = require("../utils/date");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DEFAULT_APPOINTMENT_BUFFER_MINUTES = 10;
const SLOT_INTERVAL_MINUTES = 30;
const AFTERNOON_START_TIME = "12:00";
const EVENING_START_TIME = "18:00";
function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}
function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
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
function getTargetDayOfWeek(date) {
    return new Date(date + "T12:00:00Z").getUTCDay();
}
function getWorkRange(business, targetDayOfWeek) {
    const workHoursByDay = business?.work_hours_by_day;
    const dayKey = String(targetDayOfWeek);
    const dayStart = workHoursByDay?.[dayKey]?.start ?? business?.work_start_time ?? "08:00";
    const dayEnd = workHoursByDay?.[dayKey]?.end ?? business?.work_end_time ?? "19:00";
    return {
        workStart: timeToMinutes(dayStart),
        workEnd: timeToMinutes(dayEnd),
    };
}
function getPeriodRange(period, workStart, workEnd, lunchBreak) {
    const afternoonStart = lunchBreak?.end ?? timeToMinutes(AFTERNOON_START_TIME);
    const periodRanges = {
        morning: { start: workStart, end: Math.min(lunchBreak?.start ?? timeToMinutes(AFTERNOON_START_TIME), workEnd) },
        afternoon: { start: Math.max(afternoonStart, workStart), end: Math.min(timeToMinutes(EVENING_START_TIME), workEnd) },
        evening: { start: timeToMinutes(EVENING_START_TIME), end: workEnd },
    };
    return period ? periodRanges[period] : { start: workStart, end: workEnd };
}
function getLunchBreak(business) {
    if (!business?.lunch_break_active)
        return undefined;
    if (!isValidTime(business.lunch_start_time) || !isValidTime(business.lunch_end_time)) {
        console.warn("[scheduling] lunch_break_active sem horários válidos; almoço ignorado com segurança", {
            lunch_start_time: business?.lunch_start_time,
            lunch_end_time: business?.lunch_end_time,
        });
        return undefined;
    }
    const start = timeToMinutes(business.lunch_start_time);
    const end = timeToMinutes(business.lunch_end_time);
    if (end <= start) {
        console.warn("[scheduling] intervalo de almoço inválido; almoço ignorado com segurança", {
            lunch_start_time: business.lunch_start_time,
            lunch_end_time: business.lunch_end_time,
        });
        return undefined;
    }
    return { start, end };
}
function getAppointmentBufferMinutes(business) {
    const buffer = Number(business?.appointment_buffer_minutes);
    if (!Number.isFinite(buffer) || buffer < 0)
        return DEFAULT_APPOINTMENT_BUFFER_MINUTES;
    return Math.floor(buffer);
}
function buildAvailabilityBlocks(range, lunchBreak) {
    if (!lunchBreak)
        return [range];
    return [
        { start: range.start, end: Math.min(lunchBreak.start, range.end) },
        { start: Math.max(lunchBreak.end, range.start), end: range.end },
    ].filter((block) => block.start < block.end);
}
function hasOccupiedConflict(start, end, occupied, buffer) {
    return occupied.some((slot) => start < slot.end + buffer && end > slot.start - buffer);
}
function buildRealAvailabilitySlots(params) {
    const range = getPeriodRange(params.period, params.workStart, params.workEnd, params.lunchBreak);
    const blocks = buildAvailabilityBlocks(range, params.lunchBreak);
    const slots = [];
    // Disponibilidade real: expediente, almoço configurado, duração, appointments e buffer.
    for (const block of blocks) {
        let current = block.start;
        while (current + params.durationMinutes <= block.end) {
            const slotEnd = current + params.durationMinutes;
            const isOccupied = hasOccupiedConflict(current, slotEnd, params.occupied, params.appointmentBufferMinutes);
            if (!isOccupied) {
                slots.push(minutesToTime(current));
            }
            current += SLOT_INTERVAL_MINUTES;
        }
    }
    return slots;
}
function getDaysAhead(date) {
    const [todayYear, todayMonth, todayDay] = (0, date_1.todayBRT)().split("-").map(Number);
    const todayDateEpoch = Date.UTC(todayYear, todayMonth - 1, todayDay);
    const [year, month, day] = date.split("-").map(Number);
    const targetDateEpoch = Date.UTC(year, month - 1, day);
    return Math.floor((targetDateEpoch - todayDateEpoch) / (1000 * 60 * 60 * 24));
}
function getBookingMaxSlots(daysAhead) {
    if (daysAhead <= 7)
        return 2;
    if (daysAhead <= 20)
        return 3;
    return 4;
}
function shuffleSlotsWithSeed(slots, date, sessionSeed) {
    const [year, month, day] = date.split("-").map(Number);
    const dateSeed = year * 10000 + month * 100 + day;
    const combinedSeed = ((sessionSeed ?? 0) + dateSeed) % 999983;
    let seed = combinedSeed === 0 ? 12345 : combinedSeed;
    const rng = () => {
        seed = Math.imul(1664525, seed) + 1013904223;
        seed = seed >>> 0;
        return seed / 4294967296;
    };
    const shuffled = [...slots];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
function curateBookingSlots(slots, date, sessionSeed) {
    const maxSlots = getBookingMaxSlots(getDaysAhead(date));
    if (slots.length <= maxSlots)
        return slots;
    const shuffled = shuffleSlotsWithSeed(slots, date, sessionSeed);
    const morning = shuffled.filter((time) => parseInt(time.split(":")[0]) < 12);
    const afternoon = shuffled.filter((time) => parseInt(time.split(":")[0]) >= 12);
    const result = [];
    // Curadoria do booking publico: poucos horarios criam percepcao de agenda cheia.
    if (morning.length > 0 && afternoon.length > 0) {
        result.push(morning[0]);
        result.push(afternoon[0]);
        for (const slot of shuffled) {
            if (result.length >= maxSlots)
                break;
            if (!result.includes(slot))
                result.push(slot);
        }
    }
    else {
        result.push(...shuffled.slice(0, maxSlots));
    }
    // Mantem a variacao da selecao, mas exibe em ordem cronologica.
    result.sort();
    return result;
}
async function getAvailableSlots(businessId, date, durationMinutes, period, bookingMode = false, sessionSeed) {
    const { data: business } = await supabase
        .from("businesses")
        .select("work_start_time, work_end_time, work_days_of_week, work_hours_by_day, lunch_break_active, lunch_start_time, lunch_end_time, appointment_buffer_minutes")
        .eq("id", businessId)
        .single();
    const workDays = business?.work_days_of_week ?? [1, 2, 3, 4, 5, 6];
    const targetDayOfWeek = getTargetDayOfWeek(date);
    console.log("[scheduling] business.work_days_of_week:", business?.work_days_of_week, typeof business?.work_days_of_week);
    console.log("[scheduling] targetDayOfWeek:", targetDayOfWeek);
    console.log("[scheduling] workDays:", workDays);
    console.log("[scheduling] includes check:", workDays.includes(targetDayOfWeek));
    if (!workDays.includes(targetDayOfWeek)) {
        return [];
    }
    const { workStart, workEnd } = getWorkRange(business, targetDayOfWeek);
    const lunchBreak = getLunchBreak(business);
    const appointmentBufferMinutes = getAppointmentBufferMinutes(business);
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
    const slots = buildRealAvailabilitySlots({
        workStart,
        workEnd,
        durationMinutes,
        period,
        occupied,
        lunchBreak,
        appointmentBufferMinutes,
    });
    if (!bookingMode)
        return slots;
    return curateBookingSlots(slots, date, sessionSeed);
}
