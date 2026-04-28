"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardSummary = getDashboardSummary;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function toSafeNumber(value) {
    const numericValue = Number(value ?? 0);
    return Number.isFinite(numericValue) ? numericValue : 0;
}
function calculateMonthlyGoal(businessId, fixedCosts, proLabore, reservePercent, workingCapitalPercent) {
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
async function getDashboardSummary(businessId) {
    const { data: business } = await supabase
        .from("businesses")
        .select("desired_pro_labore, reserve_percent, working_capital_percent")
        .eq("id", businessId)
        .single();
    const { data: appointments } = await supabase
        .from("appointments")
        .select("charged_amount, discount, appointment_date, service_id, services(id, name, material_cost_estimate)")
        .eq("business_id", businessId);
    const { data: fixedCosts } = await supabase
        .from("fixed_costs")
        .select("amount")
        .eq("business_id", businessId);
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);
    let totalRevenue = 0;
    let totalMaterial = 0;
    let todayRevenue = 0;
    let todayAppointments = 0;
    let monthRevenue = 0;
    let monthAppointments = 0;
    const serviceMap = new Map();
    for (const a of appointments ?? []) {
        const revenue = Number(a.charged_amount ?? 0) - Number(a.discount ?? 0);
        const svc = Array.isArray(a.services) ? a.services[0] : a.services;
        const material = Number(svc?.material_cost_estimate ?? 0);
        const svcId = a.service_id ?? null;
        const svcName = svc?.name ?? "Sem serviço";
        totalRevenue += revenue;
        totalMaterial += material;
        if (a.appointment_date === today) {
            todayRevenue += revenue;
            todayAppointments += 1;
        }
        if (a.appointment_date?.startsWith(month)) {
            monthRevenue += revenue;
            monthAppointments += 1;
        }
        const key = svcId ?? "__none__";
        if (!serviceMap.has(key)) {
            serviceMap.set(key, { serviceId: svcId, name: svcName, appointments: 0, revenue: 0, profit: 0 });
        }
        const entry = serviceMap.get(key);
        entry.appointments += 1;
        entry.revenue += revenue;
        entry.profit += revenue - material;
    }
    const totalFixed = (fixedCosts ?? []).reduce((s, c) => s + toSafeNumber(c.amount), 0);
    const totalProfit = totalRevenue - totalMaterial - totalFixed;
    const totalAppointments = appointments?.length ?? 0;
    const averageTicket = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;
    const proLabore = toSafeNumber(business?.desired_pro_labore);
    const reservePercent = toSafeNumber(business?.reserve_percent);
    const workingCapitalPercent = toSafeNumber(business?.working_capital_percent);
    const monthlyGoal = calculateMonthlyGoal(businessId, totalFixed, proLabore, reservePercent, workingCapitalPercent);
    const goalProgress = monthlyGoal > 0 ? monthRevenue / monthlyGoal : null;
    const reserve = monthRevenue * reservePercent / 100;
    const workingCapital = monthRevenue * workingCapitalPercent / 100;
    const servicesBreakdown = Array.from(serviceMap.values())
        .sort((a, b) => b.revenue - a.revenue);
    return {
        businessId,
        totalRevenue,
        totalProfit,
        totalAppointments,
        averageTicket,
        monthlyGoal: monthlyGoal || null,
        goalProgress,
        totalFixedCosts: totalFixed,
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
