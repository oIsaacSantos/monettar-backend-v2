import { Router, Request, Response } from "express";
import { getAllAppointments, getAppointmentsByDate } from "../services/appointmentsService";

export const appointmentsRouter = Router();

appointmentsRouter.get("/all", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  try {
    res.json(await getAllAppointments(businessId as string));
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
