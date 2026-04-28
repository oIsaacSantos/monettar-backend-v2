"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertBookingLead = upsertBookingLead;
exports.convertBookingLead = convertBookingLead;
exports.getBookingLeads = getBookingLeads;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function normalizePhone(phone) {
    const digits = (phone ?? "").replace(/\D/g, "");
    return digits || null;
}
function normalizeEmail(email) {
    const value = (email ?? "").trim().toLowerCase();
    return value || null;
}
function cleanText(value) {
    const trimmed = (value ?? "").trim();
    return trimmed || null;
}
async function upsertBookingLead(input) {
    if (!input.businessId) {
        throw new Error("businessId obrigatÃ³rio");
    }
    const clientPhone = normalizePhone(input.clientPhone);
    const clientEmail = normalizeEmail(input.clientEmail);
    if (!clientPhone && !clientEmail) {
        throw new Error("clientPhone ou clientEmail obrigatÃ³rio");
    }
    let existing = null;
    if (clientPhone) {
        const { data, error } = await supabase
            .from("booking_leads")
            .select("*")
            .eq("business_id", input.businessId)
            .eq("client_phone", clientPhone)
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        existing = data;
    }
    else if (clientEmail) {
        const { data, error } = await supabase
            .from("booking_leads")
            .select("*")
            .eq("business_id", input.businessId)
            .eq("client_email", clientEmail)
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        existing = data;
    }
    const payload = {
        client_name: cleanText(input.clientName),
        client_phone: clientPhone,
        client_email: clientEmail,
        gender: cleanText(input.gender),
        birth_date: cleanText(input.birthDate),
        selected_service_id: input.selectedServiceId ?? null,
        updated_at: new Date().toISOString(),
    };
    if (existing) {
        const { data, error } = await supabase
            .from("booking_leads")
            .update({
            ...payload,
            status: existing.status === "converted" ? "converted" : "started",
            access_count: Number(existing.access_count ?? 0) + 1,
        })
            .eq("id", existing.id)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return data;
    }
    const { data, error } = await supabase
        .from("booking_leads")
        .insert({
        business_id: input.businessId,
        ...payload,
        status: "started",
        access_count: 1,
    })
        .select()
        .single();
    if (error)
        throw new Error(error.message);
    return data;
}
async function convertBookingLead(id, appointmentId) {
    if (!id) {
        throw new Error("id obrigatÃ³rio");
    }
    const { data, error } = await supabase
        .from("booking_leads")
        .update({
        status: "converted",
        converted_appointment_id: appointmentId ?? null,
        updated_at: new Date().toISOString(),
    })
        .eq("id", id)
        .select()
        .single();
    if (error)
        throw new Error(error.message);
    return data;
}
async function getBookingLeads(businessId) {
    if (!businessId) {
        throw new Error("businessId obrigatÃ³rio");
    }
    const { data, error } = await supabase
        .from("booking_leads")
        .select(`
      id,
      business_id,
      client_name,
      client_phone,
      client_email,
      gender,
      birth_date,
      selected_service_id,
      status,
      access_count,
      converted_appointment_id,
      created_at,
      updated_at,
      service:services(id, name)
    `)
        .eq("business_id", businessId)
        .order("updated_at", { ascending: false });
    if (error)
        throw new Error(error.message);
    return data ?? [];
}
