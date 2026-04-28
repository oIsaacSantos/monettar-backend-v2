import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendDayStartNotification, sendPushToBusiness } from "../services/notificationService";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const cronRouter = Router();

function isCronAuthorized(req: Request) {
  return req.headers["x-cron-secret"] === process.env.CRON_SECRET;
}

cronRouter.post("/day-start", async (req: Request, res: Response) => {
  if (!isCronAuthorized(req)) {
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

cronRouter.post("/push-test", async (req: Request, res: Response) => {
  if (!isCronAuthorized(req)) {
    res.status(401).json({ success: false, error: "Nao autorizado" });
    return;
  }

  const { businessId } = req.body;
  if (!businessId) {
    res.status(400).json({ success: false, error: "businessId obrigatorio" });
    return;
  }

  try {
    const result = await sendPushToBusiness(businessId, {
      title: "Teste de notificacao",
      body: "Se voce recebeu isso, o push esta funcionando.",
      url: "/agenda",
    });

    if (result.sent === 0) {
      res.status(result.error === "No subscription for business" ? 404 : 500).json({
        success: false,
        error: result.error,
        businessId,
        sent: result.sent,
        statusCode: result.statusCode,
      });
      return;
    }

    res.json({
      success: true,
      message: "Push test sent",
      businessId,
      sent: result.sent,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message ?? "Push test failed",
      businessId,
      sent: 0,
    });
  }
});
