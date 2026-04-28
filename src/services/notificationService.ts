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

export async function sendDayStartNotification(businessId: string) {
  const today = new Date().toISOString().slice(0, 10);
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
