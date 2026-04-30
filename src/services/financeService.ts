import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import { currentMonthBRT } from "../utils/date";
import { calculateServiceSupplyCost } from "./suppliesService";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type WorkHoursByDay = Record<string, { start: string; end: string }>;

function toSafeNumber(value: unknown) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeSharePercent(value: unknown) {
  const percent = toSafeNumber(value ?? 100);
  if (percent < 0) return 0;
  if (percent > 100) return 100;
  return percent;
}

function isValidTime(time: unknown): time is string {
  return typeof time === "string" && /^(\d{2}):(\d{2})(?::\d{2})?$/.test(time);
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function getDaysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function getDayOfWeek(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function getWorkRange(business: any, dayOfWeek: number) {
  const workHoursByDay = business?.work_hours_by_day as WorkHoursByDay | null;
  const dayKey = String(dayOfWeek);
  const start = workHoursByDay?.[dayKey]?.start ?? business?.work_start_time ?? "08:00";
  const end = workHoursByDay?.[dayKey]?.end ?? business?.work_end_time ?? "19:00";

  if (!isValidTime(start) || !isValidTime(end)) {
    return { start: 0, end: 0 };
  }

  return { start: timeToMinutes(start), end: timeToMinutes(end) };
}

function getLunchMinutes(business: any, workStart: number, workEnd: number) {
  if (!business?.lunch_break_active) return 0;
  if (!isValidTime(business.lunch_start_time) || !isValidTime(business.lunch_end_time)) {
    return 0;
  }

  const lunchStart = timeToMinutes(business.lunch_start_time);
  const lunchEnd = timeToMinutes(business.lunch_end_time);
  if (lunchEnd <= lunchStart) return 0;

  const overlapStart = Math.max(workStart, lunchStart);
  const overlapEnd = Math.min(workEnd, lunchEnd);
  return Math.max(0, overlapEnd - overlapStart);
}

export async function calculateMonthlyOperationalCost(businessId: string) {
  const { data, error } = await supabase
    .from("fixed_costs")
    .select("amount, business_share_percent")
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);

  return (data ?? []).reduce((sum: number, cost: any) => {
    const amount = toSafeNumber(cost.amount);
    const sharePercent = normalizeSharePercent(cost.business_share_percent);
    return sum + amount * (sharePercent / 100);
  }, 0);
}

export async function calculateMonthlyWorkMinutes(businessId: string, month = currentMonthBRT()) {
  const { data: business, error } = await supabase
    .from("businesses")
    .select("work_start_time, work_end_time, work_days_of_week, work_hours_by_day, lunch_break_active, lunch_start_time, lunch_end_time")
    .eq("id", businessId)
    .single();

  if (error) throw new Error(error.message);

  const workDays: number[] = Array.isArray(business?.work_days_of_week)
    ? business.work_days_of_week
    : [1, 2, 3, 4, 5, 6];

  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = getDaysInMonth(month);
  let total = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayOfWeek = getDayOfWeek(date);
    if (!workDays.includes(dayOfWeek)) continue;

    const range = getWorkRange(business, dayOfWeek);
    const grossMinutes = Math.max(0, range.end - range.start);
    const lunchMinutes = getLunchMinutes(business, range.start, range.end);
    total += Math.max(0, grossMinutes - lunchMinutes);
  }

  return total;
}

export async function calculateOperationalCostPerMinute(businessId: string) {
  const [monthlyOperationalCost, monthlyWorkMinutes] = await Promise.all([
    calculateMonthlyOperationalCost(businessId),
    calculateMonthlyWorkMinutes(businessId),
  ]);

  return {
    monthlyOperationalCost,
    monthlyWorkMinutes,
    operationalCostPerMinute:
      monthlyWorkMinutes > 0 ? monthlyOperationalCost / monthlyWorkMinutes : 0,
  };
}

export async function calculateServiceOperationalCost(serviceId: string, businessId: string) {
  const { data: service, error } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .eq("business_id", businessId)
    .single();

  if (error) throw new Error(error.message);

  const operational = await calculateOperationalCostPerMinute(businessId);
  return toSafeNumber(service?.duration_minutes) * operational.operationalCostPerMinute;
}

export async function calculateServiceTotalCost(serviceId: string, businessId: string) {
  const [supplyCost, operationalCost] = await Promise.all([
    calculateServiceSupplyCost(serviceId, businessId),
    calculateServiceOperationalCost(serviceId, businessId),
  ]);

  return {
    supplyCost: supplyCost.cost,
    operationalCost,
    totalCost: supplyCost.cost + operationalCost,
    supplyCostSource: supplyCost.source,
    supplyBreakdown: supplyCost.breakdown,
  };
}
