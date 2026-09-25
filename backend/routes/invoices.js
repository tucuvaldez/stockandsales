const express = require("express");
const router = express.Router();
const Invoice = require("../models/Invoice");
const config = require("../config");

router.get("/", async (req, res) => {
  if (!config.isBilling) {
    return res.status(403).json({ error: "La facturación no está habilitada." });
  }

  try {
    const invoices = await Invoice.find({}).sort({ fecha: -1 }).limit(50);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  if (!config.isBilling) {
    return res.status(403).json({ error: "La facturación no está habilitada." });
  }

  try {
    const { tipo, numero, cliente, clienteNombre, items, total, observaciones } = req.body;

    if (!tipo || !numero || !items || items.length === 0) {
      return res.status(400).json({ error: "Faltan datos mínimos para emitir la factura" });
    }

    const invoice = new Invoice({
      tipo,
      numero,
      cliente: cliente || null,
      clienteNombre: clienteNombre || "Consumidor Final",
      items,
      total,
      observaciones: observaciones || "",
      estado: "emitida",
    });

    await invoice.save();
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
