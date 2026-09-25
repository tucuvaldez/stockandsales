const express = require("express");
const router = express.Router();
const Client = require("../models/Client");

router.get("/", async (req, res) => {
  try {
    const { nombre, documento, activo = "true" } = req.query;
    const filter = { activo: activo === "true" };

    if (nombre) filter.nombre = { $regex: nombre, $options: "i" };
    if (documento) filter.documento = { $regex: documento, $options: "i" };

    const clients = await Client.find(filter).sort({ nombre: 1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = {
      ...req.body,
      nombre: String(req.body.nombre || "").trim(),
      documento: String(req.body.documento || "").trim(),
      email: String(req.body.email || "").trim(),
      telefono: String(req.body.telefono || "").trim(),
      direccion: String(req.body.direccion || "").trim(),
      ciudad: String(req.body.ciudad || "").trim(),
      condicionIva: String(req.body.condicionIva || "Consumidor Final").trim(),
    };

    if (!payload.nombre) {
      return res.status(400).json({ error: "El nombre del cliente es obligatorio" });
    }

    const client = new Client(payload);
    await client.save();
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
