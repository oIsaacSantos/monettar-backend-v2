import { createClient } from "@supabase/supabase-js";
import { todayBRT } from "../utils/date";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Period = "morning" | "afternoon" | "evening";
type WorkHoursByDay = Record<string, { start: string; end: string }>;
type OccupiedSlot = { start: number; end: number };
type LunchBreak = { start: number; end: number };
type AvailabilityBlock = { start: number; end: number };
export type SchedulingValidationCode =
  | "DAY_NOT_WORKING"
  | "OUTSIDE_WORKING_HOURS"
  | "LUNCH_BREAK"
  | "BLOCKED_TIME"
  | "APPOINTMENT_CONFLICT"
  | "BUFFER_CONFLICT"
  | "INVALID_TIME"
  | "INVALID_PAYLOAD";
export type SchedulingValidationResult = {
  valid: boolean;
  reason?: string;
  code?: SchedulingValidationCode;
  overrideable?: boolean;
};
type ScheduleOverrideType =
  | "block_full_day"
  | "block_time_range"
  | "open_full_day"
  | "open_time_range"
  | "personal_commitment";
type ScheduleOverride = {
  id: string;
  business_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  buffer_before_minutes?: number | null;
  buffer_after_minutes?: number | null;
  type: ScheduleOverrideType;
};

const DEFAULT_APPOINTMENT_BUFFER_MINUTES = 10;
const MAX_APPOINTMENT_BUFFER_MINUTES = 120;
const SLOT_INTERVAL_MINUTES = 30;
const AFTERNOON_START_TIME = "12:00";
const EVENING_START_TIME = "18:00";
const BRT_TIME_ZONE = "America/Sao_Paulo";
const OVERRIDEABLE_VALIDATION_CODES = new Set<SchedulingValidationCode>([
  "DAY_NOT_WORKING",
  "OUTSIDE_WORKING_HOURS",
  "APPOINTMENT_CONFLICT",
  "BUFFER_CONFLICT",
]);

