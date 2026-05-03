"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateMonthlyOperationalCost = calculateMonthlyOperationalCost;
exports.calculateMonthlyWorkMinutes = calculateMonthlyWorkMinutes;
exports.calculateOperationalCostPerMinute = calculateOperationalCostPerMinute;
exports.calculateServiceOperationalCost = calculateServiceOperationalCost;
exports.calculateServiceTotalCost = calculateServiceTotalCost;
exports.calculateAppointmentFinancials = calculateAppointmentFinancials;
exports.calculateMonthlyFinancialSummary = calculateMonthlyFinancialSummary;
exports.calculateMonthlyFinancialEvolution = calculateMonthlyFinancialEvolution;
exports.calculateServiceRanking = calculateServiceRanking;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase_js_1 = require("@supabase/supabase-js");
const date_1 = require("../utils/date");
const signal_1 = require("../utils/signal");
const suppliesService_1 = require("./suppliesService");
const appointmentsService_1 = require("./appointmentsService");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const MERCADO_PAGO_SIGNAL_FEE_RATE = 0.0099;
function toSafeNumber(value) {
    const numericValue = Number(value ?? 0);
    return Number.isFinite(numericValue) ? numericValue : 0;
}
function getAppointmentServices(appointment) {
    const linkedServices = (appointment.appointment_services ?? [])
        .map((row) => Array.isArray(row.services) ? row.services[0] : row.services)
        .filter(Boolean);
    if (linkedServices.length > 0)
        return linkedServices;
    const service = Array.isArray(appointment.services)
        ? appointment.services[0]
        : appointment.services;
    return service ? [service] : [];
}
function normalizeSharePercent(value) {
    const percent = toSafeNumber(value ?? 100);
    if (percent < 0)
        return 0;
    if (percent > 100)
        return 100;
    return percent;
}
function isValidTime(time) {
    return typeof time === "string" && /^(\d{2}):(\d{2})(?::\d{2})?$/.test(time);
}
function timeToMinutes(time) {
    const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
    return hours * 60 + minutes;
}
function getDaysInMonth(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    return new Date(year, monthNumber, 0).getDate();
}
function getMonthRange(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new Error("Mes invalido. Use o formato YYYY-MM.");
    }
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return {
        start: `${month}-01`,
        end: `${month}-${String(lastDay).padStart(2, "0")}`,
    };
}
function getPreviousMonth(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new Error("Mes invalido. Use o formato YYYY-MM.");
    }
    const [year, monthNumber] = month.split("-").map(Number);
    const previous = new Date(Date.UTC(year, monthNumber - 2, 1, 12));
    return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}
function getMonthOffset(month, offset) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new Error("Mes invalido. Use o formato YYYY-MM.");
    }
    const [year, monthNumber] = month.split("-").map(Number);
    const target = new Date(Date.UTC(year, monthNumber - 1 + offset, 1, 12));
    return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}
