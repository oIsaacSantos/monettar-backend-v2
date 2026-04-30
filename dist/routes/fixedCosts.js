"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixedCostsRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
exports.fixedCostsRouter = (0, express_1.Router)();
exports.fixedCostsRouter.get("/", async (req, res) => {
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    const { data, error } = await supabase
        .from("fixed_costs")
        .select("id, name, category, amount, business_share_percent")
        .eq("business_id", businessId)
        .order("name", { ascending: true });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data ?? []);
});
exports.fixedCostsRouter.post("/", async (req, res) => {
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    const { name, category, amount, businessSharePercent, business_share_percent } = req.body;
    const { data, error } = await supabase
        .from("fixed_costs")
        .insert({
        business_id: businessId,
        name,
        category,
        amount,
        business_share_percent: businessSharePercent ?? business_share_percent ?? 100,
    })
        .select().single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json(data);
});
exports.fixedCostsRouter.put("/:id", async (req, res) => {
    const { businessId } = req.query;
    const { id } = req.params;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatÃ³rio" });
        return;
    }
    const { name, category, amount, businessSharePercent, business_share_percent } = req.body;
    const { data, error } = await supabase
        .from("fixed_costs")
        .update({
        name,
        category,
        amount,
        business_share_percent: businessSharePercent ?? business_share_percent,
    })
        .eq("id", id)
        .eq("business_id", businessId)
        .select().single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
