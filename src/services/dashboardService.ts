import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import { currentMonthBRT, todayBRT } from "../utils/date";
import { calculateServiceSupplyCost } from "./suppliesService";
import { calculateOperationalCostPerMinute } from "./financeService";
import { autoConfirmPassedAppointments } from "./appointmentsService";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function toSafeNumber(value: unknown) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function getAppointmentServices(appointment: any) {
  const linkedServices = (appointment.appointment_services ?? [])
    .map((row: any) => Array.isArray(row.services) ? row.services[0] : row.services)
    .filter(Boolean);
  if (linkedServices.length > 0) return linkedServices;
  const service = Array.isArray(appointment.services)
    ? appointment.services[0]
    : appointment.services;
  return service ? [service] : [];
}

function calculateMonthlyGoal(
  businessId: string,
  fixedCosts: number,
  proLabore: number,
  reservePercent: number,
  workingCapitalPercent: number
) {
  const baseGoal = fixedCosts + proLabore;
  const denominator = 1 - reservePercent / 100 - workingCapitalPercent / 100;

  if (denominator <= 0) {
    console.warn("[dashboard] Meta mensal com percentuais invalidos", {
      businessId,
      reservePercent,
      workingCapitalPercent,
    });
    return baseGoal;
  }

  return baseGoal / denominator;
}

function isConfirmedStatus(status: string | null | undefined) {
  return status === "confirmed" || status === "paid";
}

// Interprets appointment_date (YYYY-MM-DD) + end_time (HH:MM) as BRT (UTC-3)
// and returns true if that moment is in the past.
// Uses Date.UTC so the result is server-timezone-independent.
function hasPassedBRT(date: string, endTime: string | null | undefined): boolean {
  const nowUTC = Date.now();
  const [year, month, day] = (date as string).split("-").map(Number);
  const [h, m] = endTime
    ? (endTime as string).slice(0, 5).split(":").map(Number)
    : [23, 59]; // no end_time: treat as end of day
  // BRT h:m = UTC (h+3):m — Date.UTC handles hour overflow correctly
  return Date.UTC(year, month - 1, day, h + 3, m, 0) <= nowUTC;
}

