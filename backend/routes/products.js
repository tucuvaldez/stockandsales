const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { updateStockByOperation } = require("../services/stockService");

router.get("/", async (req, res) => {
  try {
    const { nombre, talle, codigo, bajoStock } = req.query;
    const filter = { activo: true };

    if (nombre) filter.nombre = { $regex: nombre, $options: "i" };
    if (talle) filter.talle = { $regex: talle, $options: "i" };
    if (codigo) filter.codigo = { $regex: codigo, $options: "i" };
    if (bajoStock === "true") filter.$expr = { $lte: ["$stock", "$stockMinimo"] };

    const products = await Product.find(filter).sort({ nombre: 1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = {
      ...req.body,
      codigo: String(req.body.codigo || "").trim(),
      nombre: String(req.body.nombre || "").trim(),
      descripcion: String(req.body.descripcion || "").trim(),
      categoria: String(req.body.categoria || "General").trim(),
      talle: String(req.body.talle || "").trim(),
    };

    if (!payload.codigo || !payload.nombre || payload.precio === undefined || payload.precio === null) {
      return res.status(400).json({ error: "Código, nombre y precio son obligatorios" });
    }

    const p = new Product(payload);
    await p.save();
    res.status(201).json(p);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "El código de artículo ya existe" });
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const payload = {
      ...req.body,
      codigo: String(req.body.codigo || "").trim(),
      nombre: String(req.body.nombre || "").trim(),
      descripcion: String(req.body.descripcion || "").trim(),
      categoria: String(req.body.categoria || "General").trim(),
      talle: String(req.body.talle || "").trim(),
    };

    const p = await Product.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!p) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(p);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "El código ya existe" });
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id/stock", async (req, res) => {
  try {
    const { cantidad, operacion, motivo, referencia, usuario } = req.body;
    const product = await updateStockByOperation({
      productId: req.params.id,
      cantidad,
      operacion,
      motivo,
      referencia,
      usuario,
    });
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const p = await Product.findByIdAndUpdate(req.params.id, { activo: false }, { new: true });
    if (!p) return res.status(404).json({ error: "Producto no encontrado" });
    res.json({ message: "Eliminado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
