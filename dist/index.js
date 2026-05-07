"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dashboard_1 = require("./routes/dashboard");
const appointments_1 = require("./routes/appointments");
const clients_1 = require("./routes/clients");
const services_1 = require("./routes/services");
const fixedCosts_1 = require("./routes/fixedCosts");
const business_1 = require("./routes/business");
const booking_1 = require("./routes/booking");
const payments_1 = require("./routes/payments");
const auth_1 = require("./routes/auth");
const bookingLeads_1 = require("./routes/bookingLeads");
const version_1 = require("./routes/version");
const packages_1 = require("./routes/packages");
const cron_1 = require("./routes/cron");
const scheduleOverrides_1 = require("./routes/scheduleOverrides");
const supplies_1 = require("./routes/supplies");
const serviceSupplies_1 = require("./routes/serviceSupplies");
const financial_1 = require("./routes/financial");
const productSales_1 = require("./routes/productSales");
const products_1 = require("./routes/products");
const auth_2 = require("./middleware/auth");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env") });
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
const publicBookingRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Muitas tentativas. Aguarde um momento e tente novamente.",
});
app.use((0, cors_1.default)());
app.use(express_1.default.json());
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
app.use("/api/dashboard", auth_2.requireBusinessAccess, dashboard_1.dashboardRouter);
app.use("/api/appointments", auth_2.requireBusinessAccess, appointments_1.appointmentsRouter);
app.use("/api/clients", auth_2.requireBusinessAccess, clients_1.clientsRouter);
app.use("/api/services", auth_2.requireBusinessAccess, services_1.servicesRouter);
app.use("/api/fixed-costs", auth_2.requireBusinessAccess, fixedCosts_1.fixedCostsRouter);
app.use("/api/supplies", auth_2.requireBusinessAccess, supplies_1.suppliesRouter);
app.use("/api/service-supplies", auth_2.requireBusinessAccess, serviceSupplies_1.serviceSuppliesRouter);
app.use("/api/financial", auth_2.requireBusinessAccess, financial_1.financialRouter);
app.use("/api/products", auth_2.requireBusinessAccess, products_1.productsRouter);
app.use("/api/product-sales", auth_2.requireBusinessAccess, productSales_1.productSalesRouter);
app.use("/api/business", auth_2.requireBusinessAccess, business_1.businessRouter);
app.use("/api/schedule-overrides", auth_2.requireBusinessAccess, scheduleOverrides_1.scheduleOverridesRouter);
app.use("/api/booking", publicBookingRateLimit, booking_1.bookingRouter);
app.use("/api/booking-leads", bookingLeads_1.bookingLeadsRouter);
app.use("/api/version", version_1.versionRouter);
app.use("/api/payments", payments_1.paymentsRouter);
app.use("/api/auth", auth_1.authRouter);
app.use("/api/packages", auth_2.requireBusinessAccess, packages_1.packagesRouter);
app.use("/api/cron", cron_1.cronRouter);
app.listen(PORT, () => {
    console.log(`Backend rodando na porta ${PORT}`);
});
