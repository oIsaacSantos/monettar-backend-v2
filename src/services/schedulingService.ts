import { createClient } from "@supabase/supabase-js";
import { todayBRT } from "../utils/date";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function getAvailableSlots(
  businessId: string,
  date: string,
  durationMinutes: number,
  period?: "morning" | "afternoon" | "evening",
  bookingMode: boolean = false,
  sessionSeed?: number
) {
  const { data: business } = await supabase
    .from("businesses")
    .select("work_start_time, work_end_time, work_days_of_week, work_hours_by_day")
    .eq("id", businessId)
    .single();

  const workDays: number[] = (business?.work_days_of_week as number[] | null) ?? [1, 2, 3, 4, 5, 6];
  const targetDayOfWeek = new Date(date + "T12:00:00Z").getUTCDay();
  console.log("[scheduling] business.work_days_of_week:", business?.work_days_of_week, typeof business?.work_days_of_week);
  console.log("[scheduling] targetDayOfWeek:", targetDayOfWeek);
  console.log("[scheduling] workDays:", workDays);
  console.log("[scheduling] includes check:", workDays.includes(targetDayOfWeek));
  if (!workDays.includes(targetDayOfWeek)) {
    return [];
  }

  const workHoursByDay = business?.work_hours_by_day as Record<string, { start: string; end: string }> | null;
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
  const occupied = (appointments ?? []).map((a: any) => ({
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

  const slots: string[] = [];
  let current = rangeStart;

  while (current + durationMinutes <= rangeEnd) {
    const slotEnd = current + durationMinutes;
    const isLunch = current < lunchEnd && slotEnd > lunchStart;
    const isOccupied = occupied.some(
      (o) => current < o.end + buffer && slotEnd > o.start - buffer
    );
    if (!isLunch && !isOccupied) {
      slots.push(minutesToTime(current));
    }
    current += 30;
  }

  if (!bookingMode) return slots;

  const [todayYear, todayMonth, todayDay] = todayBRT().split("-").map(Number);
  const todayDateEpoch = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const [year, month, day] = date.split("-").map(Number);
  const targetDateEpoch = Date.UTC(year, month - 1, day);
  const daysAhead = Math.floor((targetDateEpoch - todayDateEpoch) / (1000 * 60 * 60 * 24));

  let maxSlots: number;
  if (daysAhead <= 7) maxSlots = 2;
  else if (daysAhead <= 20) maxSlots = 3;
  else maxSlots = 4;

  if (slots.length <= maxSlots) return slots;

  const dateSeed = year * 10000 + month * 100 + day;
  const combinedSeed = ((sessionSeed ?? 0) + dateSeed) % 999983;

  let s = combinedSeed === 0 ? 12345 : combinedSeed;
  const rng = () => {
    s = Math.imul(1664525, s) + 1013904223;
    s = s >>> 0;
    return s / 4294967296;
  };

  const arr = [...slots];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  const morning = arr.filter((t) => parseInt(t.split(":")[0]) < 12);
  const afternoon = arr.filter((t) => parseInt(t.split(":")[0]) >= 12);

  const result: string[] = [];

  if (morning.length > 0 && afternoon.length > 0) {
    result.push(morning[0]);
    result.push(afternoon[0]);
    for (const slot of arr) {
      if (result.length >= maxSlots) break;
      if (!result.includes(slot)) result.push(slot);
    }
  } else {
    result.push(...arr.slice(0, maxSlots));
  }

  result.sort();
  return result;
}
