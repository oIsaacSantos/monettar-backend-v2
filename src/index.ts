import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { dashboardRouter } from "./routes/dashboard";
import { appointmentsRouter } from "./routes/appointments";
import { clientsRouter } from "./routes/clients";
import { servicesRouter } from "./routes/services";
import { fixedCostsRouter } from "./routes/fixedCosts";
import { businessRouter } from "./routes/business";
import { bookingRouter } from "./routes/booking";
import { paymentsRouter } from "./routes/payments";

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
app.use("/api/services", servicesRouter);
app.use("/api/fixed-costs", fixedCostsRouter);
app.use("/api/business", businessRouter);
app.use("/api/booking", bookingRouter);
app.use("/api/payments", paymentsRouter);

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
