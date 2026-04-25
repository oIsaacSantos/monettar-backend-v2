"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientsWithStats = getClientsWithStats;
exports.createClient = createClient;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function getClientsWithStats(businessId) {
    const { data, error } = await supabase
        .from("clients")
        .select(`
      id, name, phone,
      appointments(id, appointment_date, charged_amount, discount, payment_status, services(name))
    `)
        .eq("business_id", businessId)
        .order("name", { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((c) => {
        const appts = Array.isArray(c.appointments) ? c.appointments : [];
        const sorted = [...appts].sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
        return {
            id: c.id,
            name: c.name,
            phone: c.phone,
            totalAppointments: appts.length,
            firstAppointment: sorted[0]?.appointment_date ?? null,
            lastAppointment: sorted[sorted.length - 1]?.appointment_date ?? null,
            appointments: sorted.map((a) => ({
                id: a.id,
                date: a.appointment_date,
                service: Array.isArray(a.services)
                    ? (a.services[0]?.name ?? "Serviço não informado")
                    : (a.services?.name ?? "Serviço não informado"),
                value: Number(a.charged_amount ?? 0) - Number(a.discount ?? 0),
                status: a.payment_status,
            })),
        };
    });
}
async function createClient(businessId, payload) {
    const { data, error } = await supabase
        .from("clients")
        .insert({
        business_id: businessId,
        name: payload.name,
        phone: payload.phone,
    })
        .select()
        .single();
    if (error)
        throw new Error(error.message);
    return data;
}
