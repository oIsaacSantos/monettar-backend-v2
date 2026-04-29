import { Router, Request, Response } from "express";
import {
  createSupply,
  deleteSupply,
  getSupplies,
  updateSupply,
} from "../services/suppliesService";

export const suppliesRouter = Router();

suppliesRouter.get("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.json(await getSupplies(businessId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

suppliesRouter.post("/", async (req: Request, res: Response) => {
  const { businessId, name, unit, costPerUnit } = req.body;
  if (!businessId || !name) {
    res.status(400).json({ error: "businessId e name obrigatorios" });
    return;
  }

  try {
    res.status(201).json(await createSupply(businessId, { name, unit, costPerUnit }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

suppliesRouter.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { businessId, name, unit, costPerUnit } = req.body;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.json(await updateSupply(id, businessId, { name, unit, costPerUnit }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

suppliesRouter.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { businessId } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.json(await deleteSupply(id, businessId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
