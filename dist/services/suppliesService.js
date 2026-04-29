"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupplies = getSupplies;
exports.createSupply = createSupply;
exports.updateSupply = updateSupply;
exports.deleteSupply = deleteSupply;
exports.getServiceSupplies = getServiceSupplies;
exports.addServiceSupply = addServiceSupply;
exports.deleteServiceSupply = deleteServiceSupply;
exports.calculateServiceSupplyCost = calculateServiceSupplyCost;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function toSafeNumber(value) {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
}
function normalizeUnit(unit) {
    const allowed = ["unidade", "g", "ml", "pacote", "cm", "outro"];
    return allowed.includes(unit) ? unit : "outro";
}
function mapServiceSupply(row) {
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
async function getSupplies(businessId) {
    const { data, error } = await supabase
        .from("supplies")
        .select("id, business_id, name, unit, cost_per_unit, created_at")
        .eq("business_id", businessId)
        .order("name", { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((s) => ({
        ...s,
        cost_per_unit: toSafeNumber(s.cost_per_unit),
    }));
}
async function createSupply(businessId, payload) {
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
    if (error)
        throw new Error(error.message);
    return { ...data, cost_per_unit: toSafeNumber(data.cost_per_unit) };
}
async function updateSupply(id, businessId, payload) {
    const updatePayload = {};
    if (payload.name !== undefined)
        updatePayload.name = payload.name.trim();
    if (payload.unit !== undefined)
        updatePayload.unit = normalizeUnit(payload.unit);
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
    if (error)
        throw new Error(error.message);
    return { ...data, cost_per_unit: toSafeNumber(data.cost_per_unit) };
}
async function deleteSupply(id, businessId) {
    const { error } = await supabase
        .from("supplies")
        .delete()
        .eq("id", id)
        .eq("business_id", businessId);
    if (error)
        throw new Error(error.message);
    return { success: true };
}
async function getServiceSupplies(serviceId, businessId) {
    const { data, error } = await supabase
        .from("service_supplies")
        .select("id, business_id, service_id, supply_id, quantity_used, supplies(id, name, unit, cost_per_unit)")
        .eq("business_id", businessId)
        .eq("service_id", serviceId)
        .order("created_at", { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []).map(mapServiceSupply);
}
async function addServiceSupply(serviceId, businessId, payload) {
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
    if (error)
        throw new Error(error.message);
    return mapServiceSupply(data);
}
async function deleteServiceSupply(id, businessId) {
    const { error } = await supabase
        .from("service_supplies")
        .delete()
        .eq("id", id)
        .eq("business_id", businessId);
    if (error)
        throw new Error(error.message);
    return { success: true };
}
async function calculateServiceSupplyCost(serviceId, businessId) {
    const { data: service, error: serviceError } = await supabase
        .from("services")
        .select("id, material_cost_estimate")
        .eq("id", serviceId)
        .eq("business_id", businessId)
        .single();
    if (serviceError)
        throw new Error(serviceError.message);
    const serviceSupplies = await getServiceSupplies(serviceId, businessId);
    const breakdown = serviceSupplies
        .filter((item) => item.supply)
        .map((item) => ({
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
            source: "material_cost_estimate",
            fallbackCost,
            breakdown,
        };
    }
    return {
        cost: breakdown.reduce((sum, item) => sum + item.totalCost, 0),
        source: "supplies",
        fallbackCost: toSafeNumber(service?.material_cost_estimate),
        breakdown,
    };
}
