const fs = require("fs");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const paths = require("./paths");
const settings = require("./settings");
const { requireAuth, requireRole } = require("./auth");
const { HttpError, notFound } = require("./errors");

const VERSION = require("../package.json").version;

function billingOnly(req, res, next) {
  if (!settings.isBilling()) return next(notFound("La facturación no está habilitada en esta instalación"));
  next();
}

function createApp({ logger = console } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
          "upgrade-insecure-requests": null,
        },
      },
      strictTransportSecurity: false,
    })
  );

  // La importación de planillas grandes necesita un límite mayor que el resto.
  app.use("/api/products/importar", express.json({ limit: "20mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiadas peticiones. Esperá un momento." } }));

  app.get("/api/health", (req, res) => res.json({ ok: true, version: VERSION }));
  app.get("/api/config", (req, res) => {
    const mode = settings.getMode();
    res.json({ version: VERSION, mode, isBilling: mode === "facturacion", featureFlags: settings.featureFlags(mode), negocio: settings.get("negocio_nombre", "") });
  });

  app.use("/api/auth", require("./routes/auth"));

  const api = express.Router();
  api.use(requireAuth);
  api.use("/products", require("./routes/products"));
  api.use("/sales", require("./routes/sales"));
  api.use("/movements", requireRole("admin", "supervisor"), require("./routes/movements"));
  api.use("/stats", requireRole("admin", "supervisor"), require("./routes/stats"));
  api.use("/cash", require("./routes/cash"));
  api.use("/users", require("./routes/users"));
  api.use("/settings", require("./routes/settings"));
  api.use("/clients", billingOnly, require("./routes/clients"));
  api.use("/invoices", billingOnly, require("./routes/invoices"));
  app.use("/api", api);

  app.use("/api", (req, res, next) => next(notFound("Ruta inexistente")));

  // Frontend compilado: una sola aplicación, un solo puerto.
  if (fs.existsSync(path.join(paths.FRONTEND_DIST, "index.html"))) {
    app.use(express.static(paths.FRONTEND_DIST, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(path.join(paths.FRONTEND_DIST, "index.html"));
    });
  } else {
    app.get("/", (req, res) => res.type("text").send("Falta compilar la interfaz. Ejecutá INSTALAR.bat (o npm run build)."));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") return res.status(413).json({ error: "El archivo es demasiado grande" });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Datos inválidos" });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (/CHECK constraint failed: stock/.test(err.message)) return res.status(400).json({ error: "El stock no puede quedar negativo" });
    logger.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: "Error interno. Si se repite, contactá al soporte técnico." });
  });

  return app;
}

module.exports = { createApp, VERSION };
