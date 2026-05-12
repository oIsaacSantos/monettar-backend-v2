"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.anamnesisRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
exports.anamnesisRouter = (0, express_1.Router)();
exports.anamnesisRouter.get("/", async (req, res) => {
    const { businessId, clientId } = req.query;
    if (!businessId || !clientId) {
        res.status(400).json({ error: "businessId e clientId obrigatórios" });
        return;
    }
    const { data, error } = await supabase
        .from("client_anamnesis")
        .select("*, services(id, name)")
        .eq("business_id", businessId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data ?? []);
});
exports.anamnesisRouter.post("/", async (req, res) => {
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    const { clientId, serviceId, answers, notes } = req.body;
    if (!clientId) {
        res.status(400).json({ error: "clientId obrigatório" });
        return;
    }
    const { data, error } = await supabase
        .from("client_anamnesis")
        .insert({
        business_id: businessId,
        client_id: clientId,
        service_id: serviceId || null,
        answers: answers ?? {},
        notes: notes ?? null,
    })
        .select("*, services(id, name)")
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json(data);
});
exports.anamnesisRouter.put("/:id", async (req, res) => {
    const { businessId } = req.query;
    const { id } = req.params;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    const { serviceId, answers, notes } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (serviceId !== undefined)
        updates.service_id = serviceId || null;
    if (answers !== undefined)
        updates.answers = answers ?? {};
    if (notes !== undefined)
        updates.notes = notes ?? null;
    const { data, error } = await supabase
        .from("client_anamnesis")
        .update(updates)
        .eq("id", id)
        .eq("business_id", businessId)
        .select("*, services(id, name)")
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
