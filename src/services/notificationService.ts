import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
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
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!email || !publicKey || !privateKey) {
    throw new Error("VAPID env vars not configured");
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendPushToBusiness(
  businessId: string,
  payload: { title: string; body: string; url?: string }
) {
  const { data } = await supabase
    .from("push_subscriptions")
    .select("subscription")
    .eq("business_id", businessId)
    .single();

  if (!data) return;

  try {
    configureWebPush();
    await webpush.sendNotification(JSON.parse(data.subscription), JSON.stringify(payload));
  } catch (err) {
    console.error("Push error:", err);
  }
}
