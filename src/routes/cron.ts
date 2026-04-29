import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { sendDayStartNotification } from "../services/notificationService";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const cronRouter = Router();

let vapidConfigured = false;

function configureWebPush() {
  if (vapidConfigured) return;

  const email = process.env.VAPID_EMAIL;
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!email || !publicKey || !privateKey) {
    const message = `VAPID env vars not configured. Present: email=${!!email} publicKey=${!!publicKey} privateKey=${!!privateKey}`;
    console.error(`[push-test] ${message}`);
    throw new Error(message);
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  vapidConfigured = true;
}

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
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("business_id", businessId);

    console.log("[push-test] businessId:", businessId);
    console.log("[push-test] subscriptions encontradas:", subscriptions);
    console.log("[push-test] erro supabase:", error);

    if (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        found: 0,
        sent: 0,
        failed: 1,
      });
      return;
    }

    if (!subscriptions || subscriptions.length === 0) {
      res.json({
        success: false,
        message: "Nenhuma subscription encontrada",
        found: 0,
        sent: 0,
        failed: 0,
      });
      return;
    }

    configureWebPush();

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          JSON.parse(sub.subscription),
          JSON.stringify({
            title: "Teste de notificacao",
            body: "Se voce recebeu isso, o push esta funcionando.",
          })
        );
        sent++;
      } catch (err: any) {
        console.log("[push-test] erro envio:", err);
        failed++;
        errors.push(err?.message ?? "Push send error");
      }
    }

    res.json({
      success: true,
      found: subscriptions.length,
      sent,
      failed,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message ?? "Push test failed",
      found: 0,
      sent: 0,
      failed: 1,
      errors: [err?.message ?? "Push test failed"],
    });
  }
});
