import { Router, Request, Response } from "express";
import { execSync } from "child_process";

export const versionRouter = Router();

versionRouter.get("/", (_req: Request, res: Response) => {
  let commit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "";
  if (!commit) {
    try {
      commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    } catch {
      commit = "unknown";
    }
  }

  res.json({
    app: "monettar-backend-v2",
    commit,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "development",
  });
});
