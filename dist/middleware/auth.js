"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireBusinessAccess = requireBusinessAccess;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function getBusinessId(req) {
    const queryBusinessId = req.query.businessId;
    if (typeof queryBusinessId === "string" && queryBusinessId.trim()) {
        return queryBusinessId;
    }
    const bodyBusinessId = req.body?.businessId;
    if (typeof bodyBusinessId === "string" && bodyBusinessId.trim()) {
        return bodyBusinessId;
    }
    return null;
}
function getBearerToken(req) {
    const authorization = req.headers.authorization;
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    return match?.[1] ?? null;
}
async function requireBusinessAccess(req, res, next) {
    const businessId = getBusinessId(req);
    if (!businessId) {
        next();
        return;
    }
    const token = getBearerToken(req);
    if (!token) {
        res.status(401).json({ error: "Token de autenticação obrigatório." });
        return;
    }
    try {
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        const user = userData.user;
        if (userError || !user) {
            res.status(401).json({ error: "Token inválido ou expirado." });
            return;
        }
        const { data: business, error: businessError } = await supabase
            .from("businesses")
            .select("id")
            .eq("id", businessId)
            .eq("user_id", user.id)
            .single();
        if (businessError && businessError.code !== "PGRST116") {
            console.error("[auth] erro ao validar acesso ao negocio:", businessError.message);
            res.status(500).json({ error: "Erro ao validar acesso ao negocio." });
            return;
        }
        if (!business) {
            res.status(403).json({ error: "Acesso negado a este negócio." });
            return;
        }
        next();
    }
    catch (err) {
        console.error("[auth] erro inesperado:", err);
        res.status(500).json({ error: "Erro ao validar acesso ao negocio." });
    }
}
