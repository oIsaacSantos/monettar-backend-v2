"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingRouter = void 0;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
exports.bookingRouter = (0, express_1.Router)();
// Busca negócio pelo slug
exports.bookingRouter.get("/:slug/business", async (req, res) => {
    const { slug } = req.params;
    const { data, error } = await supabase
        .from("businesses")
        .select("id, name, work_start_time, work_end_time, signal_type, signal_value, signal_base_value, signal_per_30min")
        .eq("slug", slug)
        .single();
    if (error || !data) {
        res.status(404).json({ error: "Negócio não encontrado" });
        return;
    }
    res.json(data);
});
// Busca cliente pelo telefone
exports.bookingRouter.get("/:slug/client", async (req, res) => {
    const { slug } = req.params;
    const { phone } = req.query;
    const { data: business } = await supabase
        .from("businesses").select("id").eq("slug", slug).single();
    if (!business) {
        res.status(404).json({ error: "Negócio não encontrado" });
        return;
    }
    const normalized = String(phone).replace(/\D/g, "");
    const { data } = await supabase
        .from("clients")
        .select("id, name, phone")
        .eq("business_id", business.id)
        .ilike("phone", `%${normalized.slice(-8)}%`)
        .single();
    res.json({ found: !!data, client: data ?? null });
});
// Lista serviços ativos do negócio
exports.bookingRouter.get("/:slug/services", async (req, res) => {
    const { slug } = req.params;
    const { data: business } = await supabase
        .from("businesses").select("id").eq("slug", slug).single();
    if (!business) {
        res.status(404).json({ error: "Negócio não encontrado" });
        return;
    }
    const { data } = await supabase
        .from("services")
        .select("id, name, current_price, duration_minutes, description")
        .eq("business_id", business.id)
        .eq("active", true)
        .order("name");
    res.json(data ?? []);
});
// Horários disponíveis (com curadoria de booking)
exports.bookingRouter.get("/:slug/available-slots", async (req, res) => {
    const { slug } = req.params;
    const { date, duration, period, seed } = req.query;
    console.log("[booking] available-slots chamado — slug:", req.params.slug, "date:", date, "duration:", duration, "period:", period);
    const { data: business } = await supabase
        .from("businesses").select("id").eq("slug", slug).single();
    if (!business) {
        res.status(404).json({ error: "Negócio não encontrado" });
        return;
    }
    const { getAvailableSlots } = await Promise.resolve().then(() => __importStar(require("../services/schedulingService")));
    const slots = await getAvailableSlots(business.id, date, Number(duration), period, true, seed ? Number(seed) : undefined);
    res.json({ slots });
});
// Listar agendamentos do cliente
exports.bookingRouter.get("/:slug/my-appointments", async (req, res) => {
    const { phone } = req.query;
    const { data: business } = await supabase.from("businesses").select("id").eq("slug", req.params.slug).single();
    if (!business) {
        res.status(404).json({ error: "Não encontrado" });
        return;
    }
    const normalized = String(phone).replace(/\D/g, "");
    const { data: client } = await supabase.from("clients").select("id").eq("business_id", business.id).ilike("phone", `%${normalized.slice(-8)}%`).single();
    if (!client) {
        res.json([]);
        return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
        .from("appointments")
        .select("id, appointment_date, start_time, end_time, payment_status, services(name)")
        .eq("business_id", business.id)
        .eq("client_id", client.id)
        .gte("appointment_date", today)
        .order("appointment_date", { ascending: true });
    res.json((data ?? []).map((a) => ({ ...a, services: Array.isArray(a.services) ? a.services[0] : a.services })));
});
exports.bookingRouter.get("/:slug/client-packages", async (req, res) => {
    const { phone } = req.query;
    const { data: business } = await supabase.from("businesses").select("id").eq("slug", req.params.slug).single();
    if (!business) {
        res.status(404).json({ error: "Não encontrado" });
        return;
    }
    const normalized = String(phone).replace(/\D/g, "");
    const { data: client } = await supabase.from("clients").select("id").eq("business_id", business.id).ilike("phone", `%${normalized.slice(-8)}%`).single();
    if (!client) {
        res.json([]);
        return;
    }
    const { data } = await supabase
        .from("client_packages")
        .select("*, service_packages(name, sessions, service_id, services(name))")
        .eq("business_id", business.id)
        .eq("client_id", client.id)
        .eq("status", "active");
    res.json(data ?? []);
});
// Cancelar agendamento
exports.bookingRouter.patch("/:slug/appointment/:id/cancel", async (req, res) => {
    const { id } = req.params;
    const { data: business } = await supabase.from("businesses").select("id").eq("slug", req.params.slug).single();
    if (!business) {
        res.status(404).json({ error: "Não encontrado" });
        return;
    }
    const { data, error } = await supabase
        .from("appointments")
        .update({ payment_status: "cancelled" })
        .eq("id", id)
        .eq("business_id", business.id)
        .select().single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
// Criar agendamento (múltiplos serviços)
exports.bookingRouter.post("/:slug/appointment", async (req, res) => {
    const { slug } = req.params;
    const { phone, name, birthdate, gender, genderCustom, serviceIds, totalDuration, serviceId, date, startTime } = req.body;
    const ids = serviceIds ?? (serviceId ? [serviceId] : []);
    if (!ids.length) {
        res.status(400).json({ error: "serviceIds obrigatório" });
        return;
    }
    const { data: business } = await supabase
        .from("businesses").select("id").eq("slug", slug).single();
    if (!business) {
        res.status(404).json({ error: "Negócio não encontrado" });
        return;
    }
    try {
        const normalized = phone.replace(/\D/g, "");
        let clientId;
        const { data: existing } = await supabase
            .from("clients")
            .select("id")
            .eq("business_id", business.id)
            .ilike("phone", `%${normalized.slice(-8)}%`)
            .single();
        if (existing) {
            clientId = existing.id;
        }
        else {
            const insertResult = await supabase
                .from("clients")
                .insert({
                business_id: business.id,
                name,
                phone: normalized,
                birthdate: birthdate || null,
                gender: gender || null,
                gender_custom: genderCustom || null,
            })
                .select().single();
            let clientData = insertResult.data;
            let clientErr = insertResult.error;
            if (clientErr) {
                const fallback = await supabase
                    .from("clients")
                    .insert({ business_id: business.id, name, phone: normalized })
                    .select().single();
                clientData = fallback.data;
                clientErr = fallback.error;
            }
            if (clientErr)
                throw new Error(clientErr.message);
            clientId = clientData.id;
        }
        // Busca preços de todos os serviços selecionados
        const { data: servicesData } = await supabase
            .from("services")
            .select("id, current_price, duration_minutes")
            .in("id", ids);
        const totalCharged = (servicesData ?? []).reduce((sum, s) => sum + Number(s.current_price), 0);
        // Duração total: usa totalDuration do body ou soma das durações dos serviços
        const duration = totalDuration
            ?? (servicesData ?? []).reduce((sum, s) => sum + Number(s.duration_minutes), 0)
            ?? 60;
        const [h, m] = startTime.split(":").map(Number);
        const endDate = new Date(2000, 0, 1, h, m + duration);
        const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
        const { data: appointment, error: apptError } = await supabase
            .from("appointments")
            .insert({
            business_id: business.id,
            client_id: clientId,
            service_id: ids[0],
            appointment_date: date,
            start_time: startTime,
            end_time: endTime,
            charged_amount: totalCharged,
            discount: 0,
            payment_status: "pending",
        })
            .select().single();
        if (apptError)
            throw new Error(apptError.message);
        res.status(201).json({ appointment, clientId });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
