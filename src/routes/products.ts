import { Router, Request, Response } from "express";
import {
  createProduct,
  deactivateProduct,
  getProducts,
  updateProduct,
} from "../services/productsService";

export const productsRouter = Router();

productsRouter.get("/", async (req: Request, res: Response) => {
  const { businessId, includeInactive } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.json(await getProducts(businessId as string, includeInactive === "true"));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

productsRouter.post("/", async (req: Request, res: Response) => {
  const { businessId, ...payload } = req.body;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.status(201).json(await createProduct(businessId, payload));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

productsRouter.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { businessId, ...payload } = req.body;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.json(await updateProduct(id, businessId, payload));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

productsRouter.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { businessId } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.json(await deactivateProduct(id, businessId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
