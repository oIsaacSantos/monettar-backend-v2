"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingLeadsRouter = void 0;
const express_1 = require("express");
const bookingLeadsService_1 = require("../services/bookingLeadsService");
exports.bookingLeadsRouter = (0, express_1.Router)();
exports.bookingLeadsRouter.get("/", async (req, res) => {
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatÃ³rio" });
        return;
    }
    try {
        res.json(await (0, bookingLeadsService_1.getBookingLeads)(businessId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bookingLeadsRouter.post("/", async (req, res) => {
    const { businessId, clientName, clientPhone, clientEmail, gender, birthDate, selectedServiceId, } = req.body;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatÃ³rio" });
        return;
    }
    try {
        const lead = await (0, bookingLeadsService_1.upsertBookingLead)({
            businessId,
            clientName,
            clientPhone,
            clientEmail,
            gender,
            birthDate,
            selectedServiceId,
        });
        res.status(200).json(lead);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bookingLeadsRouter.patch("/:id/convert", async (req, res) => {
    const { id } = req.params;
    const { appointmentId } = req.body;
    if (!id) {
        res.status(400).json({ error: "id obrigatÃ³rio" });
        return;
    }
    try {
        res.json(await (0, bookingLeadsService_1.convertBookingLead)(id, appointmentId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
