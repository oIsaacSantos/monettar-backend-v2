import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  return data ?? [];
}
