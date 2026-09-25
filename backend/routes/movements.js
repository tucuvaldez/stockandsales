const express = require("express");
const router = express.Router();
const Movement = require("../models/Movement");

router.get("/", async (req, res) => {
  try {
    const { limit = 100, tipo } = req.query;
    const filter = {};
    if (tipo) filter.tipo = tipo;

    const movimientos = await Movement.find(filter).sort({ fecha: -1 }).limit(Number(limit));
    res.json(movimientos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
