"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppointmentsByDate = getAppointmentsByDate;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function getAppointmentsByDate(businessId, date) {
    const { data, error } = await supabase
        .from("appointments")
        .select(`
      id,
      appointment_date,
      start_time,
      end_time,
      charged_amount,
      discount,
      payment_status,
      notes,
      clients(id, name, phone),
      services(id, name, duration_minutes)
    `)
        .eq("business_id", businessId)
        .eq("appointment_date", date)
        .order("start_time", { ascending: true });
    if (error)
        throw new Error(error.message);
    return data ?? [];
}
