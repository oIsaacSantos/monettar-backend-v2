import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import { calculateServiceSupplyCost } from "./suppliesService";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeDescription(description?: string | null) {
  const trimmed = description?.trim();
  return trimmed ? trimmed : null;
}

async function attachSupplyCosts(businessId: string, services: any[]) {
  return Promise.all(
    services.map(async (service) => {
      try {
        const calculated = await calculateServiceSupplyCost(service.id, businessId);
        return {
          ...service,
          calculated_material_cost: calculated.cost,
          material_cost_source: calculated.source,
          supply_cost_breakdown: calculated.breakdown,
        };
      } catch (err: any) {
        console.warn("[services] erro ao calcular custo por insumos:", err?.message ?? err);
        return {
          ...service,
          calculated_material_cost: Number(service.material_cost_estimate ?? 0),
          material_cost_source: "material_cost_estimate",
          supply_cost_breakdown: [],
        };
      }
    })
  );
}

export async function getServices(businessId: string) {
  const result = await supabase
    .from("services")
    .select("id, name, current_price, duration_minutes, material_cost_estimate, active, description, sort_order, created_at")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (result.error && result.error.message.includes("sort_order")) {
    const fallback = await supabase
      .from("services")
      .select("id, name, current_price, duration_minutes, material_cost_estimate, active, description, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true })
      .order("name", { ascending: true });

    if (fallback.error) throw new Error(fallback.error.message);
    return attachSupplyCosts(businessId, fallback.data ?? []);
  }

  const { data, error } = result;
  if (error) throw new Error(error.message);
  return attachSupplyCosts(businessId, data ?? []);
}

export async function createService(businessId: string, payload: {
  name: string; durationMinutes: number; price: number; materialCost: number; description?: string | null;
}) {
  const { data: lastService, error: lastServiceError } = await supabase
    .from("services")
    .select("sort_order")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const insertPayload = {
    business_id: businessId,
    name: payload.name,
    duration_minutes: payload.durationMinutes,
    current_price: payload.price,
    material_cost_estimate: payload.materialCost,
    description: normalizeDescription(payload.description),
    active: true,
    sort_order: lastServiceError ? undefined : Number(lastService?.sort_order ?? 0) + 1,
  };

  const insertResult = await supabase
    .from("services")
    .insert(insertPayload)
    .select().single();

  if (insertResult.error && insertResult.error.message.includes("sort_order")) {
    const { sort_order, ...fallbackPayload } = insertPayload;
    const fallback = await supabase
      .from("services")
      .insert(fallbackPayload)
      .select().single();
    if (fallback.error) throw new Error(fallback.error.message);
    return fallback.data;
  }

  const { data, error } = insertResult;
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

export async function reorderServices(businessId: string, serviceIds: string[]) {
  for (const [index, id] of serviceIds.entries()) {
    const { error } = await supabase
      .from("services")
      .update({ sort_order: index + 1 })
      .eq("id", id)
      .eq("business_id", businessId);

    if (error) throw new Error(error.message);
  }

  return getServices(businessId);
}
