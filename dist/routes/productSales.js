"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productSalesRouter = void 0;
const express_1 = require("express");
const productSalesService_1 = require("../services/productSalesService");
exports.productSalesRouter = (0, express_1.Router)();
exports.productSalesRouter.get("/", async (req, res) => {
    const { businessId, month } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.json(await (0, productSalesService_1.getProductSales)(businessId, month));
    }
    catch (err) {
        const status = err instanceof productSalesService_1.ProductSaleError ? err.status : 500;
        res.status(status).json({ error: err.message });
    }
});
exports.productSalesRouter.post("/", async (req, res) => {
    const { businessId, ...payload } = req.body;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatorio" });
        return;
    }
    try {
        res.status(201).json(await (0, productSalesService_1.createProductSale)(businessId, payload));
    }
    catch (err) {
        const status = err instanceof productSalesService_1.ProductSaleError ? err.status : 400;
        res.status(status).json({ error: err.message });
    }
});
