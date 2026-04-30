"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.financialRouter = void 0;
const express_1 = require("express");
const date_1 = require("../utils/date");
const financeService_1 = require("../services/financeService");
exports.financialRouter = (0, express_1.Router)();
exports.financialRouter.get("/month-summary", async (req, res) => {
    const businessId = req.query.businessId;
    const month = req.query.month ?? (0, date_1.currentMonthBRT)();
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        const summary = await (0, financeService_1.calculateMonthlyFinancialSummary)(businessId, month);
        res.json(summary);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.financialRouter.get("/service-ranking", async (req, res) => {
    const businessId = req.query.businessId;
    const month = req.query.month ?? (0, date_1.currentMonthBRT)();
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        const ranking = await (0, financeService_1.calculateServiceRanking)(businessId, month);
        res.json(ranking);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.financialRouter.get("/evolution", async (req, res) => {
    const businessId = req.query.businessId;
    const requestedMonths = Number(req.query.months ?? 6);
    const months = Math.max(1, Math.min(24, Math.trunc(requestedMonths) || 6));
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        const evolution = await (0, financeService_1.calculateMonthlyFinancialEvolution)(businessId, months);
        res.json(evolution);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
