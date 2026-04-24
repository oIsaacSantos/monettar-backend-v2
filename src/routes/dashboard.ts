import { Router, Request, Response } from "express";
import { getDashboardSummary } from "../services/dashboardService";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", async (req: Request, res: Response) => {
  const businessId = req.query.businessId as string;

  if (!businessId) {
    res.status(400).json({ error: "businessId é obrigatório" });
    return;
  }

  try {
    const data = await getDashboardSummary(businessId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});