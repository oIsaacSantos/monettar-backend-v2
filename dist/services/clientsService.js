"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = createClient;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function createClient(businessId, payload) {
    const { data, error } = await supabase
        .from("clients")
        .insert({
        business_id: businessId,
        name: payload.name,
        phone: payload.phone,
    })
        .select()
        .single();
    if (error)
        throw new Error(error.message);
    return data;
}
