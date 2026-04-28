"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packagesRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
exports.packagesRouter = (0, express_1.Router)();
// Listar pacotes de um serviço
exports.packagesRouter.get("/", async (req, res) => {
    const { businessId, serviceId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    let query = supabase
        .from("service_packages")
        .select("*")
        .eq("business_id", businessId)
        .eq("active", true);
    if (serviceId)
        query = query.eq("service_id", serviceId);
    const { data, error } = await query;
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data ?? []);
});
// Criar pacote
exports.packagesRouter.post("/", async (req, res) => {
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    const { serviceId, name, sessions, price, validityDays } = req.body;
    const { data, error } = await supabase
        .from("service_packages")
        .insert({
        business_id: businessId,
        service_id: serviceId,
        name,
        sessions,
        price,
        validity_days: validityDays ?? 20,
    })
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json(data);
});
// Pacotes do cliente
exports.packagesRouter.get("/client", async (req, res) => {
    const { businessId, clientId } = req.query;
    if (!businessId || !clientId) {
        res.status(400).json({ error: "businessId e clientId obrigatórios" });
        return;
    }
    const { data, error } = await supabase
        .from("client_packages")
        .select("*, service_packages(name, sessions, service_id)")
        .eq("business_id", businessId)
        .eq("client_id", clientId)
        .eq("status", "active");
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data ?? []);
});
// Usar sessão do pacote
exports.packagesRouter.post("/use-session", async (req, res) => {
    const { clientPackageId } = req.body;
    const { data: pkg } = await supabase
        .from("client_packages")
        .select("*")
        .eq("id", clientPackageId)
        .single();
    if (!pkg) {
        res.status(404).json({ error: "Pacote não encontrado" });
        return;
    }
    if (pkg.sessions_used >= pkg.sessions_total) {
        res.status(400).json({ error: "Pacote esgotado" });
        return;
    }
    const newUsed = pkg.sessions_used + 1;
    const newStatus = newUsed >= pkg.sessions_total ? "completed" : "active";
    const { data, error } = await supabase
        .from("client_packages")
        .update({ sessions_used: newUsed, status: newStatus })
        .eq("id", clientPackageId)
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
