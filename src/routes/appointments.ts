import { Router, Request, Response } from "express";
import { deleteAppointment, getAllAppointments, getAppointmentsByDate, getAppointmentsByMonth, updateAppointment } from "../services/appointmentsService";
import { getAvailableSlots } from "../services/schedulingService";

export const appointmentsRouter = Router();

appointmentsRouter.put("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  try {
    res.json(await updateAppointment(id, businessId as string, req.body));
  } catch (err: any) {
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
  try {
    res.json(await getAllAppointments(businessId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

appointmentsRouter.get("/available-slots", async (req: Request, res: Response) => {
  const { businessId, date, duration, period } = req.query;
  if (!businessId || !date || !duration) {
    res.status(400).json({ error: "businessId, date e duration são obrigatórios" });
    return;
  }
  try {
    const slots = await getAvailableSlots(
      businessId as string,
      date as string,
      Number(duration),
      period as any
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
