import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { dashboardRouter } from "./routes/dashboard";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/dashboard", dashboardRouter);

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});