import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type AppointmentServiceSnapshot = {
  service_id: string;
  price?: number | null;
  duration_minutes?: number | null;
};

function normalizePaymentStatus(status?: string | null) {
  return status === "paid" ? "confirmed" : (status ?? "pending");
}

function normalizeAppointmentServices(appointment: any) {
  const linkedServices = (appointment.appointment_services ?? [])
    .map((row: any) => {
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

async function replaceAppointmentServices(
  appointmentId: string,
  services: AppointmentServiceSnapshot[]
) {
  await supabase.from("appointment_services").delete().eq("appointment_id", appointmentId);
  if (services.length === 0) return;

  const rowsWithSnapshots = services.map((service) => ({
    appointment_id: appointmentId,
    service_id: service.service_id,
    price: service.price ?? null,
    duration_minutes: service.duration_minutes ?? null,
  }));

  const { error } = await supabase.from("appointment_services").insert(rowsWithSnapshots);
  if (!error) return;

  if (error.code !== "42703") throw new Error(error.message);

  const fallbackRows = services.map((service) => ({
    appointment_id: appointmentId,
    service_id: service.service_id,
  }));
  const fallback = await supabase.from("appointment_services").insert(fallbackRows);
  if (fallback.error) throw new Error(fallback.error.message);
}

export async function createAppointment(payload: {
  businessId: string;
  serviceId: string;
  serviceIds?: string[];
  clientId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  chargedAmount: number;
  status: string;
  notes?: string | null;
}) {
  const primaryServiceId = payload.serviceIds?.length ? payload.serviceIds[0] : payload.serviceId;
  const idsToLink = payload.serviceIds?.length ? payload.serviceIds : [payload.serviceId];

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
      notes: payload.notes?.trim() || null,
      quantity: 1,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const { data: servicesData } = await supabase
    .from("services")
    .select("id, current_price, duration_minutes")
    .in("id", idsToLink);

  const snapshots: AppointmentServiceSnapshot[] = (servicesData ?? []).map((s: any) => ({
    service_id: s.id,
    price: s.current_price ?? null,
    duration_minutes: s.duration_minutes ?? null,
  }));

  await replaceAppointmentServices(data.id, snapshots.length ? snapshots : [{ service_id: primaryServiceId }]);
  return data;
}

export async function updateAppointment(
  id: string,
  businessId: string,
  payload: {
    serviceId?: string;
    serviceIds?: string[];
    date?: string;
    startTime?: string;
    endTime?: string;
    chargedAmount?: number;
    paymentStatus?: string;
    notes?: string;
  }
) {
  const primaryServiceId = payload.serviceIds?.length ? payload.serviceIds[0] : payload.serviceId;

  const { data, error } = await supabase
    .from("appointments")
    .update({
      service_id: primaryServiceId,
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
  if (error) throw new Error(error.message);

  if (payload.serviceIds?.length) {
    const { data: servicesData } = await supabase
      .from("services")
      .select("id, current_price, duration_minutes")
      .in("id", payload.serviceIds);
    const snapshots: AppointmentServiceSnapshot[] = (servicesData ?? []).map((s: any) => ({
      service_id: s.id,
      price: s.current_price ?? null,
      duration_minutes: s.duration_minutes ?? null,
    }));
    await replaceAppointmentServices(id, snapshots.length ? snapshots : [{ service_id: primaryServiceId! }]);
  } else if (payload.serviceId) {
    await replaceAppointmentServices(id, [{ service_id: payload.serviceId }]);
  }

  return data;
}

export async function deleteAppointment(id: string, businessId: string) {
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getAllAppointments(businessId: string, page: number, limit: number) {
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
  if (error) throw new Error(error.message);
  const appointments = (data ?? []).map((a: any) => normalizeAppointmentServices({
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

export async function getAppointmentsByMonth(businessId: string, year: number, month: number) {
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
  if (error) throw new Error(error.message);
  return (data ?? []).map((a: any) => normalizeAppointmentServices({
    ...a,
    clients: Array.isArray(a.clients) ? (a.clients[0] ?? null) : a.clients,
  }));
}

export async function getAppointmentsByDate(businessId: string, date: string) {
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

  if (error) throw new Error(error.message);

  return (data ?? []).map((appt: any) => normalizeAppointmentServices({
    ...appt,
    clients: Array.isArray(appt.clients)
      ? (appt.clients[0] ?? null)
      : appt.clients,
  }));
}
