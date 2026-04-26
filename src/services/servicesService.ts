import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function createService(businessId: string, payload: {
  name: string; durationMinutes: number; price: number; materialCost: number;
}) {
  const { data, error } = await supabase
    .from("services")
    .insert({
      business_id: businessId,
      name: payload.name,
      duration_minutes: payload.durationMinutes,
      current_price: payload.price,
      material_cost_estimate: payload.materialCost,
      active: true,
    })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateService(id: string, businessId: string, payload: {
  name?: string; durationMinutes?: number; price?: number;
  materialCost?: number; active?: boolean;
}) {
  const { data, error } = await supabase
    .from("services")
    .update({
      name: payload.name,
      duration_minutes: payload.durationMinutes,
      current_price: payload.price,
      material_cost_estimate: payload.materialCost,
      active: payload.active,
    })
    .eq("id", id)
    .eq("business_id", businessId)
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}
