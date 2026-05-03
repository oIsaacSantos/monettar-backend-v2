"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.versionRouter = void 0;
const express_1 = require("express");
const child_process_1 = require("child_process");
exports.versionRouter = (0, express_1.Router)();
exports.versionRouter.get("/version", async (req, res) => {
    let commit = "unknown";
    try {
        commit = (0, child_process_1.execSync)("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    }
    catch {
        // ignore if git is unavailable in production
    }
    res.json({
        app: "monettar-backend-v2",
        commit,
        timestamp: new Date().toISOString(),
        hasClientUpdateDelete: true,
    });
});
