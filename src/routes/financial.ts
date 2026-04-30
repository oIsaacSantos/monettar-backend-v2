import { Router, Request, Response } from "express";
import { currentMonthBRT } from "../utils/date";
import { calculateMonthlyFinancialSummary } from "../services/financeService";

export const financialRouter = Router();

financialRouter.get("/month-summary", async (req: Request, res: Response) => {
  const businessId = req.query.businessId as string;
  const month = (req.query.month as string | undefined) ?? currentMonthBRT();

  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    const summary = await calculateMonthlyFinancialSummary(businessId, month);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
