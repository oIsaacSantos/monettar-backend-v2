"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appointmentsRouter = void 0;
const express_1 = require("express");
const appointmentsService_1 = require("../services/appointmentsService");
const schedulingService_1 = require("../services/schedulingService");
exports.appointmentsRouter = (0, express_1.Router)();
exports.appointmentsRouter.post("/", async (req, res) => {
    const { businessId, serviceId, serviceIds, clientId, appointmentDate, startTime, endTime, chargedAmount, status, notes } = req.body;
    const primaryServiceId = (Array.isArray(serviceIds) && serviceIds.length > 0) ? serviceIds[0] : serviceId;
    if (!businessId || !primaryServiceId || !clientId || !appointmentDate || !startTime || !endTime) {
        res.status(400).json({ error: "businessId, serviceId, clientId, appointmentDate, startTime e endTime são obrigatórios" });
        return;
    }
    try {
        const validation = await (0, schedulingService_1.validateAppointmentSlot)(businessId, appointmentDate, startTime, endTime);
        if (!validation.valid) {
            res.status(409).json({ error: validation.reason });
            return;
        }
        const data = await (0, appointmentsService_1.createAppointment)({
            businessId,
            serviceId: primaryServiceId,
            serviceIds: Array.isArray(serviceIds) ? serviceIds : undefined,
            clientId, appointmentDate, startTime, endTime,
            chargedAmount: Number(chargedAmount) || 0,
            status: status ?? "pending", notes,
        });
        res.status(201).json(data);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.appointmentsRouter.put("/:id", async (req, res) => {
    const { businessId } = req.query;
    const { id } = req.params;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    const { date, startTime, endTime } = req.body;
    if (date && startTime && endTime) {
        try {
            const validation = await (0, schedulingService_1.validateAppointmentSlot)(businessId, date, startTime, endTime, id);
            if (!validation.valid) {
                res.status(409).json({ error: validation.reason });
                return;
            }
        }
        catch (err) {
            res.status(500).json({ error: err.message });
            return;
        }
    }
    try {
        res.json(await (0, appointmentsService_1.updateAppointment)(id, businessId, req.body));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.appointmentsRouter.delete("/:id", async (req, res) => {
    const { businessId } = req.query;
    const { id } = req.params;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    try {
        res.json(await (0, appointmentsService_1.deleteAppointment)(id, businessId));
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
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 100);
    try {
        res.json(await (0, appointmentsService_1.getAllAppointments)(businessId, page, limit));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.appointmentsRouter.get("/available-slots", async (req, res) => {
    const { businessId, date, duration, period, excludeAppointmentId } = req.query;
    if (!businessId || !date || !duration) {
        res.status(400).json({ error: "businessId, date e duration são obrigatórios" });
        return;
    }
    try {
        const slots = await (0, schedulingService_1.getAvailableSlots)(businessId, date, Number(duration), period, false, undefined, excludeAppointmentId);
        res.json({ slots });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.appointmentsRouter.get("/by-month", async (req, res) => {
    const { businessId, year, month } = req.query;
    if (!businessId || !year || !month) {
        res.status(400).json({ error: "businessId, year e month obrigatórios" });
        return;
    }
    try {
        res.json(await (0, appointmentsService_1.getAppointmentsByMonth)(businessId, Number(year), Number(month)));
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
