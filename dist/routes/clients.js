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
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientsRouter = void 0;
const express_1 = require("express");
exports.clientsRouter = (0, express_1.Router)();
exports.clientsRouter.get("/with-stats", async (req, res) => {
    const { businessId } = req.query;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    try {
        const { getClientsWithStats } = await Promise.resolve().then(() => __importStar(require("../services/clientsService")));
        res.json(await getClientsWithStats(businessId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.clientsRouter.post("/", async (req, res) => {
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
        const { createClient } = await Promise.resolve().then(() => __importStar(require("../services/clientsService")));
        res
            .status(201)
            .json(await createClient(businessId, {
            name,
            phone,
            gender,
            birthDate: birthDate ?? birth_date ?? birthdate,
        }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.clientsRouter.put("/:id", async (req, res) => {
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
        const { updateClient } = await Promise.resolve().then(() => __importStar(require("../services/clientsService")));
        res.json(await updateClient(businessId, id, {
            name,
            phone,
            gender,
            birthDate: birthDate ?? birth_date ?? birthdate,
            notes,
        }));
    }
    catch (err) {
        if (err.message?.includes("Telefone já está em uso")) {
            res.status(409).json({ error: err.message });
            return;
        }
        res.status(500).json({ error: err.message });
    }
});
exports.clientsRouter.delete("/:id", async (req, res) => {
    const { businessId } = req.query;
    const { id } = req.params;
    if (!businessId) {
        res.status(400).json({ error: "businessId obrigatório" });
        return;
    }
    try {
        const { softDeleteClient } = await Promise.resolve().then(() => __importStar(require("../services/clientsService")));
        res.json(await softDeleteClient(businessId, id));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
