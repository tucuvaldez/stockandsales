const express = require("express");
const router = express.Router();
const config = require("../config");

router.get("/status", async (req, res) => {
  if (!config.isBilling) {
    return res.status(403).json({ error: "La facturación no está habilitada en este modo." });
  }

  res.json({
    enabled: true,
    mode: config.APP_MODE,
    invoiceTypes: ["A", "B", "C", "Consumidor Final"],
    features: config.featureFlags,
  });
});

router.get("/invoices", async (req, res) => {
  if (!config.isBilling) {
    return res.status(403).json({ error: "La facturación no está habilitada en este modo." });
  }

  res.json({
    invoices: [],
    message: "Módulo de facturación preparado para integrar con AFIP o proveedor externo.",
  });
});

module.exports = router;
