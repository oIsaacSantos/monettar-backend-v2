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
async function getDashboardSummary(businessId) {
    const { data: business } = await supabase
        .from("businesses")
        .select("monthly_goal, desired_pro_labore, reserve_percent, working_capital_percent")
        .eq("id", businessId)
        .single();
    const { data: appointments } = await supabase
        .from("appointments")
        .select("charged_amount, discount, appointment_date, services(material_cost_estimate)")
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
    for (const a of appointments ?? []) {
        const revenue = Number(a.charged_amount ?? 0) - Number(a.discount ?? 0);
        const material = Number(a.services?.material_cost_estimate ?? 0);
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
    }
    const totalFixed = (fixedCosts ?? []).reduce((s, c) => s + Number(c.amount), 0);
    const totalProfit = totalRevenue - totalMaterial - totalFixed;
    const totalAppointments = appointments?.length ?? 0;
    const averageTicket = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;
    const monthlyGoal = Number(business?.monthly_goal ?? 0);
    const goalProgress = monthlyGoal > 0 ? monthRevenue / monthlyGoal : null;
    const proLabore = Number(business?.desired_pro_labore ?? 0);
    const reserve = monthRevenue * Number(business?.reserve_percent ?? 0) / 100;
    const workingCapital = monthRevenue * Number(business?.working_capital_percent ?? 0) / 100;
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
    };
}
