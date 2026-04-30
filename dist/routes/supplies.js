"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suppliesRouter = void 0;
const express_1 = require("express");
const suppliesService_1 = require("../services/suppliesService");
exports.suppliesRouter = (0, express_1.Router)();
exports.suppliesRouter.get("/", async (req, res) => {
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.json(await (0, suppliesService_1.getSupplies)(businessId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.suppliesRouter.post("/", async (req, res) => {
    const { businessId, name, unit, total_cost_paid, totalCostPaid, package_quantity, packageQuantity } = req.body;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.status(201).json(await (0, suppliesService_1.createSupply)(businessId, {
            name,
            unit,
            totalCostPaid: totalCostPaid ?? total_cost_paid,
            packageQuantity: packageQuantity ?? package_quantity,
        }));
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.suppliesRouter.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { businessId, name, unit, total_cost_paid, totalCostPaid, package_quantity, packageQuantity } = req.body;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.json(await (0, suppliesService_1.updateSupply)(id, businessId, {
            name,
            unit,
            totalCostPaid: totalCostPaid ?? total_cost_paid,
            packageQuantity: packageQuantity ?? package_quantity,
        }));
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.suppliesRouter.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.json(await (0, suppliesService_1.deleteSupply)(id, businessId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
