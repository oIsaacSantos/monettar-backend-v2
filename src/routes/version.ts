import { Router, Request, Response } from "express";
import { execSync } from "child_process";

export const versionRouter = Router();

versionRouter.get("/version", async (req: Request, res: Response) => {
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    // ignore if git is unavailable in production
  }

  res.json({
    app: "monettar-backend-v2",
    commit,
    timestamp: new Date().toISOString(),
    hasClientUpdateDelete: true,
  });
});
