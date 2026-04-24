"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRouter = void 0;
const express_1 = require("express");
const dashboardService_1 = require("../services/dashboardService");
exports.dashboardRouter = (0, express_1.Router)();
exports.dashboardRouter.get("/summary", async (req, res) => {
    const businessId = req.query.businessId;
    if (!businessId) {
        res.status(400).json({ error: "businessId é obrigatório" });
        return;
    }
    try {
        const data = await (0, dashboardService_1.getDashboardSummary)(businessId);
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
