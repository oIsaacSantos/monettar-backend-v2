import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeDescription(description?: string | null) {
  const trimmed = description?.trim();
  return trimmed ? trimmed : null;
}

export async function getServices(businessId: string) {
  const { data, error } = await supabase
    .from("services")
    .select("id, name, current_price, duration_minutes, material_cost_estimate, active, description")
    .eq("business_id", businessId)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createService(businessId: string, payload: {
  name: string; durationMinutes: number; price: number; materialCost: number; description?: string | null;
}) {
  const { data, error } = await supabase
    .from("services")
    .insert({
      business_id: businessId,
      name: payload.name,
      duration_minutes: payload.durationMinutes,
      current_price: payload.price,
      material_cost_estimate: payload.materialCost,
      description: normalizeDescription(payload.description),
      active: true,
    })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateService(id: string, businessId: string, payload: {
  name?: string; durationMinutes?: number; price?: number;
  materialCost?: number; active?: boolean; description?: string | null;
}) {
  const { data, error } = await supabase
    .from("services")
    .update({
      name: payload.name,
      duration_minutes: payload.durationMinutes,
      current_price: payload.price,
      material_cost_estimate: payload.materialCost,
      active: payload.active,
      description: payload.description === undefined ? undefined : normalizeDescription(payload.description),
    })
    .eq("id", id)
    .eq("business_id", businessId)
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}
