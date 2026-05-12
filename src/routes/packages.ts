import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const packagesRouter = Router();

function isMissingPaymentModeColumn(error: any) {
  return String(error?.message ?? "").includes("payment_mode") || String(error?.details ?? "").includes("payment_mode");
}

// ─── Service Packages (templates) ────────────────────────────────────────────

packagesRouter.get("/", async (req: Request, res: Response) => {
  const { businessId, serviceId, includeInactive } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatório" });
    return;
  }

  let query = supabase
    .from("service_packages")
    .select("*, services(id, name)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (!includeInactive) query = query.eq("active", true);
  if (serviceId) query = query.eq("service_id", serviceId);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

packagesRouter.post("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatório" });
    return;
  }

  const {
    serviceId, name, sessions, price, validityDays,
    minIntervalDays, maxIntervalDays, description, durationMinutes, paymentMode,
  } = req.body;

  const insertPayload = {
      business_id: businessId,
      service_id: serviceId,
      name,
      sessions: sessions ?? 3,
      price,
      validity_days: validityDays ?? 20,
      min_interval_days: minIntervalDays ?? 1,
      max_interval_days: maxIntervalDays ?? 30,
      description: description ?? null,
      duration_minutes: durationMinutes ?? null,
      payment_mode: paymentMode ?? "upfront",
    };

  let { data, error } = await supabase
    .from("service_packages")
    .insert(insertPayload)
    .select()
    .single();

  if (error && isMissingPaymentModeColumn(error)) {
    const { payment_mode, ...fallbackPayload } = insertPayload;
    const fallback = await supabase
      .from("service_packages")
      .insert(fallbackPayload)
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

packagesRouter.put("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }

  const {
    name, sessions, price, validityDays,
    minIntervalDays, maxIntervalDays, description, durationMinutes, active, paymentMode,
  } = req.body;

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (sessions !== undefined) updates.sessions = sessions;
  if (price !== undefined) updates.price = price;
  if (validityDays !== undefined) updates.validity_days = validityDays;
  if (minIntervalDays !== undefined) updates.min_interval_days = minIntervalDays;
  if (maxIntervalDays !== undefined) updates.max_interval_days = maxIntervalDays;
  if (description !== undefined) updates.description = description;
  if (durationMinutes !== undefined) updates.duration_minutes = durationMinutes;
  if (active !== undefined) updates.active = active;
  if (paymentMode !== undefined) updates.payment_mode = paymentMode;

  let { data, error } = await supabase
    .from("service_packages")
    .update(updates)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error && isMissingPaymentModeColumn(error)) {
    const { payment_mode, ...fallbackUpdates } = updates;
    const fallback = Object.keys(fallbackUpdates).length > 0
      ? await supabase
        .from("service_packages")
        .update(fallbackUpdates)
        .eq("id", id)
        .eq("business_id", businessId)
        .select()
        .single()
      : await supabase
        .from("service_packages")
        .select()
        .eq("id", id)
        .eq("business_id", businessId)
        .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

packagesRouter.delete("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }

  const { data, error } = await supabase
    .from("service_packages")
    .update({ active: false })
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ─── Client Packages ──────────────────────────────────────────────────────────

packagesRouter.patch("/client/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { sessionsUsed, status } = req.body;

  const updates: Record<string, any> = {};
  if (sessionsUsed !== undefined) updates.sessions_used = sessionsUsed;
  if (status !== undefined) updates.status = status;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar" });
    return;
  }

  const { data, error } = await supabase
    .from("client_packages")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

packagesRouter.get("/client", async (req: Request, res: Response) => {
  const { businessId, clientId } = req.query;
  if (!businessId || !clientId) {
    res.status(400).json({ error: "businessId e clientId obrigatórios" });
    return;
  }

  let { data, error } = await supabase
    .from("client_packages")
    .select(`
      *,
      package:service_packages(id, name, sessions, service_id, price, min_interval_days, max_interval_days, description, duration_minutes, payment_mode),
      sessions:client_package_sessions(id, session_number, appointment_id, notes, created_at)
    `)
    .eq("business_id", businessId)
    .eq("client_id", clientId)
    .order("purchased_at", { ascending: false });

  if (error && isMissingPaymentModeColumn(error)) {
    const fallback = await supabase
      .from("client_packages")
      .select(`
        *,
        package:service_packages(id, name, sessions, service_id, price, min_interval_days, max_interval_days, description, duration_minutes),
        sessions:client_package_sessions(id, session_number, appointment_id, notes, created_at)
      `)
      .eq("business_id", businessId)
      .eq("client_id", clientId)
      .order("purchased_at", { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

packagesRouter.post("/assign", async (req: Request, res: Response) => {
  const { businessId, clientId, packageId } = req.body;
  if (!businessId || !clientId || !packageId) {
    res.status(400).json({ error: "businessId, clientId e packageId obrigatórios" });
    return;
  }

  const { data: pkg, error: pkgErr } = await supabase
    .from("service_packages")
    .select("*")
    .eq("id", packageId)
    .eq("business_id", businessId)
    .single();

  if (pkgErr || !pkg) { res.status(404).json({ error: "Pacote não encontrado" }); return; }
  if (!pkg.active) { res.status(400).json({ error: "Pacote inativo" }); return; }

  const expiresAt = pkg.validity_days
    ? new Date(Date.now() + pkg.validity_days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: cp, error: cpErr } = await supabase
    .from("client_packages")
    .insert({
      business_id: businessId,
      client_id: clientId,
      package_id: packageId,
      sessions_total: pkg.sessions,
      sessions_used: 0,
      expires_at: expiresAt,
      status: "active",
      package_name: pkg.name,
    })
    .select()
    .single();

  if (cpErr) { res.status(500).json({ error: cpErr.message }); return; }
  res.status(201).json(cp);
});

packagesRouter.post("/use-session", async (req: Request, res: Response) => {
  const { clientPackageId, appointmentId } = req.body;

  const { data: pkg } = await supabase
    .from("client_packages")
    .select("*")
    .eq("id", clientPackageId)
    .single();

  if (!pkg) { res.status(404).json({ error: "Pacote não encontrado" }); return; }
  if (pkg.sessions_used >= pkg.sessions_total) {
    res.status(400).json({ error: "Pacote esgotado" });
    return;
  }

  const sessionNumber = pkg.sessions_used + 1;
  const newStatus = sessionNumber >= pkg.sessions_total ? "completed" : "active";

  const { data: updated, error: updateErr } = await supabase
    .from("client_packages")
    .update({ sessions_used: sessionNumber, status: newStatus })
    .eq("id", clientPackageId)
    .select()
    .single();

  if (updateErr) { res.status(500).json({ error: updateErr.message }); return; }

  const { data: session } = await supabase
    .from("client_package_sessions")
    .insert({
      client_package_id: clientPackageId,
      appointment_id: appointmentId ?? null,
      session_number: sessionNumber,
    })
    .select()
    .single();

  if (session && appointmentId) {
    await supabase
      .from("appointments")
      .update({ client_package_session_id: session.id })
      .eq("id", appointmentId);
  }

  res.json({ clientPackage: updated, session: session ?? null });
});
