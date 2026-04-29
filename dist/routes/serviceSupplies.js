"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceSuppliesRouter = void 0;
const express_1 = require("express");
const suppliesService_1 = require("../services/suppliesService");
exports.serviceSuppliesRouter = (0, express_1.Router)();
exports.serviceSuppliesRouter.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.json(await (0, suppliesService_1.deleteServiceSupply)(id, businessId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
