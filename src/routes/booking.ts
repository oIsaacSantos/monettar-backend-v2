import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { todayBRT } from "../utils/date";
import { validateAppointmentSlot } from "../services/schedulingService";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const bookingRouter = Router();

// Busca negócio pelo slug
bookingRouter.get("/:slug/business", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, work_start_time, work_end_time, signal_type, signal_value, signal_base_value, signal_per_30min")
    .eq("slug", slug)
    .single();
  if (error || !data) { res.status(404).json({ error: "Negócio não encontrado" }); return; }
  res.json(data);
});

// Busca cliente pelo telefone
bookingRouter.get("/:slug/client", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { phone } = req.query;
  const { data: business } = await supabase
    .from("businesses").select("id").eq("slug", slug).single();
  if (!business) { res.status(404).json({ error: "Negócio não encontrado" }); return; }
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
bookingRouter.get("/:slug/services", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { data: business } = await supabase
    .from("businesses").select("id").eq("slug", slug).single();
  if (!business) { res.status(404).json({ error: "Negócio não encontrado" }); return; }
  const servicesResult = await supabase
    .from("services")
    .select("id, name, current_price, duration_minutes, description, sort_order, created_at")
    .eq("business_id", business.id)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (servicesResult.error && servicesResult.error.message.includes("sort_order")) {
    const fallback = await supabase
      .from("services")
      .select("id, name, current_price, duration_minutes, description, created_at")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .order("name", { ascending: true });

    if (fallback.error) { res.status(500).json({ error: fallback.error.message }); return; }
    res.json(fallback.data ?? []);
    return;
  }

  if (servicesResult.error) { res.status(500).json({ error: servicesResult.error.message }); return; }
  const { data } = servicesResult;
  res.json(data ?? []);
});

// Horários disponíveis (com curadoria de booking)
bookingRouter.get("/:slug/available-slots", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { date, duration, seed } = req.query;
  console.log("[booking] available-slots chamado — slug:", req.params.slug, "date:", date, "duration:", duration);
  const { data: business } = await supabase
    .from("businesses").select("id").eq("slug", slug).single();
  if (!business) { res.status(404).json({ error: "Negócio não encontrado" }); return; }
  const { getAvailableSlots } = await import("../services/schedulingService");
  const slots = await getAvailableSlots(
    business.id,
    date as string,
    Number(duration),
    undefined,
    true,
    seed ? Number(seed) : undefined
  );
  res.json({ slots });
});

// Listar agendamentos do cliente
bookingRouter.get("/:slug/my-appointments", async (req: Request, res: Response) => {
  const { phone } = req.query;
  const { data: business } = await supabase.from("businesses").select("id").eq("slug", req.params.slug).single();
  if (!business) { res.status(404).json({ error: "Não encontrado" }); return; }
  const normalized = String(phone).replace(/\D/g, "");
  const { data: client } = await supabase.from("clients").select("id").eq("business_id", business.id).ilike("phone", `%${normalized.slice(-8)}%`).single();
  if (!client) { res.json([]); return; }
  const today = todayBRT();
  const { data } = await supabase
    .from("appointments")
    .select("id, appointment_date, start_time, end_time, payment_status, services(name)")
    .eq("business_id", business.id)
    .eq("client_id", client.id)
    .gte("appointment_date", today)
    .order("appointment_date", { ascending: true });
  res.json((data ?? []).map((a: any) => ({ ...a, services: Array.isArray(a.services) ? a.services[0] : a.services })));
});

bookingRouter.get("/:slug/client-packages", async (req: Request, res: Response) => {
  const { phone } = req.query;
  const { data: business } = await supabase.from("businesses").select("id").eq("slug", req.params.slug).single();
  if (!business) { res.status(404).json({ error: "Não encontrado" }); return; }
  const normalized = String(phone).replace(/\D/g, "");
  const { data: client } = await supabase.from("clients").select("id").eq("business_id", business.id).ilike("phone", `%${normalized.slice(-8)}%`).single();
  if (!client) { res.json([]); return; }
  const { data } = await supabase
    .from("client_packages")
    .select("*, service_packages(name, sessions, service_id, services(name))")
    .eq("business_id", business.id)
    .eq("client_id", client.id)
    .eq("status", "active");
  res.json(data ?? []);
});

// Cancelar agendamento
bookingRouter.patch("/:slug/appointment/:id/cancel", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data: business } = await supabase.from("businesses").select("id").eq("slug", req.params.slug).single();
  if (!business) { res.status(404).json({ error: "Não encontrado" }); return; }
  const { data, error } = await supabase
    .from("appointments")
    .update({ payment_status: "cancelled" })
    .eq("id", id)
    .eq("business_id", business.id)
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// Criar agendamento (múltiplos serviços)
bookingRouter.post("/:slug/appointment", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { phone, name, birthdate, gender, genderCustom, serviceIds, totalDuration, serviceId, date, startTime } = req.body;

  const ids: string[] = serviceIds ?? (serviceId ? [serviceId] : []);
  if (!ids.length) { res.status(400).json({ error: "serviceIds obrigatório" }); return; }

  const { data: business } = await supabase
    .from("businesses").select("id").eq("slug", slug).single();
  if (!business) { res.status(404).json({ error: "Negócio não encontrado" }); return; }

  try {
    const normalized = phone.replace(/\D/g, "");
    let clientId: string;

    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("business_id", business.id)
      .ilike("phone", `%${normalized.slice(-8)}%`)
      .single();

    if (existing) {
      clientId = existing.id;
      const updates: Record<string, string | null> = {};
      if (name) updates.name = name;
      if (birthdate) updates.birthdate = birthdate;
      if (gender) updates.gender = gender;
      if (genderCustom) updates.gender_custom = genderCustom;
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("clients")
          .update(updates)
          .eq("id", clientId)
          .eq("business_id", business.id);
      }
    } else {
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

      if (clientErr) throw new Error(clientErr.message);
      clientId = clientData.id;
    }

    // Busca preços de todos os serviços selecionados
    const { data: servicesData } = await supabase
      .from("services")
      .select("id, current_price, duration_minutes")
      .in("id", ids);

    const totalCharged = (servicesData ?? []).reduce(
      (sum: number, s: any) => sum + Number(s.current_price), 0
    );

    // Duração total: usa totalDuration do body ou soma das durações dos serviços
    const duration = totalDuration
      ?? (servicesData ?? []).reduce((sum: number, s: any) => sum + Number(s.duration_minutes), 0)
      ?? 60;

    const [h, m] = startTime.split(":").map(Number);
    const endDate = new Date(2000, 0, 1, h, m + duration);
    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

    const validation = await validateAppointmentSlot(business.id, date, startTime, endTime);
    if (!validation.valid) {
      res.status(409).json({ error: validation.reason ?? "Este horÃ¡rio jÃ¡ estÃ¡ ocupado. Por favor escolha outro." });
      return;
    }

    const { data: conflictingAppointments, error: conflictError } = await supabase
      .from("appointments")
      .select("id")
      .eq("business_id", business.id)
      .eq("appointment_date", date)
      .eq("start_time", startTime)
      .neq("payment_status", "cancelled")
      .limit(1);

    if (conflictError) throw new Error(conflictError.message);
    if (conflictingAppointments && conflictingAppointments.length > 0) {
      res.status(409).json({ error: "Este horário já está ocupado. Por favor escolha outro." });
      return;
    }

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

    if (apptError && apptError.code === "23505") {
      res.status(409).json({ error: "Este horário já está ocupado. Por favor escolha outro." });
      return;
    }
    if (apptError) throw new Error(apptError.message);
    res.status(201).json({ appointment, clientId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