function schedulingFailure(
  code: SchedulingValidationCode,
  reason: string,
  allowOverride: boolean
): SchedulingValidationResult {
  const overrideable = OVERRIDEABLE_VALIDATION_CODES.has(code);
  console.info("[manual-override-debug][backend][scheduling:block]", {
    code,
    reason,
    allowOverride,
    overrideable,
    allowedByOverride: allowOverride && overrideable,
  });
  if (allowOverride && overrideable) {
    return { valid: true };
  }
  return { valid: false, code, reason, overrideable };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function currentBRTMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function isValidTime(time: unknown): time is string {
  if (typeof time !== "string") return false;
  const match = time.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return false;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function getTargetDayOfWeek(date: string) {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

function getWorkRange(
  business: any,
  targetDayOfWeek: number
) {
  const workHoursByDay = business?.work_hours_by_day as WorkHoursByDay | null;
  const dayKey = String(targetDayOfWeek);
  const dayStart = workHoursByDay?.[dayKey]?.start ?? business?.work_start_time ?? "08:00";
  const dayEnd = workHoursByDay?.[dayKey]?.end ?? business?.work_end_time ?? "19:00";

  return {
    workStart: timeToMinutes(dayStart),
    workEnd: timeToMinutes(dayEnd),
  };
}

function getPeriodRange(
  period: Period | undefined,
  workStart: number,
  workEnd: number,
  lunchBreak?: LunchBreak
) {
  const afternoonStart = lunchBreak?.end ?? timeToMinutes(AFTERNOON_START_TIME);
  const periodRanges = {
    morning: { start: workStart, end: Math.min(lunchBreak?.start ?? timeToMinutes(AFTERNOON_START_TIME), workEnd) },
    afternoon: { start: Math.max(afternoonStart, workStart), end: Math.min(timeToMinutes(EVENING_START_TIME), workEnd) },
    evening: { start: timeToMinutes(EVENING_START_TIME), end: workEnd },
  };

  return period ? periodRanges[period] : { start: workStart, end: workEnd };
}

function intersectBlocks(blocks: AvailabilityBlock[], range: AvailabilityBlock) {
  return blocks
    .map((block) => ({
      start: Math.max(block.start, range.start),
      end: Math.min(block.end, range.end),
    }))
    .filter((block) => block.start < block.end);
}

function getLunchBreak(business: any): LunchBreak | undefined {
  if (!business?.lunch_break_active) return undefined;

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

function normalizeAppointmentBufferMinutes(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_APPOINTMENT_BUFFER_MINUTES;
  }

  const buffer = Number(value);
  if (!Number.isFinite(buffer)) return DEFAULT_APPOINTMENT_BUFFER_MINUTES;
  if (buffer < 0) return 0;
  if (buffer > MAX_APPOINTMENT_BUFFER_MINUTES) return MAX_APPOINTMENT_BUFFER_MINUTES;

  return Math.floor(buffer);
}

function getAppointmentBufferMinutes(business: any) {
  return normalizeAppointmentBufferMinutes(business?.appointment_buffer_minutes);
}

function buildAvailabilityBlocks(range: AvailabilityBlock, lunchBreak?: LunchBreak) {
  if (!lunchBreak) return [range];

  return [
    { start: range.start, end: Math.min(lunchBreak.start, range.end) },
    { start: Math.max(lunchBreak.end, range.start), end: range.end },
  ].filter((block) => block.start < block.end);
}

function getTimeRangeOverride(override: ScheduleOverride): AvailabilityBlock | null {
  if (!isValidTime(override.start_time) || !isValidTime(override.end_time)) return null;

  const start = timeToMinutes(override.start_time);
  const end = timeToMinutes(override.end_time);
  if (end <= start) return null;

  return { start, end };
}

function applyOpenOverrides(
  blocks: AvailabilityBlock[],
  overrides: ScheduleOverride[],
  workRange: AvailabilityBlock
) {
  const next = [...blocks];

  for (const override of overrides) {
    if (override.type === "open_full_day") {
      next.push(workRange);
      continue;
    }

    if (override.type === "open_time_range") {
      const range = getTimeRangeOverride(override);
      if (range) next.push(range);
    }
  }

  return next;
}

function hasFullDayBlock(overrides: ScheduleOverride[]) {
  return overrides.some((override) => override.type === "block_full_day");
}

function getBlockRanges(overrides: ScheduleOverride[]) {
  return overrides
    .filter((override) => override.type === "block_time_range" || override.type === "personal_commitment")
    .map((override) => {
      const range = getTimeRangeOverride(override);
      if (!range) return null;

      if (override.type !== "personal_commitment") return range;

      const bufferBefore = normalizeAppointmentBufferMinutes(override.buffer_before_minutes ?? 0);
      const bufferAfter = normalizeAppointmentBufferMinutes(override.buffer_after_minutes ?? 0);
      return {
        start: range.start - bufferBefore,
        end: range.end + bufferAfter,
      };
    })
    .filter((range): range is AvailabilityBlock => Boolean(range));
}

function hasBlockConflict(start: number, end: number, blockRanges: AvailabilityBlock[]) {
  return blockRanges.some((range) => start < range.end && end > range.start);
}

function dedupeAndSortSlots(slots: string[]) {
  return [...new Set(slots)].sort();
}

function isWithinBlock(start: number, end: number, block: AvailabilityBlock) {
  return start >= block.start && end <= block.end;
}

function addCandidate(candidates: Set<number>, start: number) {
  if (Number.isFinite(start)) candidates.add(Math.floor(start));
}

function hasOccupiedConflict(
  start: number,
  end: number,
  occupied: OccupiedSlot[],
  buffer: number
) {
  return occupied.some((slot) => start < slot.end + buffer && end > slot.start - buffer);
}

function hasDirectOccupiedOverlap(
  start: number,
  end: number,
  occupied: OccupiedSlot[]
) {
  return occupied.some((slot) => start < slot.end && end > slot.start);
}

function buildRealAvailabilitySlots(params: {
  workStart: number;
  workEnd: number;
  isWorkDay: boolean;
  durationMinutes: number;
  period?: Period;
  occupied: OccupiedSlot[];
  lunchBreak?: LunchBreak;
  appointmentBufferMinutes: number;
  overrides: ScheduleOverride[];
}) {
  if (hasFullDayBlock(params.overrides)) return [];

  const workRange = { start: params.workStart, end: params.workEnd };
  const baseBlocks = params.isWorkDay ? [workRange] : [];
  const openBlocks = applyOpenOverrides(baseBlocks, params.overrides, workRange);
  const periodRange = getPeriodRange(
    params.period,
    params.workStart,
    params.workEnd,
    params.lunchBreak
  );
  const periodBlocks = intersectBlocks(openBlocks, periodRange);
  const blocks = periodBlocks.flatMap((block) => buildAvailabilityBlocks(block, params.lunchBreak));
  const blockRanges = getBlockRanges(params.overrides);
  const slots: string[] = [];

  // Disponibilidade real: expediente, almoço configurado, duração, appointments e buffer.
  for (const block of blocks) {
    const candidates = new Set<number>();

    for (let current = block.start; current + params.durationMinutes <= block.end; current += SLOT_INTERVAL_MINUTES) {
      addCandidate(candidates, current);
    }
    addCandidate(candidates, block.end - params.durationMinutes);

    for (const blocked of blockRanges) {
      addCandidate(candidates, blocked.start - params.durationMinutes);
      addCandidate(candidates, blocked.end);
    }

    for (const occupied of params.occupied) {
      addCandidate(candidates, occupied.start - params.appointmentBufferMinutes - params.durationMinutes);
      addCandidate(candidates, occupied.end + params.appointmentBufferMinutes);
    }

    for (const current of candidates) {
      const slotEnd = current + params.durationMinutes;
      if (!isWithinBlock(current, slotEnd, block)) continue;

      const isOccupied = hasOccupiedConflict(
        current,
        slotEnd,
        params.occupied,
        params.appointmentBufferMinutes
      );
      const isBlocked = hasBlockConflict(current, slotEnd, blockRanges);

      if (!isOccupied && !isBlocked) {
        slots.push(minutesToTime(current));
      }

    }
  }

  return dedupeAndSortSlots(slots);
}

function getDaysAhead(date: string) {
  const [todayYear, todayMonth, todayDay] = todayBRT().split("-").map(Number);
  const todayDateEpoch = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const [year, month, day] = date.split("-").map(Number);
  const targetDateEpoch = Date.UTC(year, month - 1, day);

  return Math.floor((targetDateEpoch - todayDateEpoch) / (1000 * 60 * 60 * 24));
}

function getBookingMaxSlots(daysAhead: number) {
  if (daysAhead <= 7) return 2;
  if (daysAhead <= 20) return 3;
  return 4;
}

function shuffleSlotsWithSeed(slots: string[], date: string, sessionSeed?: number) {
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

function curateBookingSlots(slots: string[], date: string, sessionSeed?: number) {
  const maxSlots = getBookingMaxSlots(getDaysAhead(date));
  if (slots.length <= maxSlots) return slots;

  const shuffled = shuffleSlotsWithSeed(slots, date, sessionSeed);
  const morning = shuffled.filter((time) => parseInt(time.split(":")[0]) < 12);
  const afternoon = shuffled.filter((time) => parseInt(time.split(":")[0]) >= 12);
  const result: string[] = [];

  // Curadoria do booking publico: poucos horarios criam percepcao de agenda cheia.
  if (morning.length > 0 && afternoon.length > 0) {
    result.push(morning[0]);
    result.push(afternoon[0]);
    for (const slot of shuffled) {
      if (result.length >= maxSlots) break;
      if (!result.includes(slot)) result.push(slot);
    }
  } else {
    result.push(...shuffled.slice(0, maxSlots));
  }

  // Mantem a variacao da selecao, mas exibe em ordem cronologica.
  result.sort();
  return result;
}

export async function validateAppointmentSlot(
  businessId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeAppointmentId?: string,
  allowOverride: boolean = false
): Promise<SchedulingValidationResult> {
  console.info("[manual-override-debug][backend][scheduling:validate]", {
    businessId,
    date,
    startTime,
    endTime,
    excludeAppointmentId,
    allowOverride,
  });

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return schedulingFailure("INVALID_TIME", "Horário inválido.", allowOverride);
  }

  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);

  if (endMins <= startMins) {
    return schedulingFailure(
      "INVALID_TIME",
      "Horário de término deve ser após o horário de início.",
      allowOverride
    );
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("work_start_time, work_end_time, work_days_of_week, work_hours_by_day, lunch_break_active, lunch_start_time, lunch_end_time, appointment_buffer_minutes")
    .eq("id", businessId)
    .single();

  if (!business) {
    return schedulingFailure("INVALID_PAYLOAD", "Negócio não encontrado.", allowOverride);
  }

  const workDays: number[] = (business?.work_days_of_week as number[] | null) ?? [1, 2, 3, 4, 5, 6];
  const targetDayOfWeek = getTargetDayOfWeek(date);
  const { workStart, workEnd } = getWorkRange(business, targetDayOfWeek);
  const lunchBreak = getLunchBreak(business);
  const buffer = getAppointmentBufferMinutes(business);

  if (lunchBreak && startMins < lunchBreak.end && endMins > lunchBreak.start) {
    return schedulingFailure(
      "LUNCH_BREAK",
      "Horário conflita com o intervalo de almoço.",
      allowOverride
    );
  }

  const { data: overrides } = await supabase
    .from("schedule_overrides")
    .select("id, business_id, date, start_time, end_time, type, buffer_before_minutes, buffer_after_minutes")
    .eq("business_id", businessId)
    .eq("date", date);

  const overridesList = (overrides ?? []) as ScheduleOverride[];

  if (hasFullDayBlock(overridesList)) {
    return schedulingFailure("BLOCKED_TIME", "Este dia está bloqueado na agenda.", allowOverride);
  }

  const isWorkDay = workDays.includes(targetDayOfWeek);
  const hasOpenOverride = overridesList.some(
    (o) => o.type === "open_full_day" || o.type === "open_time_range"
  );

  if (!isWorkDay && !hasOpenOverride) {
    return schedulingFailure(
      "DAY_NOT_WORKING",
      "Você normalmente não atende nesse dia.",
      allowOverride
    );
  }

  const workRange = { start: workStart, end: workEnd };
  const baseBlocks = isWorkDay ? [workRange] : [];
  const openBlocks = applyOpenOverrides(baseBlocks, overridesList, workRange);
  const mergedBlocks = openBlocks.flatMap((b) => buildAvailabilityBlocks(b, lunchBreak));

  const fitsInBlock = mergedBlocks.some((b) => startMins >= b.start && endMins <= b.end);
  if (!fitsInBlock) {
    return schedulingFailure(
      "OUTSIDE_WORKING_HOURS",
      "Esse horário está fora do expediente configurado.",
      allowOverride
    );
  }

  const blockRanges = getBlockRanges(overridesList);
  if (hasBlockConflict(startMins, endMins, blockRanges)) {
    return schedulingFailure("BLOCKED_TIME", "Horário está em um período bloqueado.", allowOverride);
  }

  let query = supabase
    .from("appointments")
    .select("id, start_time, end_time")
    .eq("business_id", businessId)
    .eq("appointment_date", date)
    .not("payment_status", "eq", "cancelled");

  if (excludeAppointmentId) {
    query = query.neq("id", excludeAppointmentId);
  }

  const { data: appointments } = await query;

  const occupied = (appointments ?? []).map((a: any) => ({
    start: timeToMinutes(a.start_time),
    end: timeToMinutes(a.end_time),
  }));

  if (hasDirectOccupiedOverlap(startMins, endMins, occupied)) {
    return schedulingFailure(
      "APPOINTMENT_CONFLICT",
      "Existe conflito com outro atendimento.",
      allowOverride
    );
  }

  if (hasOccupiedConflict(startMins, endMins, occupied, buffer)) {
    return schedulingFailure(
      "BUFFER_CONFLICT",
      "Esse horário não respeita o buffer configurado.",
      allowOverride
    );
  }

  return { valid: true };
}

export async function getAvailableSlots(
  businessId: string,
  date: string,
  durationMinutes: number,
  period?: Period,
  bookingMode: boolean = false,
  sessionSeed?: number,
  excludeAppointmentId?: string
) {
  const { data: business } = await supabase
    .from("businesses")
    .select("work_start_time, work_end_time, work_days_of_week, work_hours_by_day, lunch_break_active, lunch_start_time, lunch_end_time, appointment_buffer_minutes")
    .eq("id", businessId)
    .single();

  const workDays: number[] = (business?.work_days_of_week as number[] | null) ?? [1, 2, 3, 4, 5, 6];
  const targetDayOfWeek = getTargetDayOfWeek(date);

  const { workStart, workEnd } = getWorkRange(business, targetDayOfWeek);
  const lunchBreak = getLunchBreak(business);
  const appointmentBufferMinutes = getAppointmentBufferMinutes(business);
  const { data: overrides } = await supabase
    .from("schedule_overrides")
    .select("id, business_id, date, start_time, end_time, type, buffer_before_minutes, buffer_after_minutes")
    .eq("business_id", businessId)
    .eq("date", date);

  let apptQuery = supabase
    .from("appointments")
    .select("start_time, end_time")
    .eq("business_id", businessId)
    .eq("appointment_date", date)
    .not("payment_status", "eq", "cancelled");

  if (excludeAppointmentId) {
    apptQuery = apptQuery.neq("id", excludeAppointmentId);
  }

  const { data: appointments } = await apptQuery;

  const occupied = (appointments ?? []).map((a: any) => ({
    start: timeToMinutes(a.start_time),
    end: timeToMinutes(a.end_time),
  }));

  const slots = buildRealAvailabilitySlots({
    workStart,
    workEnd,
    isWorkDay: workDays.includes(targetDayOfWeek),
    durationMinutes,
    period,
    occupied,
    lunchBreak,
    appointmentBufferMinutes,
    overrides: (overrides ?? []) as ScheduleOverride[],
  });

  if (!bookingMode) return slots;

  const publicSlots =
    date === todayBRT()
      ? slots.filter((slot) => timeToMinutes(slot) >= currentBRTMinutes())
      : slots;
  return curateBookingSlots(publicSlots, date, sessionSeed);
}
