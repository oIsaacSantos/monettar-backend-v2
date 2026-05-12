"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServices = getServices;
exports.createService = createService;
exports.updateService = updateService;
exports.calculateServiceCost = calculateServiceCost;
exports.reorderServices = reorderServices;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase_js_1 = require("@supabase/supabase-js");
const suppliesService_1 = require("./suppliesService");
const financeService_1 = require("./financeService");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function normalizeDescription(description) {
    const trimmed = description?.trim();
    return trimmed ? trimmed : null;
}
async function attachSupplyCosts(businessId, services) {
    const operational = await (0, financeService_1.calculateOperationalCostPerMinute)(businessId).catch((err) => {
        console.warn("[services] erro ao calcular custo operacional:", err?.message ?? err);
        return { operationalCostPerMinute: 0 };
    });
    return Promise.all(services.map(async (service) => {
        try {
            const calculated = await (0, suppliesService_1.calculateServiceSupplyCost)(service.id, businessId);
            const operationalCost = Number(service.duration_minutes ?? 0) * operational.operationalCostPerMinute;
            const totalCost = calculated.cost + operationalCost;
            return {
                ...service,
                calculated_material_cost: calculated.cost,
                material_cost_source: calculated.source,
                supply_cost_breakdown: calculated.breakdown,
                operational_cost: operationalCost,
                total_cost: totalCost,
            };
        }
        catch (err) {
            console.warn("[services] erro ao calcular custo por insumos:", err?.message ?? err);
            const materialCost = Number(service.material_cost_estimate ?? 0);
            const operationalCost = Number(service.duration_minutes ?? 0) * operational.operationalCostPerMinute;
            return {
                ...service,
                calculated_material_cost: materialCost,
                material_cost_source: "material_cost_estimate",
                supply_cost_breakdown: [],
                operational_cost: operationalCost,
                total_cost: materialCost + operationalCost,
            };
        }
    }));
}
async function getServices(businessId) {
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
        if (fallback.error)
            throw new Error(fallback.error.message);
        return attachSupplyCosts(businessId, fallback.data ?? []);
    }
    const { data, error } = result;
    if (error)
        throw new Error(error.message);
    return attachSupplyCosts(businessId, data ?? []);
}
async function createService(businessId, payload) {
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
        if (fallback.error)
            throw new Error(fallback.error.message);
        return fallback.data;
    }
    const { data, error } = insertResult;
    if (error)
        throw new Error(error.message);
    return data;
}
async function updateService(id, businessId, payload) {
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
    if (error)
        throw new Error(error.message);
    return data;
}
async function calculateServiceCost(serviceId, businessId) {
    const { data: service, error } = await supabase
        .from("services")
        .select("current_price, duration_minutes, material_cost_estimate")
        .eq("id", serviceId)
        .eq("business_id", businessId)
        .single();
    if (error)
        throw new Error(error.message);
    const calculated = await (0, suppliesService_1.calculateServiceSupplyCost)(serviceId, businessId);
    const operational = await (0, financeService_1.calculateOperationalCostPerMinute)(businessId).catch(() => ({
        operationalCostPerMinute: 0,
    }));
    const suppliesCost = calculated.cost;
    const materialCost = Number(service.material_cost_estimate ?? 0);
    const operationalCost = Number(service.duration_minutes ?? 0) * operational.operationalCostPerMinute;
    const totalCost = suppliesCost + operationalCost;
    const currentPrice = Number(service.current_price ?? 0);
    return { suppliesCost, materialCost, totalCost, currentPrice };
}
async function reorderServices(businessId, serviceIds) {
    for (const [index, id] of serviceIds.entries()) {
        const { error } = await supabase
            .from("services")
            .update({ sort_order: index + 1 })
            .eq("id", id)
            .eq("business_id", businessId);
        if (error)
            throw new Error(error.message);
    }
    return getServices(businessId);
}
