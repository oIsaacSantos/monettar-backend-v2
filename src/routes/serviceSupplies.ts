import { Router, Request, Response } from "express";
import { deleteServiceSupply } from "../services/suppliesService";

export const serviceSuppliesRouter = Router();

serviceSuppliesRouter.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { businessId } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.json(await deleteServiceSupply(id, businessId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
