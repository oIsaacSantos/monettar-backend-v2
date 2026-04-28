import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const packagesRouter = Router();

// Listar pacotes de um serviço
packagesRouter.get("/", async (req: Request, res: Response) => {
  const { businessId, serviceId } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatório" });
    return;
  }

  let query = supabase
    .from("service_packages")
    .select("*")
    .eq("business_id", businessId)
    .eq("active", true);

  if (serviceId) query = query.eq("service_id", serviceId);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data ?? []);
});

// Criar pacote
packagesRouter.post("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatório" });
    return;
  }

  const { serviceId, name, sessions, price, validityDays } = req.body;
  const { data, error } = await supabase
    .from("service_packages")
    .insert({
      business_id: businessId,
      service_id: serviceId,
      name,
      sessions,
      price,
      validity_days: validityDays ?? 20,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

// Pacotes do cliente
packagesRouter.get("/client", async (req: Request, res: Response) => {
  const { businessId, clientId } = req.query;
  if (!businessId || !clientId) {
    res.status(400).json({ error: "businessId e clientId obrigatórios" });
    return;
  }

  const { data, error } = await supabase
    .from("client_packages")
    .select("*, service_packages(name, sessions, service_id)")
    .eq("business_id", businessId)
    .eq("client_id", clientId)
    .eq("status", "active");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data ?? []);
});

// Usar sessão do pacote
packagesRouter.post("/use-session", async (req: Request, res: Response) => {
  const { clientPackageId } = req.body;
  const { data: pkg } = await supabase
    .from("client_packages")
    .select("*")
    .eq("id", clientPackageId)
    .single();

  if (!pkg) {
    res.status(404).json({ error: "Pacote não encontrado" });
    return;
  }

  if (pkg.sessions_used >= pkg.sessions_total) {
    res.status(400).json({ error: "Pacote esgotado" });
    return;
  }

  const newUsed = pkg.sessions_used + 1;
  const newStatus = newUsed >= pkg.sessions_total ? "completed" : "active";
  const { data, error } = await supabase
    .from("client_packages")
    .update({ sessions_used: newUsed, status: newStatus })
    .eq("id", clientPackageId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});
