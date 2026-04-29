import { Router, Request, Response } from "express";
import { createService, getServices, reorderServices, updateService } from "../services/servicesService";

export const servicesRouter = Router();

servicesRouter.get("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatorio" }); return; }
  try {
    res.json(await getServices(businessId as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

servicesRouter.post("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatorio" }); return; }
  try {
    res.status(201).json(await createService(businessId as string, req.body));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

servicesRouter.patch("/reorder", async (req: Request, res: Response) => {
  const { businessId, serviceIds } = req.body;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatorio" }); return; }
  if (!Array.isArray(serviceIds)) { res.status(400).json({ error: "serviceIds obrigatorio" }); return; }
  try {
    res.json(await reorderServices(businessId as string, serviceIds));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

servicesRouter.put("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatorio" }); return; }
  try {
    res.json(await updateService(id, businessId as string, req.body));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
