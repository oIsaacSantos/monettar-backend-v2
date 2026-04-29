import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OVERRIDE_TYPES = new Set([
  "block_full_day",
  "block_time_range",
  "open_full_day",
  "open_time_range",
]);

export const scheduleOverridesRouter = Router();

function isValidTime(time: unknown) {
  if (typeof time !== "string") return false;
  const match = time.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return false;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

scheduleOverridesRouter.get("/", async (req: Request, res: Response) => {
  const { businessId, date } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  let query = supabase
    .from("schedule_overrides")
    .select("*")
    .eq("business_id", businessId as string)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });

  if (date) query = query.eq("date", date as string);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data ?? []);
});

scheduleOverridesRouter.post("/", async (req: Request, res: Response) => {
  const { businessId, date, startTime, endTime, type } = req.body;
  if (!businessId || !date || !type) {
    res.status(400).json({ error: "businessId, date e type sao obrigatorios" });
    return;
  }

  if (!OVERRIDE_TYPES.has(type)) {
    res.status(400).json({ error: "Tipo de excecao invalido" });
    return;
  }

  const isTimeRange = type === "block_time_range" || type === "open_time_range";
  if (isTimeRange && (!isValidTime(startTime) || !isValidTime(endTime))) {
    res.status(400).json({ error: "startTime e endTime validos sao obrigatorios" });
    return;
  }
  if (isTimeRange && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    res.status(400).json({ error: "endTime deve ser maior que startTime" });
    return;
  }

  const payload = {
    business_id: businessId,
    date,
    start_time: isTimeRange ? startTime : null,
    end_time: isTimeRange ? endTime : null,
    type,
  };

  const { data, error } = await supabase
    .from("schedule_overrides")
    .insert(payload)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

scheduleOverridesRouter.delete("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatorio" });
    return;
  }

  const { error } = await supabase
    .from("schedule_overrides")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId as string);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});
