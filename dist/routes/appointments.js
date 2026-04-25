"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appointmentsRouter = void 0;
const express_1 = require("express");
const appointmentsService_1 = require("../services/appointmentsService");
exports.appointmentsRouter = (0, express_1.Router)();
exports.appointmentsRouter.put("/:id", async (req, res) => {
    const { businessId } = req.query;
    const { id } = req.params;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    try {
        res.json(await (0, appointmentsService_1.updateAppointment)(id, businessId, req.body));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.appointmentsRouter.get("/all", async (req, res) => {
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    try {
        res.json(await (0, appointmentsService_1.getAllAppointments)(businessId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.appointmentsRouter.get("/by-date", async (req, res) => {
    const { businessId, date } = req.query;
    if (!businessId || !date) {
        res.status(400).json({ error: "businessId e date são obrigatórios" });
        return;
    }
    try {
        const data = await (0, appointmentsService_1.getAppointmentsByDate)(businessId, date);
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
