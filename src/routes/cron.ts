import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendDayStartNotification } from "../services/notificationService";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const cronRouter = Router();

cronRouter.post("/day-start", async (req: Request, res: Response) => {
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, work_start_time");

  for (const b of businesses ?? []) {
    await sendDayStartNotification(b.id);
  }

  res.json({ ok: true });
});
