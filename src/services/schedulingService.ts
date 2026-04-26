import { createClient } from "@supabase/supabase-js";
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
  bookingMode: boolean = false
) {
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

  let maxSlots: number;
  if (daysAhead <= 7) maxSlots = 2;
  else if (daysAhead <= 20) maxSlots = 3;
  else maxSlots = 4;

  const curated: string[] = [];

  if (slots.length <= maxSlots) {
    curated.push(...slots);
  } else {
    const step = Math.floor(slots.length / maxSlots);
    for (let i = 0; i < maxSlots; i++) {
      curated.push(slots[Math.min(i * step, slots.length - 1)]);
    }
  }

  console.log("[scheduling] bookingMode:", bookingMode);
  console.log("[scheduling] daysAhead:", daysAhead);
  console.log("[scheduling] slots disponíveis:", slots.length, slots);
  console.log("[scheduling] maxSlots:", maxSlots);
  console.log("[scheduling] curated:", curated);

  return curated;
}
