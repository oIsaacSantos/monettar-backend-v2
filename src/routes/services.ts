import { Router, Request, Response } from "express";
import { calculateServiceCost, createService, getServices, reorderServices, updateService } from "../services/servicesService";
import { addServiceSupply, getServiceSupplies } from "../services/suppliesService";

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

servicesRouter.get("/:id/cost", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatorio" }); return; }
  try {
    const { suppliesCost, materialCost, totalCost, currentPrice } = await calculateServiceCost(id, businessId as string);
    const margin = currentPrice > 0 ? ((currentPrice - totalCost) / currentPrice) * 100 : 0;
    res.json({ serviceId: id, suppliesCost, materialCost, totalCost, margin });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

servicesRouter.get("/:serviceId/supplies", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { serviceId } = req.params;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatorio" }); return; }
  try {
    res.json(await getServiceSupplies(serviceId, businessId as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

servicesRouter.post("/:serviceId/supplies", async (req: Request, res: Response) => {
  const { serviceId } = req.params;
  const { businessId, supplyId, quantityUsed } = req.body;
  if (!businessId || !supplyId) {
    res.status(400).json({ error: "businessId e supplyId obrigatorios" });
    return;
  }
  try {
    res.status(201).json(await addServiceSupply(serviceId, businessId, { supplyId, quantityUsed }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