function getDayOfWeek(date) {
    return new Date(`${date}T12:00:00Z`).getUTCDay();
}
function getWorkRange(business, dayOfWeek) {
    const workHoursByDay = business?.work_hours_by_day;
    const dayKey = String(dayOfWeek);
    const start = workHoursByDay?.[dayKey]?.start ?? business?.work_start_time ?? "08:00";
    const end = workHoursByDay?.[dayKey]?.end ?? business?.work_end_time ?? "19:00";
    if (!isValidTime(start) || !isValidTime(end)) {
        return { start: 0, end: 0 };
    }
    return { start: timeToMinutes(start), end: timeToMinutes(end) };
}
function getLunchMinutes(business, workStart, workEnd) {
    if (!business?.lunch_break_active)
        return 0;
    if (!isValidTime(business.lunch_start_time) || !isValidTime(business.lunch_end_time)) {
        return 0;
    }
    const lunchStart = timeToMinutes(business.lunch_start_time);
    const lunchEnd = timeToMinutes(business.lunch_end_time);
    if (lunchEnd <= lunchStart)
        return 0;
    const overlapStart = Math.max(workStart, lunchStart);
    const overlapEnd = Math.min(workEnd, lunchEnd);
    return Math.max(0, overlapEnd - overlapStart);
}
function emptyMonthlySummary(month) {
    return {
        month,
        revenue: 0,
        supplyCost: 0,
        operationalCost: 0,
        mercadoPagoFees: 0,
        totalCost: 0,
        profit: 0,
        margin: 0,
        appointmentsCount: 0,
        averageTicket: 0,
        breakdown: {
            suppliesCost: 0,
            operationalCost: 0,
            mercadoPagoFees: 0,
            fixedCosts: 0,
        },
    };
}
async function calculateMonthlyOperationalCost(businessId) {
    const { data, error } = await supabase
        .from("fixed_costs")
        .select("amount, business_share_percent")
        .eq("business_id", businessId);
    if (error)
        throw new Error(error.message);
    return (data ?? []).reduce((sum, cost) => {
        const amount = toSafeNumber(cost.amount);
        const sharePercent = normalizeSharePercent(cost.business_share_percent);
        return sum + amount * (sharePercent / 100);
    }, 0);
}
async function calculateMonthlyWorkMinutes(businessId, month = (0, date_1.currentMonthBRT)()) {
    const { data: business, error } = await supabase
        .from("businesses")
        .select("work_start_time, work_end_time, work_days_of_week, work_hours_by_day, lunch_break_active, lunch_start_time, lunch_end_time")
        .eq("id", businessId)
        .single();
    if (error)
        throw new Error(error.message);
    const workDays = Array.isArray(business?.work_days_of_week)
        ? business.work_days_of_week
        : [1, 2, 3, 4, 5, 6];
    const [year, monthNumber] = month.split("-").map(Number);
    const daysInMonth = getDaysInMonth(month);
    let total = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayOfWeek = getDayOfWeek(date);
        if (!workDays.includes(dayOfWeek))
            continue;
        const range = getWorkRange(business, dayOfWeek);
        const grossMinutes = Math.max(0, range.end - range.start);
        const lunchMinutes = getLunchMinutes(business, range.start, range.end);
        total += Math.max(0, grossMinutes - lunchMinutes);
    }
    return total;
}
async function calculateOperationalCostPerMinute(businessId) {
    const [monthlyOperationalCost, monthlyWorkMinutes] = await Promise.all([
        calculateMonthlyOperationalCost(businessId),
        calculateMonthlyWorkMinutes(businessId),
    ]);
    return {
        monthlyOperationalCost,
        monthlyWorkMinutes,
        operationalCostPerMinute: monthlyWorkMinutes > 0 ? monthlyOperationalCost / monthlyWorkMinutes : 0,
    };
}
async function calculateServiceOperationalCost(serviceId, businessId) {
    const { data: service, error } = await supabase
        .from("services")
        .select("duration_minutes")
        .eq("id", serviceId)
        .eq("business_id", businessId)
        .single();
    if (error)
        throw new Error(error.message);
    const operational = await calculateOperationalCostPerMinute(businessId);
    return toSafeNumber(service?.duration_minutes) * operational.operationalCostPerMinute;
}
async function calculateServiceTotalCost(serviceId, businessId) {
    const [supplyCost, operationalCost] = await Promise.all([
        (0, suppliesService_1.calculateServiceSupplyCost)(serviceId, businessId),
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
async function calculateAppointmentFinancials(appointment, business, operationalCostPerMinute) {
    const revenue = toSafeNumber(appointment.charged_amount) - toSafeNumber(appointment.discount);
    const services = getAppointmentServices(appointment);
    const durationMinutes = services.reduce((sum, service) => sum + toSafeNumber(service?.duration_minutes), 0);
    let supplyCost = services.reduce((sum, service) => sum + toSafeNumber(service?.material_cost_estimate), 0);
    if (services.length > 0) {
        try {
            const costs = await Promise.all(services
                .map((service) => service?.id)
                .filter(Boolean)
                .map((serviceId) => (0, suppliesService_1.calculateServiceSupplyCost)(serviceId, business.id)));
            supplyCost = costs.reduce((sum, item) => sum + item.cost, 0);
        }
        catch (err) {
            console.warn("[finance] erro ao calcular insumos do appointment:", err?.message ?? err);
        }
    }
    const costPerMinute = operationalCostPerMinute
        ?? (await calculateOperationalCostPerMinute(business.id)).operationalCostPerMinute;
    const operationalCost = durationMinutes * costPerMinute;
    const signalAmount = (0, signal_1.calculateSignalAmount)({
        signalType: business?.signal_type,
        signalValue: business?.signal_value,
        signalBaseValue: business?.signal_base_value,
        signalPer30Min: business?.signal_per_30min,
        durationMinutes,
        revenue,
    });
    const mercadoPagoFee = signalAmount * MERCADO_PAGO_SIGNAL_FEE_RATE;
    const totalCost = supplyCost + operationalCost + mercadoPagoFee;
    const profit = revenue - totalCost;
    return {
        revenue,
        supplyCost,
        operationalCost,
        signalAmount,
        mercadoPagoFee,
        totalCost,
        profit,
        margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    };
}
async function calculateSingleMonthlyFinancialSummary(businessId, month) {
    await (0, appointmentsService_1.autoConfirmPassedAppointments)(businessId);
    const range = getMonthRange(month);
    const { data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, signal_type, signal_value, signal_base_value, signal_per_30min")
        .eq("id", businessId)
        .single();
    if (businessError)
        throw new Error(businessError.message);
    const { data: appointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select(`
      id,
      service_id,
      appointment_date,
      charged_amount,
      discount,
      payment_status,
      services(id, duration_minutes, material_cost_estimate),
      appointment_services(service_id, services(id, duration_minutes, material_cost_estimate))
    `)
        .eq("business_id", businessId)
        .gte("appointment_date", range.start)
        .lte("appointment_date", range.end)
        .in("payment_status", ["confirmed", "paid"]);
    if (appointmentsError)
        throw new Error(appointmentsError.message);
    const operational = await calculateOperationalCostPerMinute(businessId);
    const summary = emptyMonthlySummary(month);
    for (const appointment of appointments ?? []) {
        const financials = await calculateAppointmentFinancials(appointment, business, operational.operationalCostPerMinute);
        summary.revenue += financials.revenue;
        summary.supplyCost += financials.supplyCost;
        summary.operationalCost += financials.operationalCost;
        summary.mercadoPagoFees += financials.mercadoPagoFee;
        summary.totalCost += financials.totalCost;
        summary.profit += financials.profit;
        summary.appointmentsCount += 1;
    }
    summary.margin = summary.revenue > 0 ? (summary.profit / summary.revenue) * 100 : 0;
    summary.averageTicket = summary.appointmentsCount > 0
        ? summary.revenue / summary.appointmentsCount
        : 0;
    summary.totalCost = summary.supplyCost + summary.operationalCost + summary.mercadoPagoFees;
    summary.breakdown = {
        suppliesCost: summary.supplyCost,
        operationalCost: summary.operationalCost,
        mercadoPagoFees: summary.mercadoPagoFees,
        fixedCosts: operational.monthlyOperationalCost,
    };
    return summary;
}
async function calculateMonthlyFinancialSummary(businessId, month = (0, date_1.currentMonthBRT)()) {
    const current = await calculateSingleMonthlyFinancialSummary(businessId, month);
    const previous = await calculateSingleMonthlyFinancialSummary(businessId, getPreviousMonth(month));
    return {
        ...current,
        previousMonth: {
            month: previous.month,
            revenue: previous.revenue,
            supplyCost: previous.supplyCost,
            operationalCost: previous.operationalCost,
            mercadoPagoFees: previous.mercadoPagoFees,
            totalCost: previous.totalCost,
            profit: previous.profit,
            margin: previous.margin,
            appointmentsCount: previous.appointmentsCount,
            averageTicket: previous.averageTicket,
            breakdown: previous.breakdown,
        },
    };
}
async function calculateMonthlyFinancialEvolution(businessId, months = 6) {
    const safeMonths = Math.max(1, Math.min(24, Math.trunc(months) || 6));
    const currentMonth = (0, date_1.currentMonthBRT)();
    const result = [];
    for (let index = safeMonths - 1; index >= 0; index--) {
        const month = getMonthOffset(currentMonth, -index);
        const summary = await calculateMonthlyFinancialSummary(businessId, month);
        result.push({
            month: summary.month,
            revenue: summary.revenue,
            totalCost: summary.totalCost,
            profit: summary.profit,
            margin: summary.margin,
            appointmentsCount: summary.appointmentsCount,
            averageTicket: summary.averageTicket,
        });
    }
    return result;
}
async function calculateServiceRanking(businessId, month = (0, date_1.currentMonthBRT)()) {
    await (0, appointmentsService_1.autoConfirmPassedAppointments)(businessId);
    const range = getMonthRange(month);
    const { data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, signal_type, signal_value, signal_base_value, signal_per_30min")
        .eq("id", businessId)
        .single();
    if (businessError)
        throw new Error(businessError.message);
    const { data: appointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select(`
      id,
      service_id,
      appointment_date,
      charged_amount,
      discount,
      payment_status,
      services(id, name, duration_minutes, material_cost_estimate),
      appointment_services(service_id, services(id, name, duration_minutes, material_cost_estimate))
    `)
        .eq("business_id", businessId)
        .gte("appointment_date", range.start)
        .lte("appointment_date", range.end)
        .in("payment_status", ["confirmed", "paid"]);
    if (appointmentsError)
        throw new Error(appointmentsError.message);
    const operational = await calculateOperationalCostPerMinute(businessId);
    const serviceMap = new Map();
    for (const appointment of appointments ?? []) {
        const services = getAppointmentServices(appointment);
        const serviceIds = services.map((service) => service?.id).filter(Boolean);
        const serviceId = serviceIds.length === 1
            ? serviceIds[0]
            : (appointment.service_id ?? null);
        const key = serviceIds.length > 0 ? serviceIds.join("+") : "unknown";
        const serviceName = services.length > 0
            ? services.map((service) => service?.name ?? "Servico sem nome").join(" + ")
            : "Servico sem nome";
        const financials = await calculateAppointmentFinancials(appointment, business, operational.operationalCostPerMinute);
        if (!serviceMap.has(key)) {
            serviceMap.set(key, {
                serviceId,
                serviceName,
                totalRevenue: 0,
                totalCost: 0,
                totalProfit: 0,
                averageMargin: 0,
                appointmentsCount: 0,
                marginSum: 0,
            });
        }
        const item = serviceMap.get(key);
        item.totalRevenue += financials.revenue;
        item.totalCost += financials.totalCost;
        item.totalProfit += financials.profit;
        item.marginSum += financials.margin;
        item.appointmentsCount += 1;
    }
    const items = Array.from(serviceMap.values()).map(({ marginSum, ...item }) => ({
        ...item,
        averageMargin: item.appointmentsCount > 0 ? marginSum / item.appointmentsCount : 0,
    }));
    const limit = 5;
    return {
        mostProfitable: [...items].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, limit),
        leastProfitable: [...items].sort((a, b) => a.totalProfit - b.totalProfit).slice(0, limit),
        highestRevenue: [...items].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, limit),
        lowestMargin: [...items].sort((a, b) => a.averageMargin - b.averageMargin).slice(0, limit),
    };
}
