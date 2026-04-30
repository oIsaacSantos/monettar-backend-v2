"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppointment = createAppointment;
exports.updateAppointment = updateAppointment;
exports.deleteAppointment = deleteAppointment;
exports.getAllAppointments = getAllAppointments;
exports.getAppointmentsByMonth = getAppointmentsByMonth;
exports.getAppointmentsByDate = getAppointmentsByDate;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function normalizePaymentStatus(status) {
    return status === "paid" ? "confirmed" : (status ?? "pending");
}
function normalizeAppointmentServices(appointment) {
    const linkedServices = (appointment.appointment_services ?? [])
        .map((row) => {
        const service = Array.isArray(row.services) ? row.services[0] : row.services;
        return service ? {
            ...service,
            price: row.price ?? service.current_price ?? null,
            duration_minutes: row.duration_minutes ?? service.duration_minutes ?? null,
        } : null;
    })
        .filter(Boolean);
    const legacyService = Array.isArray(appointment.services)
        ? (appointment.services[0] ?? null)
        : appointment.services;
    const servicesList = linkedServices.length > 0
        ? linkedServices
        : (legacyService ? [legacyService] : []);
    return {
        ...appointment,
        services: servicesList[0] ?? legacyService ?? null,
        services_list: servicesList,
    };
}
async function replaceAppointmentServices(appointmentId, services) {
    await supabase.from("appointment_services").delete().eq("appointment_id", appointmentId);
    if (services.length === 0)
        return;
    const rowsWithSnapshots = services.map((service) => ({
        appointment_id: appointmentId,
        service_id: service.service_id,
        price: service.price ?? null,
        duration_minutes: service.duration_minutes ?? null,
    }));
    const { error } = await supabase.from("appointment_services").insert(rowsWithSnapshots);
    if (!error)
        return;
    if (error.code !== "42703")
        throw new Error(error.message);
    const fallbackRows = services.map((service) => ({
        appointment_id: appointmentId,
        service_id: service.service_id,
    }));
    const fallback = await supabase.from("appointment_services").insert(fallbackRows);
    if (fallback.error)
        throw new Error(fallback.error.message);
}
async function createAppointment(payload) {
    const { data, error } = await supabase
        .from("appointments")
        .insert({
        business_id: payload.businessId,
        client_id: payload.clientId,
        service_id: payload.serviceId,
        appointment_date: payload.appointmentDate,
        start_time: payload.startTime,
        end_time: payload.endTime,
        charged_amount: payload.chargedAmount,
        discount: 0,
        payment_status: normalizePaymentStatus(payload.status),
        notes: payload.notes?.trim() || null,
        quantity: 1,
    })
        .select("id")
        .single();
    if (error)
        throw new Error(error.message);
    await replaceAppointmentServices(data.id, [{ service_id: payload.serviceId }]);
    return data;
}
async function updateAppointment(id, businessId, payload) {
    const { data, error } = await supabase
        .from("appointments")
        .update({
        service_id: payload.serviceId,
        appointment_date: payload.date,
        start_time: payload.startTime,
        end_time: payload.endTime,
        charged_amount: payload.chargedAmount,
        payment_status: payload.paymentStatus ? normalizePaymentStatus(payload.paymentStatus) : undefined,
        notes: payload.notes,
    })
        .eq("id", id)
        .eq("business_id", businessId)
        .select()
        .single();
    if (error)
        throw new Error(error.message);
    if (payload.serviceId) {
        await replaceAppointmentServices(id, [{ service_id: payload.serviceId }]);
    }
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
async function getAllAppointments(businessId, page, limit) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await supabase
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
      services(id, name, duration_minutes),
      appointment_services(service_id, services(id, name, current_price, duration_minutes))
    `, { count: "exact" })
        .eq("business_id", businessId)
        .order("appointment_date", { ascending: false })
        .order("start_time", { ascending: false })
        .range(from, to);
    if (error)
        throw new Error(error.message);
    const appointments = (data ?? []).map((a) => normalizeAppointmentServices({
        ...a,
        clients: Array.isArray(a.clients) ? (a.clients[0] ?? null) : a.clients,
    }));
    return {
        data: appointments,
        total: count ?? 0,
        page,
        limit,
    };
}
async function getAppointmentsByMonth(businessId, year, month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const { data, error } = await supabase
        .from("appointments")
        .select(`id, appointment_date, start_time, end_time, charged_amount, discount, payment_status, clients(id, name), services(id, name), appointment_services(service_id, services(id, name))`)
        .eq("business_id", businessId)
        .gte("appointment_date", start)
        .lte("appointment_date", end)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((a) => normalizeAppointmentServices({
        ...a,
        clients: Array.isArray(a.clients) ? (a.clients[0] ?? null) : a.clients,
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
      services(id, name, duration_minutes),
      appointment_services(service_id, services(id, name, current_price, duration_minutes))
    `)
        .eq("business_id", businessId)
        .eq("appointment_date", date)
        .order("start_time", { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((appt) => normalizeAppointmentServices({
        ...appt,
        clients: Array.isArray(appt.clients)
            ? (appt.clients[0] ?? null)
            : appt.clients,
    }));
}
