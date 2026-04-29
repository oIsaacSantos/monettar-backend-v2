import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { todayBRT } from "../utils/date";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let vapidConfigured = false;

function configureWebPush() {
  if (vapidConfigured) return;

  const email = process.env.VAPID_EMAIL;
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!email || !publicKey || !privateKey) {
    const message = `VAPID env vars not configured. Present: email=${!!email} publicKey=${!!publicKey} privateKey=${!!privateKey}`;
    console.error(`[push] ${message}`);
    throw new Error(message);
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendPushToBusiness(
  businessId: string,
  payload: { title: string; body: string; url?: string }
) {
  const { data, error: dbError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, subscription")
    .eq("business_id", businessId);

  if (dbError) {
    console.error(`[push] Failed to load subscriptions for business ${businessId}:`, dbError.message);
    return { found: 0, sent: 0, failed: 1, errors: [{ error: dbError.message }] };
  }

  const subscriptions = data ?? [];
  if (subscriptions.length === 0) {
    console.warn(`[push] No subscription for business ${businessId}`);
    return { found: 0, sent: 0, failed: 0, errors: [{ error: "No subscription for business" }] };
  }

  const result: {
    found: number;
    sent: number;
    failed: number;
    errors: Array<{ endpoint?: string | null; error: string; statusCode?: number }>;
  } = { found: subscriptions.length, sent: 0, failed: 0, errors: [] };

  configureWebPush();

  for (const row of subscriptions as any[]) {
    const endpoint = row.endpoint ?? null;
    let sub: any;
    try {
      sub = typeof row.subscription === "string" ? JSON.parse(row.subscription) : row.subscription;
    } catch {
      console.error(`[push] Invalid subscription JSON for business ${businessId}`, endpoint);
      result.failed += 1;
      result.errors.push({ endpoint, error: "Invalid subscription JSON" });
      continue;
    }

    try {
      console.log(`[push] Sending "${payload.title}" to business ${businessId}`, endpoint);
      await webpush.sendNotification(sub, JSON.stringify(payload));
      console.log(`[push] OK - business ${businessId}`, endpoint);
      result.sent += 1;
    } catch (err: any) {
      const statusCode = err?.statusCode;
      const error = err?.message ?? "Push send error";
      console.error(`[push] Error for business ${businessId}:`, statusCode, error, endpoint);
      result.failed += 1;
      result.errors.push({ endpoint, error, statusCode });

      if (statusCode === 404 || statusCode === 410) {
        const deleteQuery = supabase.from("push_subscriptions").delete();
        if (row.id) {
          await deleteQuery.eq("id", row.id);
        } else if (endpoint) {
          await deleteQuery.eq("endpoint", endpoint);
        }
        console.log(`[push] Removed stale subscription for business ${businessId}`, endpoint);
      }
    }
  }

  return result;
}

export async function sendDayStartNotification(businessId: string) {
  const today = todayBRT();
  const { data: appointments } = await supabase
    .from("appointments")
    .select("start_time, clients(name)")
    .eq("business_id", businessId)
    .eq("appointment_date", today)
    .neq("payment_status", "cancelled")
    .order("start_time", { ascending: true });

  const count = appointments?.length ?? 0;
  const first = appointments?.[0];
  const firstTime = first?.start_time?.slice(0, 5) ?? "";
  const body = count > 0
    ? `Hoje você tem ${count} atendimento${count > 1 ? "s" : ""} confirmado${count > 1 ? "s" : ""}. Primeiro às ${firstTime}`
    : "Você não tem atendimentos confirmados hoje.";

  await sendPushToBusiness(businessId, {
    title: "Bom dia! ☀️",
    body,
    url: "/agenda",
  });
}