export async function getDashboardSummary(businessId: string) {
  await autoConfirmPassedAppointments(businessId);

  const { data: business } = await supabase
    .from("businesses")
    .select("desired_pro_labore, reserve_percent, working_capital_percent")
    .eq("id", businessId)
    .single();

  const { data: appointments } = await supabase
    .from("appointments")
    .select("charged_amount, discount, appointment_date, end_time, service_id, payment_status, services(id, name, material_cost_estimate), appointment_services(service_id, services(id, name, material_cost_estimate))")
    .eq("business_id", businessId)
    .not("payment_status", "in", '("cancelled","no_show")');

  const operationalCosts = await calculateOperationalCostPerMinute(businessId);

  const today = todayBRT();
  const month = currentMonthBRT();

  let totalRevenue = 0;
  let totalMaterial = 0;
  let todayRevenue = 0;
  let todayAppointments = 0;
  let monthRevenue = 0;              // realized: confirmed/paid AND already happened
  let monthAppointments = 0;         // realized this month count
  let futureConfirmedRevenue = 0;    // confirmed/paid but hasn't happened yet, this month
  let futurePendingRevenue = 0;      // pending and hasn't happened yet, this month
  const serviceCostCache = new Map<string, number>();

  const serviceMap = new Map<string, {
    serviceId: string | null;
    name: string;
    appointments: number;
    revenue: number;
    profit: number;
  }>();

  for (const a of appointments ?? []) {
    const revenue = Number(a.charged_amount ?? 0) - Number(a.discount ?? 0);
    const passed = hasPassedBRT(a.appointment_date, a.end_time);
    const realized = isConfirmedStatus(a.payment_status) && passed;
    const futureConfirmed = isConfirmedStatus(a.payment_status) && !passed;
    const futurePending = a.payment_status === "pending" && !passed;
    const inMonth = (a.appointment_date as string)?.startsWith(month);

    const svc = Array.isArray(a.services) ? a.services[0] : (a.services as any);
    const linkedServices = getAppointmentServices(a);
    let material = Number(svc?.material_cost_estimate ?? 0);
    const serviceIds = linkedServices.map((service: any) => service?.id).filter(Boolean);
    const svcId = serviceIds.length === 1 ? serviceIds[0] : ((a.service_id as string) ?? null);
    const svcName = linkedServices.length > 0
      ? linkedServices.map((service: any) => service?.name ?? "Sem serviço").join(" + ")
      : (svc?.name ?? "Sem serviço");

    if (linkedServices.length > 0) {
      material = 0;
      for (const service of linkedServices) {
        const currentServiceId = (service?.id as string) ?? null;
        let serviceMaterial = Number(service?.material_cost_estimate ?? 0);
        if (currentServiceId) {
          if (!serviceCostCache.has(currentServiceId)) {
            try {
              const calculated = await calculateServiceSupplyCost(currentServiceId, businessId);
              serviceCostCache.set(currentServiceId, calculated.cost);
            } catch (err: any) {
              console.warn("[dashboard] erro ao calcular custo por insumos:", err?.message ?? err);
              serviceCostCache.set(currentServiceId, serviceMaterial);
            }
          }
          serviceMaterial = serviceCostCache.get(currentServiceId) ?? serviceMaterial;
        }
        material += serviceMaterial;
      }
    } else if (svcId) {
      if (!serviceCostCache.has(svcId)) {
        try {
          const calculated = await calculateServiceSupplyCost(svcId, businessId);
          serviceCostCache.set(svcId, calculated.cost);
        } catch (err: any) {
          console.warn("[dashboard] erro ao calcular custo por insumos:", err?.message ?? err);
          serviceCostCache.set(svcId, material);
        }
      }
      material = serviceCostCache.get(svcId) ?? material;
    }

    if (realized) {
      totalRevenue += revenue;
      totalMaterial += material;

      if (a.appointment_date === today) {
        todayRevenue += revenue;
        todayAppointments += 1;
      }
      if (inMonth) {
        monthRevenue += revenue;
        monthAppointments += 1;
      }

      const key = serviceIds.length > 0 ? serviceIds.join("+") : "__none__";
      if (!serviceMap.has(key)) {
        serviceMap.set(key, { serviceId: svcId, name: svcName, appointments: 0, revenue: 0, profit: 0 });
      }
      const entry = serviceMap.get(key)!;
      entry.appointments += 1;
      entry.revenue += revenue;
      entry.profit += revenue - material;
    }

    if (inMonth) {
      if (futureConfirmed) futureConfirmedRevenue += revenue;
      if (futurePending) futurePendingRevenue += revenue;
    }
  }

  const forecastRevenue = futureConfirmedRevenue + futurePendingRevenue;
  const totalFixed = operationalCosts.monthlyOperationalCost;
  const totalProfit = totalRevenue - totalMaterial - totalFixed;
  const totalAppointments = (appointments ?? []).filter((a) => isConfirmedStatus(a.payment_status) && hasPassedBRT(a.appointment_date, a.end_time)).length;
  const averageTicket = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

  const proLabore = toSafeNumber(business?.desired_pro_labore);
  const reservePercent = toSafeNumber(business?.reserve_percent);
  const workingCapitalPercent = toSafeNumber(business?.working_capital_percent);
  const monthlyGoal = calculateMonthlyGoal(
    businessId,
    totalFixed,
    proLabore,
    reservePercent,
    workingCapitalPercent
  );
  const projectedMonthRevenue = monthRevenue + forecastRevenue;
  const goalProgress = monthlyGoal > 0 ? monthRevenue / monthlyGoal : null;
  const forecastProgress = monthlyGoal > 0 ? projectedMonthRevenue / monthlyGoal : null;
  const remainingGoal = Math.max((monthlyGoal || 0) - monthRevenue, 0);
  const reserve = monthRevenue * reservePercent / 100;
  const workingCapital = monthRevenue * workingCapitalPercent / 100;

  const servicesBreakdown = Array.from(serviceMap.values())
    .sort((a, b) => b.revenue - a.revenue);

  return {
    businessId,
    // Explicit realized fields — use these in the UI, not monthSummary
    realizedRevenue: monthRevenue,
    realizedAppointmentsCount: monthAppointments,
    // Forecast / projection
    forecastRevenue,
    futureConfirmedRevenue,
    futurePendingRevenue,
    projectedMonthRevenue,
    // Goal
    monthlyGoal: monthlyGoal || null,
    goalProgress,
    forecastProgress,
    remainingGoal,
    // All-time totals (realized only)
    totalRevenue,
    totalProfit,
    totalAppointments,
    averageTicket,
    totalFixedCosts: totalFixed,
    monthlyOperationalCost: operationalCosts.monthlyOperationalCost,
    monthlyWorkMinutes: operationalCosts.monthlyWorkMinutes,
    operationalCostPerMinute: operationalCosts.operationalCostPerMinute,
    distribution: {
      proLabore,
      reserve,
      workingCapital,
      remaining: monthRevenue - proLabore - reserve - workingCapital,
    },
    todaySummary: {
      totalRevenue: todayRevenue,
      totalAppointments: todayAppointments,
      totalProfit: todayRevenue,
    },
    // monthSummary kept for backward compat — mirrors realizedRevenue
    monthSummary: {
      totalRevenue: monthRevenue,
      totalAppointments: monthAppointments,
      totalProfit: monthRevenue - totalMaterial,
    },
    servicesBreakdown,
    reservePercent,
    workingCapitalPercent,
  };
}
