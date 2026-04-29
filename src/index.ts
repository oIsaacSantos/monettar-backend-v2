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
import { authRouter } from "./routes/auth";
import { bookingLeadsRouter } from "./routes/bookingLeads";
import { packagesRouter } from "./routes/packages";
import { cronRouter } from "./routes/cron";
import { requireBusinessAccess } from "./middleware/auth";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/dashboard", requireBusinessAccess, dashboardRouter);
app.use("/api/appointments", requireBusinessAccess, appointmentsRouter);
app.use("/api/clients", requireBusinessAccess, clientsRouter);
app.use("/api/services", requireBusinessAccess, servicesRouter);
app.use("/api/fixed-costs", requireBusinessAccess, fixedCostsRouter);
app.use("/api/business", requireBusinessAccess, businessRouter);
app.use("/api/booking", bookingRouter);
app.use("/api/booking-leads", bookingLeadsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/auth", authRouter);
app.use("/api/packages", requireBusinessAccess, packagesRouter);
app.use("/api/cron", cronRouter);

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
