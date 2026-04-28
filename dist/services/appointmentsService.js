"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAppointment = updateAppointment;
exports.deleteAppointment = deleteAppointment;
exports.getAllAppointments = getAllAppointments;
exports.getAppointmentsByMonth = getAppointmentsByMonth;
exports.getAppointmentsByDate = getAppointmentsByDate;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function updateAppointment(id, businessId, payload) {
    const { data, error } = await supabase
        .from("appointments")
        .update({
        service_id: payload.serviceId,
        appointment_date: payload.date,
        start_time: payload.startTime,
        end_time: payload.endTime,
        charged_amount: payload.chargedAmount,
        payment_status: payload.paymentStatus,
        notes: payload.notes,
    })
        .eq("id", id)
        .eq("business_id", businessId)
        .select()
        .single();
    if (error)
        throw new Error(error.message);
    return data;
}
async function deleteAppointment(id, businessId) {
    const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", id)
        .eq("business_id", businessId);
    if (error)
        throw new Error(error.message);
    return { success: true };
}
async function getAllAppointments(businessId) {
    const { data, error } = await supabase
        .from("appointments")
        .select(`
      id,
      appointment_date,
      start_time,
      end_time,
      charged_amount,
      discount,
      payment_status,
      notes,
      clients(id, name, phone),
      services(id, name, duration_minutes)
    `)
        .eq("business_id", businessId)
        .order("appointment_date", { ascending: false })
        .order("start_time", { ascending: false });
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((a) => ({
        ...a,
        clients: Array.isArray(a.clients) ? (a.clients[0] ?? null) : a.clients,
        services: Array.isArray(a.services) ? (a.services[0] ?? null) : a.services,
    }));
}
async function getAppointmentsByMonth(businessId, year, month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const { data, error } = await supabase
        .from("appointments")
        .select(`id, appointment_date, start_time, end_time, charged_amount, discount, payment_status, clients(id, name), services(id, name)`)
        .eq("business_id", businessId)
        .gte("appointment_date", start)
        .lte("appointment_date", end)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((a) => ({
        ...a,
        clients: Array.isArray(a.clients) ? (a.clients[0] ?? null) : a.clients,
        services: Array.isArray(a.services) ? (a.services[0] ?? null) : a.services,
    }));
}
async function getAppointmentsByDate(businessId, date) {
    const { data, error } = await supabase
        .from("appointments")
        .select(`
      id,
      appointment_date,
      start_time,
      end_time,
      charged_amount,
      discount,
      payment_status,
      notes,
      clients(id, name, phone),
      services(id, name, duration_minutes)
    `)
        .eq("business_id", businessId)
        .eq("appointment_date", date)
        .order("start_time", { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((appt) => ({
        ...appt,
        clients: Array.isArray(appt.clients)
            ? (appt.clients[0] ?? null)
            : appt.clients,
        services: Array.isArray(appt.services)
            ? (appt.services[0] ?? null)
            : appt.services,
    }));
}
