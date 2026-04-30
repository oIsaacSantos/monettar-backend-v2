import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const fixedCostsRouter = Router();

fixedCostsRouter.get("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  const { data, error } = await supabase
    .from("fixed_costs")
    .select("id, name, category, amount, business_share_percent")
    .eq("business_id", businessId)
    .order("name", { ascending: true });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

fixedCostsRouter.post("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  const { name, category, amount, businessSharePercent, business_share_percent } = req.body;
  const { data, error } = await supabase
    .from("fixed_costs")
    .insert({
      business_id: businessId,
      name,
      category,
      amount,
      business_share_percent: businessSharePercent ?? business_share_percent ?? 100,
    })
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

fixedCostsRouter.put("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatÃ³rio" }); return; }
  const { name, category, amount, businessSharePercent, business_share_percent } = req.body;
  const { data, error } = await supabase
    .from("fixed_costs")
    .update({
      name,
      category,
      amount,
      business_share_percent: businessSharePercent ?? business_share_percent,
    })
    .eq("id", id)
    .eq("business_id", businessId)
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});
