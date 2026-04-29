import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type SupplyUnit = "unidade" | "g" | "ml" | "pacote" | "cm" | "outro";

export type ServiceSupplyBreakdown = {
  id: string;
  supplyId: string;
  name: string;
  unit: SupplyUnit | string;
  quantityUsed: number;
  costPerUnit: number;
  totalCost: number;
};

function toSafeNumber(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeUnit(unit: unknown): SupplyUnit {
  const allowed: SupplyUnit[] = ["unidade", "g", "ml", "pacote", "cm", "outro"];
  return allowed.includes(unit as SupplyUnit) ? (unit as SupplyUnit) : "outro";
}

function mapServiceSupply(row: any) {
  const supply = Array.isArray(row.supplies) ? row.supplies[0] : row.supplies;
  const quantityUsed = toSafeNumber(row.quantity_used);
  const costPerUnit = toSafeNumber(supply?.cost_per_unit);

  return {
    id: row.id,
    business_id: row.business_id,
    service_id: row.service_id,
    supply_id: row.supply_id,
    quantity_used: quantityUsed,
    supply: supply
      ? {
          id: supply.id,
          name: supply.name,
          unit: supply.unit,
          cost_per_unit: costPerUnit,
        }
      : null,
    cost: quantityUsed * costPerUnit,
  };
}

export async function getSupplies(businessId: string) {
  const { data, error } = await supabase
    .from("supplies")
    .select("id, business_id, name, unit, cost_per_unit, created_at")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((s: any) => ({
    ...s,
    cost_per_unit: toSafeNumber(s.cost_per_unit),
  }));
}

export async function createSupply(
  businessId: string,
  payload: { name: string; unit: unknown; costPerUnit: unknown }
) {
  const { data, error } = await supabase
    .from("supplies")
    .insert({
      business_id: businessId,
      name: payload.name.trim(),
      unit: normalizeUnit(payload.unit),
      cost_per_unit: toSafeNumber(payload.costPerUnit),
    })
    .select("id, business_id, name, unit, cost_per_unit, created_at")
    .single();

  if (error) throw new Error(error.message);
  return { ...data, cost_per_unit: toSafeNumber(data.cost_per_unit) };
}

export async function updateSupply(
  id: string,
  businessId: string,
  payload: { name?: string; unit?: unknown; costPerUnit?: unknown }
) {
  const updatePayload: Record<string, unknown> = {};
  if (payload.name !== undefined) updatePayload.name = payload.name.trim();
  if (payload.unit !== undefined) updatePayload.unit = normalizeUnit(payload.unit);
  if (payload.costPerUnit !== undefined) {
    updatePayload.cost_per_unit = toSafeNumber(payload.costPerUnit);
  }

  const { data, error } = await supabase
    .from("supplies")
    .update(updatePayload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select("id, business_id, name, unit, cost_per_unit, created_at")
    .single();

  if (error) throw new Error(error.message);
  return { ...data, cost_per_unit: toSafeNumber(data.cost_per_unit) };
}

export async function deleteSupply(id: string, businessId: string) {
  const { error } = await supabase
    .from("supplies")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getServiceSupplies(serviceId: string, businessId: string) {
  const { data, error } = await supabase
    .from("service_supplies")
    .select("id, business_id, service_id, supply_id, quantity_used, supplies(id, name, unit, cost_per_unit)")
    .eq("business_id", businessId)
    .eq("service_id", serviceId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapServiceSupply);
}

export async function addServiceSupply(
  serviceId: string,
  businessId: string,
  payload: { supplyId: string; quantityUsed: unknown }
) {
  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("business_id", businessId)
    .single();

  if (serviceError || !service) {
    throw new Error("Servico nao encontrado");
  }

  const { data: supply, error: supplyError } = await supabase
    .from("supplies")
    .select("id")
    .eq("id", payload.supplyId)
    .eq("business_id", businessId)
    .single();

  if (supplyError || !supply) {
    throw new Error("Insumo nao encontrado");
  }

  const { data, error } = await supabase
    .from("service_supplies")
    .insert({
      business_id: businessId,
      service_id: serviceId,
      supply_id: payload.supplyId,
      quantity_used: toSafeNumber(payload.quantityUsed),
    })
    .select("id, business_id, service_id, supply_id, quantity_used, supplies(id, name, unit, cost_per_unit)")
    .single();

  if (error) throw new Error(error.message);
  return mapServiceSupply(data);
}

export async function deleteServiceSupply(id: string, businessId: string) {
  const { error } = await supabase
    .from("service_supplies")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function calculateServiceSupplyCost(serviceId: string, businessId: string) {
  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, material_cost_estimate")
    .eq("id", serviceId)
    .eq("business_id", businessId)
    .single();

  if (serviceError) throw new Error(serviceError.message);

  const serviceSupplies = await getServiceSupplies(serviceId, businessId);
  const breakdown: ServiceSupplyBreakdown[] = serviceSupplies
    .filter((item: any) => item.supply)
    .map((item: any) => ({
      id: item.id,
      supplyId: item.supply_id,
      name: item.supply.name,
      unit: item.supply.unit,
      quantityUsed: toSafeNumber(item.quantity_used),
      costPerUnit: toSafeNumber(item.supply.cost_per_unit),
      totalCost: toSafeNumber(item.quantity_used) * toSafeNumber(item.supply.cost_per_unit),
    }));

  if (breakdown.length === 0) {
    const fallbackCost = toSafeNumber(service?.material_cost_estimate);
    return {
      cost: fallbackCost,
      source: "material_cost_estimate" as const,
      fallbackCost,
      breakdown,
    };
  }

  return {
    cost: breakdown.reduce((sum, item) => sum + item.totalCost, 0),
    source: "supplies" as const,
    fallbackCost: toSafeNumber(service?.material_cost_estimate),
    breakdown,
  };
}
