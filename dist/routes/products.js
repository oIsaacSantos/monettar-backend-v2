"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productsRouter = void 0;
const express_1 = require("express");
const productsService_1 = require("../services/productsService");
exports.productsRouter = (0, express_1.Router)();
exports.productsRouter.get("/", async (req, res) => {
    const { businessId, includeInactive } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.json(await (0, productsService_1.getProducts)(businessId, includeInactive === "true"));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.productsRouter.post("/", async (req, res) => {
    const { businessId, ...payload } = req.body;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.status(201).json(await (0, productsService_1.createProduct)(businessId, payload));
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.productsRouter.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { businessId, ...payload } = req.body;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.json(await (0, productsService_1.updateProduct)(id, businessId, payload));
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.productsRouter.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.json(await (0, productsService_1.deactivateProduct)(id, businessId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
