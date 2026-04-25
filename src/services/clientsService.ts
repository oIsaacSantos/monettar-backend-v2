import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createSupabaseClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
