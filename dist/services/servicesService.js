"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createService = createService;
exports.updateService = updateService;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function createService(businessId, payload) {
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
    })
        .eq("id", id)
        .eq("business_id", businessId)
        .select().single();
    if (error)
        throw new Error(error.message);
    return data;
}
