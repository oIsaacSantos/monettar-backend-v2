"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
exports.authRouter = (0, express_1.Router)();
const MP_AUTH_URL = "https://auth.mercadopago.com/authorization";
const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
const STATE_TTL_MS = 10 * 60 * 1000;
function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`${name} não configurado`);
    return value;
}
function getFrontendUrl() {
    return process.env.FRONTEND_URL ?? "http://localhost:3000";
}
function getStateSecret() {
    return process.env.MERCADO_PAGO_CLIENT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}
function base64Url(input) {
    return Buffer.from(input).toString("base64url");
}
function signState(payload) {
    return crypto_1.default.createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}
function createState(businessId) {
    const payload = base64Url(JSON.stringify({
        businessId,
        nonce: crypto_1.default.randomBytes(16).toString("base64url"),
        exp: Date.now() + STATE_TTL_MS,
    }));
    return `${payload}.${signState(payload)}`;
}
function readState(state) {
    const [payload, signature] = state.split(".");
    if (!payload || !signature)
        throw new Error("state inválido");
    const expected = signState(payload);
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length ||
        !crypto_1.default.timingSafeEqual(expectedBuffer, signatureBuffer)) {
        throw new Error("state inválido");
    }
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.businessId || typeof parsed.businessId !== "string")
        throw new Error("state inválido");
    if (!parsed.exp || Date.now() > Number(parsed.exp))
        throw new Error("state expirado");
    return parsed.businessId;
}
function redirectToSettings(res, status) {
    const url = new URL("/configuracoes", getFrontendUrl());
    url.searchParams.set("mp", status);
    res.redirect(url.toString());
}
exports.authRouter.get("/mercadopago/connect", async (req, res) => {
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
    }
    catch (err) {
        res.status(500).json({ error: err.message ?? "Erro ao iniciar OAuth Mercado Pago" });
    }
});
exports.authRouter.get("/mercadopago/callback", async (req, res) => {
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
    }
    catch (err) {
        console.error("Mercado Pago OAuth callback inválido:", err.message ?? err);
        redirectToSettings(res, "error");
    }
});
