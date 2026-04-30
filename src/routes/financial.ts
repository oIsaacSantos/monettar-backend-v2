import { Router, Request, Response } from "express";
import { currentMonthBRT } from "../utils/date";
import {
  calculateMonthlyFinancialEvolution,
  calculateMonthlyFinancialSummary,
  calculateServiceRanking,
} from "../services/financeService";

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

financialRouter.get("/service-ranking", async (req: Request, res: Response) => {
  const businessId = req.query.businessId as string;
  const month = (req.query.month as string | undefined) ?? currentMonthBRT();

  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    const ranking = await calculateServiceRanking(businessId, month);
    res.json(ranking);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

financialRouter.get("/evolution", async (req: Request, res: Response) => {
  const businessId = req.query.businessId as string;
  const requestedMonths = Number(req.query.months ?? 6);
  const months = Math.max(1, Math.min(24, Math.trunc(requestedMonths) || 6));

  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  try {
    const evolution = await calculateMonthlyFinancialEvolution(businessId, months);
    res.json(evolution);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
