import { Router, Request, Response } from "express";

export const clientsRouter = Router();

clientsRouter.post("/", async (req: Request, res: Response) => {
  const { businessId } = req.query;

  if (!businessId) {
    res.status(400).json({ error: "businessId obrigatório" });
    return;
  }

  const { name, phone } = req.body;

  if (!name || !phone) {
    res.status(400).json({ error: "name e phone obrigatórios" });
    return;
  }

  try {
    const { createClient } = await import("../services/clientsService");
    res
      .status(201)
      .json(await createClient(businessId as string, { name, phone }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
