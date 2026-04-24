"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const dashboard_1 = require("./routes/dashboard");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env") });
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});
app.use("/api/dashboard", dashboard_1.dashboardRouter);
app.listen(PORT, () => {
    console.log(`Backend rodando na porta ${PORT}`);
});
