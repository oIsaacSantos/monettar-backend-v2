import { Router, Request, Response } from "express";
import {
  convertBookingLead,
  getBookingLeads,
  upsertBookingLead,
} from "../services/bookingLeadsService";

export const bookingLeadsRouter = Router();

bookingLeadsRouter.get("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;

  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatÃ³rio" });
    return;
  }

  try {
    res.json(await getBookingLeads(businessId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bookingLeadsRouter.post("/", async (req: Request, res: Response) => {
  const {
    businessId,
    clientName,
    clientPhone,
    clientEmail,
    gender,
    birthDate,
    selectedServiceId,
  } = req.body;

  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatÃ³rio" });
    return;
  }

  try {
    const lead = await upsertBookingLead({
      businessId,
      clientName,
      clientPhone,
      clientEmail,
      gender,
      birthDate,
      selectedServiceId,
    });

    res.status(200).json(lead);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

bookingLeadsRouter.patch("/:id/convert", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { appointmentId } = req.body;

  if (!id) {
    res.status(400).json({ error: "id obrigatÃ³rio" });
    return;
  }

  try {
    res.json(await convertBookingLead(id, appointmentId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
