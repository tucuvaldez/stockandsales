require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const config = require("./config");

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas peticiones. Intenta nuevamente más tarde." },
  })
);

app.get("/api/health", (req, res) => res.json({ status: "ok", mode: config.APP_MODE }));
app.get("/api/config", (req, res) =>
  res.json({
    mode: config.APP_MODE,
    isLocal: config.isLocal,
    isBilling: config.isBilling,
    featureFlags: config.featureFlags,
    invoiceTypes: config.isBilling ? ["A", "B", "C", "Consumidor Final"] : [],
  })
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/sales", require("./routes/sales"));
app.use("/api/movements", require("./routes/movements"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/billing", require("./routes/billing"));
app.use("/api/clients", require("./routes/clients"));
app.use("/api/invoices", require("./routes/invoices"));
app.use("/api/users", require("./routes/users"));

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Error interno del servidor" });
});

mongoose.connect(config.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB conectado");
    app.listen(config.PORT, () => console.log(`🚀 Servidor en http://localhost:${config.PORT} | modo: ${config.APP_MODE}`));
  })
  .catch((err) => {
    console.error("❌ Error MongoDB:", err.message);
    process.exit(1);
  });
