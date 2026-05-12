"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppointment = createAppointment;
exports.updateAppointment = updateAppointment;
exports.deleteAppointment = deleteAppointment;
exports.getAllAppointments = getAllAppointments;
exports.getAppointmentsByMonth = getAppointmentsByMonth;
exports.autoConfirmPassedAppointments = autoConfirmPassedAppointments;
exports.expirePendingAppointments = expirePendingAppointments;
exports.reconcileMercadoPagoPayments = reconcileMercadoPagoPayments;
exports.getPendingPayments = getPendingPayments;
exports.confirmAppointmentManually = confirmAppointmentManually;
exports.getAppointmentsByDate = getAppointmentsByDate;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const date_1 = require("../utils/date");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function invalidPayloadError(message) {
    const error = new Error(message);
    error.code = "INVALID_PAYLOAD";
    return error;
}
function normalizePaymentStatus(status) {
    return status === "paid" ? "confirmed" : (status ?? "pending");
}
function normalizeAppointmentType(value) {
    if (value === "barter")
        return "barter";
    return "paid";
}
function timeToMinutes(time) {
    const [hour, minute] = time.slice(0, 5).split(":").map(Number);
    return hour * 60 + minute;
}
function minutesToTime(minutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function addMinutes(time, minutesToAdd) {
    return minutesToTime(timeToMinutes(time) + minutesToAdd);
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
async function getAppointmentById(id, businessId) {
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
      appointment_type,
      notes,
      clients(id, name, phone),
      services(id, name, duration_minutes),
      appointment_services(service_id, services(id, name, current_price, duration_minutes))
    `)
        .eq("id", id)
        .eq("business_id", businessId)
        .single();
    if (error)
        throw new Error(error.message);
    return normalizeAppointmentServices({
        ...data,
        clients: Array.isArray(data.clients) ? (data.clients[0] ?? null) : data.clients,
    });
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
    const primaryServiceId = payload.serviceIds?.length ? payload.serviceIds[0] : payload.serviceId;
    const idsToLink = payload.serviceIds?.length ? payload.serviceIds : [payload.serviceId];
    const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("id", payload.clientId)
        .eq("business_id", payload.businessId)
        .is("deleted_at", null)
        .maybeSingle();
    if (clientError)
        throw new Error(clientError.message);
    if (!clientData)
        throw invalidPayloadError("Cliente inválido.");
    const { data, error } = await supabase
        .from("appointments")
        .insert({
        business_id: payload.businessId,
        client_id: payload.clientId,
        service_id: primaryServiceId,
        appointment_date: payload.appointmentDate,
        start_time: payload.startTime,
        end_time: payload.endTime,
        charged_amount: payload.chargedAmount,
        discount: 0,
        payment_status: normalizePaymentStatus(payload.status),
        appointment_type: normalizeAppointmentType(payload.appointmentType ?? payload.appointment_type),
        notes: payload.notes?.trim() || null,
        quantity: 1,
        ...(payload.customDurationMinutes !== undefined && { custom_duration_minutes: payload.customDurationMinutes }),
    })
        .select("id")
        .single();
    if (error)
        throw new Error(error.message);
    const { data: servicesData } = await supabase
        .from("services")
        .select("id, current_price, duration_minutes")
        .in("id", idsToLink);
    if ((servicesData ?? []).length !== idsToLink.length) {
        throw invalidPayloadError("Serviço inválido.");
    }
    const snapshots = (servicesData ?? []).map((s) => ({
        service_id: s.id,
        price: s.current_price ?? null,
        duration_minutes: s.duration_minutes ?? null,
    }));
    await replaceAppointmentServices(data.id, snapshots.length ? snapshots : [{ service_id: primaryServiceId }]);
    return data;
}
async function updateAppointment(id, businessId, payload) {
    if (payload.serviceIds && payload.serviceIds.length === 0) {
        throw invalidPayloadError("Selecione ao menos um serviço.");
    }
    const primaryServiceId = payload.serviceIds?.length ? payload.serviceIds[0] : payload.serviceId;
    const appointmentDate = payload.appointmentDate ?? payload.appointment_date ?? payload.date;
    let computedEndTime = payload.endTime;
    let snapshots;
    if (payload.clientId !== undefined) {
        const { data: clientData, error: clientError } = await supabase
            .from("clients")
            .select("id")
            .eq("id", payload.clientId)
            .eq("business_id", businessId)
            .is("deleted_at", null)
            .maybeSingle();
        if (clientError)
            throw new Error(clientError.message);
        if (!clientData)
            throw invalidPayloadError("Cliente inválido.");
    }
    if (payload.serviceIds?.length) {
        const { data: servicesData, error: servicesError } = await supabase
            .from("services")
            .select("id, current_price, duration_minutes")
            .in("id", payload.serviceIds);
        if (servicesError)
            throw new Error(servicesError.message);
        if ((servicesData ?? []).length !== payload.serviceIds.length) {
            throw invalidPayloadError("Serviço inválido.");
        }
        const serviceMap = new Map((servicesData ?? []).map((s) => [s.id, s]));
        snapshots = payload.serviceIds.map((serviceId) => {
            const service = serviceMap.get(serviceId);
            return {
                service_id: serviceId,
                price: service?.current_price ?? null,
                duration_minutes: service?.duration_minutes ?? null,
            };
        });
        if (!computedEndTime && payload.startTime) {
            const duration = payload.customDurationMinutes ?? payload.durationMinutes ?? snapshots.reduce((sum, service) => sum + Number(service.duration_minutes ?? 0), 0);
            if (duration > 0)
                computedEndTime = addMinutes(payload.startTime, duration);
        }
    }
    else if (payload.durationMinutes && payload.startTime && !computedEndTime) {
        computedEndTime = addMinutes(payload.startTime, payload.durationMinutes);
    }
    const updatePayload = {};
    if (payload.clientId !== undefined)
        updatePayload.client_id = payload.clientId;
    if (primaryServiceId !== undefined)
        updatePayload.service_id = primaryServiceId;
    if (appointmentDate !== undefined)
        updatePayload.appointment_date = appointmentDate;
    if (payload.startTime !== undefined)
        updatePayload.start_time = payload.startTime;
    if (computedEndTime !== undefined)
        updatePayload.end_time = computedEndTime;
    if (payload.chargedAmount !== undefined)
        updatePayload.charged_amount = payload.chargedAmount;
    if (payload.discount !== undefined)
        updatePayload.discount = payload.discount ?? 0;
    if (payload.paymentStatus !== undefined)
        updatePayload.payment_status = normalizePaymentStatus(payload.paymentStatus);
    if (payload.appointmentType !== undefined || payload.appointment_type !== undefined) {
        updatePayload.appointment_type = normalizeAppointmentType(payload.appointmentType ?? payload.appointment_type);
    }
    if (payload.notes !== undefined)
        updatePayload.notes = payload.notes?.trim() || null;
    if (payload.customDurationMinutes !== undefined)
        updatePayload.custom_duration_minutes = payload.customDurationMinutes;
    if (Object.keys(updatePayload).length > 0) {
        const { error } = await supabase
            .from("appointments")
            .update(updatePayload)
            .eq("id", id)
            .eq("business_id", businessId);
        if (error)
            throw new Error(error.message);
    }
    if (snapshots) {
        await replaceAppointmentServices(id, snapshots.length ? snapshots : [{ service_id: primaryServiceId }]);
    }
    else if (payload.serviceId) {
        await replaceAppointmentServices(id, [{ service_id: payload.serviceId }]);
    }
    return getAppointmentById(id, businessId);
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
      appointment_type,
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
        .select(`id, appointment_date, start_time, end_time, charged_amount, discount, payment_status, appointment_type, notes, clients(id, name, phone), services(id, name, duration_minutes), appointment_services(service_id, services(id, name, current_price, duration_minutes))`)
        .eq("business_id", businessId)
        .gte("appointment_date", start)
        .lte("appointment_date", end)
        .in("payment_status", ACTIVE_APPOINTMENT_STATUSES)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((a) => normalizeAppointmentServices({
        ...a,
        clients: Array.isArray(a.clients) ? (a.clients[0] ?? null) : a.clients,
    }));
}
async function autoConfirmPassedAppointments(businessId) {
    const nowUTC = Date.now();
    const todayStr = (0, date_1.todayBRT)();
    const { data: candidates } = await supabase
        .from("appointments")
        .select("id, appointment_date, end_time")
        .eq("business_id", businessId)
        .eq("payment_status", "pending")
        .lte("appointment_date", todayStr);
    if (!candidates?.length)
        return;
    const idsToConfirm = candidates
        .filter((a) => {
        const [year, month, day] = a.appointment_date.split("-").map(Number);
        const [h, m] = a.end_time
            ? a.end_time.slice(0, 5).split(":").map(Number)
            : [23, 59];
        // BRT h:m = UTC (h+3):m — Date.UTC handles hour overflow
        return Date.UTC(year, month - 1, day, h + 3, m, 0) <= nowUTC;
    })
        .map((a) => a.id);
    if (!idsToConfirm.length)
        return;
    await supabase
        .from("appointments")
        .update({ payment_status: "confirmed" })
        .in("id", idsToConfirm);
}
const ACTIVE_APPOINTMENT_STATUSES = ["confirmed", "paid"];
async function expirePendingAppointments() {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("appointments")
        .update({ payment_status: "payment_expired" })
        .eq("payment_status", "pending")
        .is("paid_date", null)
        .lt("payment_expires_at", now)
        .select("id");
    if (error) {
        console.error("[expire] error:", error.message);
        throw new Error(error.message);
    }
    const expired = data?.length ?? 0;
    if (expired > 0)
        console.log(`[expire] ${expired} appointments set to payment_expired`);
    return { expired };
}
async function reconcileMercadoPagoPayments() {
    const { data: candidates, error } = await supabase
        .from("appointments")
        .select("id, business_id, payment_status, mp_payment_id")
        .in("payment_status", ["pending", "payment_expired"])
        .not("mp_payment_id", "is", null);
    if (error)
        throw new Error(error.message);
    if (!candidates?.length) {
        console.log("[reconcile] no candidates found");
        return { checked: 0, confirmed: 0, errors: 0 };
    }
    console.log(`[reconcile] checking ${candidates.length} appointments`);
    const businessIds = [...new Set(candidates.map((a) => a.business_id))];
    const { data: businesses } = await supabase
        .from("businesses")
        .select("id, mp_access_token")
        .in("id", businessIds);
    const tokenMap = new Map((businesses ?? []).map((b) => [b.id, b.mp_access_token?.trim() || process.env.MP_ACCESS_TOKEN]));
    const { getPaymentDetails } = await Promise.resolve().then(() => __importStar(require("./paymentService")));
    let checked = 0;
    let confirmed = 0;
    let errors = 0;
    for (const appt of candidates) {
        if (!appt.mp_payment_id)
            continue;
        checked++;
        try {
            const accessToken = tokenMap.get(appt.business_id) ?? process.env.MP_ACCESS_TOKEN;
            const details = await getPaymentDetails(accessToken, appt.mp_payment_id);
            console.log(`[reconcile] appt=${appt.id} was=${appt.payment_status} MP=${details.status}`);
            if (details.status === "approved") {
                const { error: updateError } = await supabase
                    .from("appointments")
                    .update({ payment_status: "confirmed", paid_date: (0, date_1.todayBRT)() })
                    .eq("id", appt.id);
                if (updateError) {
                    console.error(`[reconcile] update error ${appt.id}:`, updateError.message);
                    errors++;
                }
                else {
                    console.log(`[reconcile] confirmed ${appt.id}`);
                    confirmed++;
                }
            }
        }
        catch (err) {
            console.error(`[reconcile] error for ${appt.id}:`, err.message);
            errors++;
        }
    }
    console.log(`[reconcile] done: checked=${checked} confirmed=${confirmed} errors=${errors}`);
    return { checked, confirmed, errors };
}
async function getPendingPayments(businessId) {
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
      payment_expires_at,
      mp_payment_id,
      clients(id, name, phone),
      services(id, name, duration_minutes),
      appointment_services(service_id, services(id, name, current_price, duration_minutes))
    `)
        .eq("business_id", businessId)
        .in("payment_status", ["pending", "payment_expired"])
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });
    if (error) {
        console.error("[pending-payments][backend][supabase-error]", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            full: error,
        });
        const wrapped = new Error(error.message);
        wrapped.code = error.code;
        wrapped.details = error.details;
        wrapped.hint = error.hint;
        throw wrapped;
    }
    return (data ?? []).map((a) => normalizeAppointmentServices({
        ...a,
        clients: Array.isArray(a.clients) ? (a.clients[0] ?? null) : a.clients,
    }));
}
async function confirmAppointmentManually(id, businessId) {
    const { data, error } = await supabase
        .from("appointments")
        .update({ payment_status: "confirmed", paid_date: (0, date_1.todayBRT)() })
        .eq("id", id)
        .eq("business_id", businessId)
        .in("payment_status", ["pending", "payment_expired"])
        .select()
        .single();
    if (error)
        throw new Error(error.message);
    if (!data)
        throw new Error("Agendamento não encontrado ou já confirmado");
    console.log(`[manual-confirm] confirmed appointment ${id}`);
    return data;
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
      appointment_type,
      notes,
      clients(id, name, phone),
      services(id, name, duration_minutes),
      appointment_services(service_id, services(id, name, current_price, duration_minutes))
    `)
        .eq("business_id", businessId)
        .eq("appointment_date", date)
        .in("payment_status", ACTIVE_APPOINTMENT_STATUSES)
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
