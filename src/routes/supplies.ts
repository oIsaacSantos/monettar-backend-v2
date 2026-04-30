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
  const { businessId, name, unit, total_cost_paid, totalCostPaid, package_quantity, packageQuantity } = req.body;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.status(201).json(await createSupply(businessId, {
      name,
      unit,
      totalCostPaid: totalCostPaid ?? total_cost_paid,
      packageQuantity: packageQuantity ?? package_quantity,
    }));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

suppliesRouter.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { businessId, name, unit, total_cost_paid, totalCostPaid, package_quantity, packageQuantity } = req.body;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.json(await updateSupply(id, businessId, {
      name,
      unit,
      totalCostPaid: totalCostPaid ?? total_cost_paid,
      packageQuantity: packageQuantity ?? package_quantity,
    }));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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
