import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const authRouter = Router();

const MP_AUTH_URL = "https://auth.mercadopago.com/authorization";
const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
const STATE_TTL_MS = 10 * 60 * 1000;

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL ?? "http://localhost:3000";
}

function getStateSecret() {
  return process.env.MERCADO_PAGO_CLIENT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signState(payload: string) {
  return crypto.createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

function createState(businessId: string) {
  const payload = base64Url(JSON.stringify({
    businessId,
    nonce: crypto.randomBytes(16).toString("base64url"),
    exp: Date.now() + STATE_TTL_MS,
  }));
  return `${payload}.${signState(payload)}`;
}

function readState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("state inválido");

  const expected = signState(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Error("state inválido");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!parsed.businessId || typeof parsed.businessId !== "string") throw new Error("state inválido");
  if (!parsed.exp || Date.now() > Number(parsed.exp)) throw new Error("state expirado");
  return parsed.businessId as string;
}

function redirectToSettings(res: Response, status: "connected" | "error") {
  const url = new URL("/configuracoes", getFrontendUrl());
  url.searchParams.set("mp", status);
  res.redirect(url.toString());
}

authRouter.get("/mercadopago/connect", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId || typeof businessId !== "string") {
    res.status(400).json({ error: "businessId obrigatório" });
    return;
  }

  try {
    const clientId = getRequiredEnv("MERCADO_PAGO_CLIENT_ID");
    const redirectUri = getRequiredEnv("MERCADO_PAGO_REDIRECT_URI");

    const { data: business, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .single();

    if (error || !business) {
      res.status(404).json({ error: "Negócio não encontrado" });
      return;
    }

    const url = new URL(MP_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", createState(businessId));

    res.json({ authorizationUrl: url.toString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Erro ao iniciar OAuth Mercado Pago" });
  }
});

authRouter.get("/mercadopago/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query;
  if (!code || typeof code !== "string" || !state || typeof state !== "string") {
    redirectToSettings(res, "error");
    return;
  }

  try {
    const businessId = readState(state);
    const clientId = getRequiredEnv("MERCADO_PAGO_CLIENT_ID");
    const clientSecret = getRequiredEnv("MERCADO_PAGO_CLIENT_SECRET");
    const redirectUri = getRequiredEnv("MERCADO_PAGO_REDIRECT_URI");

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      state,
    });

    const tokenResponse = await fetch(MP_TOKEN_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Mercado Pago OAuth token error:", tokenResponse.status, errorText);
      redirectToSettings(res, "error");
      return;
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      console.error("Mercado Pago OAuth sem access_token:", tokenData);
      redirectToSettings(res, "error");
      return;
    }

    const { error } = await supabase
      .from("businesses")
      .update({
        mp_access_token: tokenData.access_token,
        mp_refresh_token: tokenData.refresh_token ?? null,
        mp_user_id: tokenData.user_id ? String(tokenData.user_id) : null,
        mp_connected_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    if (error) {
      console.error("Erro ao salvar OAuth Mercado Pago:", error.message);
      redirectToSettings(res, "error");
      return;
    }

    redirectToSettings(res, "connected");
  } catch (err: any) {
    console.error("Mercado Pago OAuth callback inválido:", err.message ?? err);
    redirectToSettings(res, "error");
  }
});
