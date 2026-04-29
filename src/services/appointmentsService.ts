import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function createAppointment(payload: {
  businessId: string;
  serviceId: string;
  clientId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  chargedAmount: number;
  status: string;
  notes?: string | null;
}) {
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
      payment_status: payload.status,
      notes: payload.notes?.trim() || null,
      quantity: 1,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateAppointment(
  id: string,
  businessId: string,
  payload: {
    serviceId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    chargedAmount?: number;
    paymentStatus?: string;
    notes?: string;
  }
) {
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
  if (error) throw new Error(error.message);
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
      services(id, name, duration_minutes)
    `, { count: "exact" })
    .eq("business_id", businessId)
    .order("appointment_date", { ascending: false })
    .order("start_time", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  const appointments = (data ?? []).map((a: any) => ({
    ...a,
    clients: Array.isArray(a.clients) ? (a.clients[0] ?? null) : a.clients,
    services: Array.isArray(a.services) ? (a.services[0] ?? null) : a.services,
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
    .select(`id, appointment_date, start_time, end_time, charged_amount, discount, payment_status, clients(id, name), services(id, name)`)
    .eq("business_id", businessId)
    .gte("appointment_date", start)
    .lte("appointment_date", end)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((a: any) => ({
    ...a,
    clients: Array.isArray(a.clients) ? (a.clients[0] ?? null) : a.clients,
    services: Array.isArray(a.services) ? (a.services[0] ?? null) : a.services,
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
      services(id, name, duration_minutes)
    `)
    .eq("business_id", businessId)
    .eq("appointment_date", date)
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((appt: any) => ({
    ...appt,
    clients: Array.isArray(appt.clients)
      ? (appt.clients[0] ?? null)
      : appt.clients,
    services: Array.isArray(appt.services)
      ? (appt.services[0] ?? null)
      : appt.services,
  }));
}
