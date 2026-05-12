import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import rateLimit from "express-rate-limit";
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
import { versionRouter } from "./routes/version";
import { packagesRouter } from "./routes/packages";
import { cronRouter } from "./routes/cron";
import { scheduleOverridesRouter } from "./routes/scheduleOverrides";
import { suppliesRouter } from "./routes/supplies";
import { serviceSuppliesRouter } from "./routes/serviceSupplies";
import { financialRouter } from "./routes/financial";
import { productSalesRouter } from "./routes/productSales";
import { productsRouter } from "./routes/products";
import { anamnesisRouter } from "./routes/anamnesis";
import { requireBusinessAccess } from "./middleware/auth";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 3001;

const publicBookingRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Muitas tentativas. Aguarde um momento e tente novamente.",
});

app.use(cors());
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    source: "backend-v2",
    timestamp: Date.now(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/dashboard", requireBusinessAccess, dashboardRouter);
app.use("/api/appointments", requireBusinessAccess, appointmentsRouter);
app.use("/api/clients", requireBusinessAccess, clientsRouter);
app.use("/api/services", requireBusinessAccess, servicesRouter);
app.use("/api/fixed-costs", requireBusinessAccess, fixedCostsRouter);
app.use("/api/supplies", requireBusinessAccess, suppliesRouter);
app.use("/api/service-supplies", requireBusinessAccess, serviceSuppliesRouter);
app.use("/api/financial", requireBusinessAccess, financialRouter);
app.use("/api/products", requireBusinessAccess, productsRouter);
app.use("/api/product-sales", requireBusinessAccess, productSalesRouter);
app.use("/api/anamnesis", requireBusinessAccess, anamnesisRouter);
app.use("/api/business", requireBusinessAccess, businessRouter);
app.use("/api/schedule-overrides", requireBusinessAccess, scheduleOverridesRouter);
app.use("/api/booking", publicBookingRateLimit, bookingRouter);
app.use("/api/booking-leads", bookingLeadsRouter);
app.use("/api/version", versionRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/auth", authRouter);
app.use("/api/packages", requireBusinessAccess, packagesRouter);
app.use("/api/cron", cronRouter);

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
