import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createSupabaseClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getClientsWithStats(businessId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select(`
      id, name, phone,
      appointments(id, appointment_date, charged_amount, discount, payment_status, services(name))
    `)
    .eq("business_id", businessId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c: any) => {
    const appts = Array.isArray(c.appointments) ? c.appointments : [];
    const sorted = [...appts].sort((a: any, b: any) =>
      a.appointment_date.localeCompare(b.appointment_date));
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      totalAppointments: appts.length,
      firstAppointment: sorted[0]?.appointment_date ?? null,
      lastAppointment: sorted[sorted.length - 1]?.appointment_date ?? null,
      appointments: sorted.map((a: any) => ({
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

export async function createClient(
  businessId: string,
  payload: { name: string; phone: string }
) {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      business_id: businessId,
      name: payload.name,
      phone: payload.phone,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
}
