import { Router, Request, Response } from "express";
import { confirmAppointmentManually, createAppointment, deleteAppointment, getAllAppointments, getAppointmentsByDate, getAppointmentsByMonth, getPendingPayments, updateAppointment } from "../services/appointmentsService";
import { getAvailableSlots, validateAppointmentSlot } from "../services/schedulingService";

export const appointmentsRouter = Router();

appointmentsRouter.post("/", async (req: Request, res: Response) => {
  const { businessId, serviceId, serviceIds, clientId, appointmentDate, startTime, endTime, chargedAmount, status, notes, appointmentType, appointment_type, allowOverride, forceScheduleOverride, customDurationMinutes } = req.body;
  const primaryServiceId = (Array.isArray(serviceIds) && serviceIds.length > 0) ? serviceIds[0] : serviceId;
  const resolvedAllowOverride = Boolean(allowOverride ?? forceScheduleOverride);
  console.info("[manual-override-debug][backend][appointments:POST][received]", {
    allowOverride,
    forceScheduleOverride,
    resolvedAllowOverride,
    businessId,
    clientId,
    appointmentDate,
    startTime,
    endTime,
    serviceId: primaryServiceId,
    serviceIds: Array.isArray(serviceIds) ? serviceIds : undefined,
  });
  if (!businessId || !primaryServiceId || !clientId || !appointmentDate || !startTime || !endTime) {
    res.status(400).json({
      error: "businessId, serviceId, clientId, appointmentDate, startTime e endTime são obrigatórios",
      code: "INVALID_PAYLOAD",
      overrideable: false,
    });
    return;
  }
  try {
    const validation = await validateAppointmentSlot(
      businessId,
      appointmentDate,
      startTime,
      endTime,
      undefined,
      resolvedAllowOverride
    );
    console.info("[manual-override-debug][backend][appointments:POST][validation]", {
      allowOverride: resolvedAllowOverride,
      valid: validation.valid,
      code: validation.code,
      reason: validation.reason,
      overrideable: validation.overrideable,
    });
    if (!validation.valid) {
      res.status(409).json({
        error: validation.reason,
        code: validation.code,
        overrideable: Boolean(validation.overrideable),
      });
      return;
    }
    const data = await createAppointment({
      businessId,
      serviceId: primaryServiceId,
      serviceIds: Array.isArray(serviceIds) ? serviceIds : undefined,
      clientId,
      appointmentDate,
      startTime,
      endTime,
      chargedAmount: Number(chargedAmount) || 0,
      status: status ?? "pending",
      notes,
      appointmentType: appointmentType ?? appointment_type,
      customDurationMinutes: customDurationMinutes ? Number(customDurationMinutes) : undefined,
    });
    res.status(201).json(data);
  } catch (err: any) {
    if (err?.code === "INVALID_PAYLOAD") {
      res.status(400).json({ error: err.message, code: err.code, overrideable: false });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

async function handlePendingPayments(req: Request, res: Response) {
  const { businessId } = req.query;
  console.info("[pending-payments][backend][route-entry]", {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    businessId,
  });
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  try {
    res.json(await getPendingPayments(businessId as string));
  } catch (err: any) {
    console.error("[pending-payments][backend][route-error]", {
      message: err?.message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
      stack: err?.stack,
    });
    res.status(500).json({
      error: err.message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
    });
  }
}

appointmentsRouter.get("/pending-payments", handlePendingPayments);

appointmentsRouter.post("/:id/confirm-manual", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { businessId } = req.query;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  try {
    res.json(await confirmAppointmentManually(id, businessId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

appointmentsRouter.put("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  const { appointmentDate, appointment_date, date, startTime, endTime, paymentStatus, allowOverride, forceScheduleOverride } = req.body;
  const resolvedDate = appointmentDate ?? appointment_date ?? date;
  const resolvedAllowOverride = Boolean(allowOverride ?? forceScheduleOverride);
  console.info("[manual-override-debug][backend][appointments:PUT][received]", {
    appointmentId: id,
    allowOverride,
    forceScheduleOverride,
    resolvedAllowOverride,
    businessId,
    appointmentDate: resolvedDate,
    startTime,
    endTime,
    paymentStatus,
  });
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatório", code: "INVALID_PAYLOAD", overrideable: false });
    return;
  }
  if (paymentStatus !== "cancelled" && resolvedDate && startTime && endTime) {
    try {
      const validation = await validateAppointmentSlot(
        businessId as string,
        resolvedDate,
        startTime,
        endTime,
        id,
        resolvedAllowOverride
      );
      console.info("[manual-override-debug][backend][appointments:PUT][validation]", {
        appointmentId: id,
        allowOverride: resolvedAllowOverride,
        valid: validation.valid,
        code: validation.code,
        reason: validation.reason,
        overrideable: validation.overrideable,
      });
      if (!validation.valid) {
        res.status(409).json({
          error: validation.reason,
          code: validation.code,
          overrideable: Boolean(validation.overrideable),
        });
        return;
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
      return;
    }
  }
  try {
    res.json(await updateAppointment(id, businessId as string, req.body));
  } catch (err: any) {
    if (err?.code === "INVALID_PAYLOAD") {
      res.status(400).json({ error: err.message, code: err.code, overrideable: false });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

appointmentsRouter.delete("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  try {
    res.json(await deleteAppointment(id, businessId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

appointmentsRouter.get("/all", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 100);
  try {
    res.json(await getAllAppointments(businessId as string, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

appointmentsRouter.get("/available-slots", async (req: Request, res: Response) => {
  const { businessId, date, duration, period, excludeAppointmentId } = req.query;
  if (!businessId || !date || !duration) {
    res.status(400).json({ error: "businessId, date e duration são obrigatórios" });
    return;
  }
  try {
    const slots = await getAvailableSlots(
      businessId as string,
      date as string,
      Number(duration),
      period as any,
      false,
      undefined,
      excludeAppointmentId as string | undefined
    );
    res.json({ slots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

appointmentsRouter.get("/by-month", async (req: Request, res: Response) => {
  const { businessId, year, month } = req.query;
  if (!businessId || !year || !month) {
    res.status(400).json({ error: "businessId, year e month obrigatórios" });
    return;
  }
  try {
    res.json(await getAppointmentsByMonth(businessId as string, Number(year), Number(month)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

appointmentsRouter.get("/by-date", async (req: Request, res: Response) => {
  const { businessId, date } = req.query;
  if (!businessId || !date) {
    res.status(400).json({ error: "businessId e date são obrigatórios" });
    return;
  }
  try {
    const data = await getAppointmentsByDate(businessId as string, date as string);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
