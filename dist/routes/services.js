"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.servicesRouter = void 0;
const express_1 = require("express");
const servicesService_1 = require("../services/servicesService");
exports.servicesRouter = (0, express_1.Router)();
exports.servicesRouter.post("/", async (req, res) => {
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    try {
        res.status(201).json(await (0, servicesService_1.createService)(businessId, req.body));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.servicesRouter.put("/:id", async (req, res) => {
    const { businessId } = req.query;
    const { id } = req.params;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    try {
        res.json(await (0, servicesService_1.updateService)(id, businessId, req.body));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
