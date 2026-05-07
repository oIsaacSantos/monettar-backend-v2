"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.versionRouter = void 0;
const express_1 = require("express");
const child_process_1 = require("child_process");
exports.versionRouter = (0, express_1.Router)();
exports.versionRouter.get("/", (_req, res) => {
    let commit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "";
    if (!commit) {
        try {
            commit = (0, child_process_1.execSync)("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
        }
        catch {
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
