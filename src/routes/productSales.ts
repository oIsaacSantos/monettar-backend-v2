import { Router, Request, Response } from "express";
import {
  createProductSale,
  getProductSales,
  ProductSaleError,
} from "../services/productSalesService";

export const productSalesRouter = Router();

productSalesRouter.get("/", async (req: Request, res: Response) => {
  const { businessId, month } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.json(await getProductSales(businessId as string, month as string | undefined));
  } catch (err: any) {
    const status = err instanceof ProductSaleError ? err.status : 500;
    res.status(status).json({ error: err.message });
  }
});

productSalesRouter.post("/", async (req: Request, res: Response) => {
  const { businessId, ...payload } = req.body;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    res.status(201).json(await createProductSale(businessId, payload));
  } catch (err: any) {
    const status = err instanceof ProductSaleError ? err.status : 400;
    res.status(status).json({ error: err.message });
  }
});
