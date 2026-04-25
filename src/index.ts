import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { dashboardRouter } from "./routes/dashboard";
import { appointmentsRouter } from "./routes/appointments";
import { clientsRouter } from "./routes/clients";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/dashboard", dashboardRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/clients", clientsRouter);

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
