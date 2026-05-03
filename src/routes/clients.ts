import { Router, Request, Response } from "express";

export const clientsRouter = Router();

clientsRouter.get("/with-stats", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  if (!businessId) { res.status(400).json({ error: "businessId obrigatório" }); return; }
  try {
    const { getClientsWithStats } = await import("../services/clientsService");
    res.json(await getClientsWithStats(businessId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

clientsRouter.post("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;

  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatório" });
    return;
  }

  const { name, phone, gender, birthDate, birth_date, birthdate } = req.body;

  if (!name || !phone) {
    res.status(400).json({ error: "name e phone obrigatórios" });
    return;
  }

  try {
    const { createClient } = await import("../services/clientsService");
    res
      .status(201)
      .json(await createClient(businessId as string, {
        name,
        phone,
        gender,
        birthDate: birthDate ?? birth_date ?? birthdate,
      }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

clientsRouter.put("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;

  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatório" });
    return;
  }

  const { name, phone, gender, birthDate, birth_date, birthdate, notes } = req.body;

  if (!name && !phone && gender === undefined && birthDate === undefined && birth_date === undefined && birthdate === undefined && notes === undefined) {
    res.status(400).json({ error: "Pelo menos um campo deve ser fornecido para atualização." });
    return;
  }

  try {
    const { updateClient } = await import("../services/clientsService");
    res.json(await updateClient(businessId as string, id, {
      name,
      phone,
      gender,
      birthDate: birthDate ?? birth_date ?? birthdate,
      notes,
    }));
  } catch (err: any) {
    if (err.message?.includes("Telefone já está em uso")) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

clientsRouter.delete("/:id", async (req: Request, res: Response) => {
  const { businessId } = req.query;
  const { id } = req.params;

  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatório" });
    return;
  }

  try {
    const { softDeleteClient } = await import("../services/clientsService");
    res.json(await softDeleteClient(businessId as string, id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
