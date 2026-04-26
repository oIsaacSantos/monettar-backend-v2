import { Router, Request, Response } from "express";
import { createService, updateService } from "../services/servicesService";

export const servicesRouter = Router();

servicesRouter.post("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  try {
    res.status(201).json(await createService(businessId as string, req.body));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

servicesRouter.put("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  try {
    res.json(await updateService(id, businessId as string, req.body));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
