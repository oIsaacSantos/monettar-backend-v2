"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServices = getServices;
exports.createService = createService;
exports.updateService = updateService;
exports.reorderServices = reorderServices;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function normalizeDescription(description) {
    const trimmed = description?.trim();
    return trimmed ? trimmed : null;
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
        return fallback.data ?? [];
    }
    const { data, error } = result;
    if (error)
        throw new Error(error.message);
    return data ?? [];
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
