const express = require("express");
const router = express.Router();
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Movement = require("../models/Movement");

router.get("/", async (req, res) => {
  try {
    const { desde, hasta, limit = 30, page = 1 } = req.query;
    const filter = {};

    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        filter.fecha.$lte = h;
      }
    }

    const sales = await Sale.find(filter)
      .sort({ fecha: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Sale.countDocuments(filter);
    res.json({ sales, total, pages: Math.ceil(total / Number(limit) || 1) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/movimientos", async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const movimientos = await Movement.find({}).sort({ fecha: -1 }).limit(Number(limit));
    res.json(movimientos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { items, metodoPago, nota, descuentoGlobal, totalFinal } = req.body;
    if (!items || items.length === 0) throw new Error("La venta debe tener al menos un producto");

    const productMap = new Map();
    for (const item of items) {
      const product = await Product.findById(item.productoId);
      if (!product) throw new Error("Producto no encontrado");
      if (product.stock < item.cantidad) {
        throw new Error(`Stock insuficiente para "${product.nombre}" (disponible: ${product.stock})`);
      }
      productMap.set(String(product._id), product);
    }

    const saleItems = [];
    for (const item of items) {
      const product = productMap.get(String(item.productoId));
      const desc = Number(item.descuentoPct || 0);
      const precioConDesc = product.precio * (1 - desc / 100);
      const subtotal = precioConDesc * item.cantidad;

      saleItems.push({
        producto: product._id,
        codigo: product.codigo,
        nombre: product.nombre,
        talle: product.talle,
        cantidad: item.cantidad,
        precioUnitario: product.precio,
        descuentoPct: desc,
        subtotal,
      });

      product.stock -= item.cantidad;
      await product.save();

      await Movement.create({
        tipo: "venta",
        producto: product._id,
        codigo: product.codigo,
        nombre: product.nombre,
        talle: product.talle || "",
        cantidad: item.cantidad,
        stockAntes: product.stock + item.cantidad,
        stockDespues: product.stock,
        motivo: "Venta",
        referencia: "Venta registrada",
        usuario: "Sistema",
      });
    }

    const sale = new Sale({
      items: saleItems,
      total: Number(totalFinal ?? saleItems.reduce((s, i) => s + i.subtotal, 0)),
      descuentoGlobal: descuentoGlobal || { tipo: "pct", valor: 0, monto: 0 },
      metodoPago,
      nota,
    });

    await sale.save();
    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) throw new Error("Venta no encontrada");

    for (const item of sale.items) {
      const product = await Product.findById(item.producto);
      if (product) {
        product.stock += item.cantidad;
        await product.save();
        await Movement.create({
          tipo: "anulacion",
          producto: product._id,
          codigo: product.codigo,
          nombre: product.nombre,
          talle: product.talle || "",
          cantidad: item.cantidad,
          stockAntes: product.stock - item.cantidad,
          stockDespues: product.stock,
          motivo: "Anulación de venta",
          referencia: sale._id,
          usuario: "Sistema",
        });
      }
    }

    await Sale.findByIdAndDelete(req.params.id);
    res.json({ message: "Venta anulada y stock restaurado" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id/devolucion", async (req, res) => {
  try {
    const { devoluciones } = req.body;
    const sale = await Sale.findById(req.params.id);
    if (!sale) throw new Error("Venta no encontrada");

    for (const dev of devoluciones) {
      if (dev.cantidad <= 0) continue;

      const product = await Product.findById(dev.productoId);
      if (!product) throw new Error("Producto no encontrado");

      product.stock += dev.cantidad;
      await product.save();

      const item = sale.items.find((i) => i.producto.toString() === dev.productoId);
      if (item) {
        item.cantidad -= dev.cantidad;
        item.subtotal = item.precioUnitario * (1 - (item.descuentoPct || 0) / 100) * item.cantidad;
      }

      await Movement.create({
        tipo: "devolucion",
        producto: product._id,
        codigo: product.codigo,
        nombre: product.nombre,
        talle: product.talle || "",
        cantidad: dev.cantidad,
        stockAntes: product.stock - dev.cantidad,
        stockDespues: product.stock,
        motivo: "Devolución de venta",
        referencia: sale._id,
        usuario: "Sistema",
      });
    }

    sale.items = sale.items.filter((i) => i.cantidad > 0);

    if (sale.items.length === 0) {
      await Sale.findByIdAndDelete(req.params.id);
      return res.json({ message: "Venta eliminada (todos los items devueltos)", deleted: true });
    }

    const subtotal = sale.items.reduce((s, i) => s + i.subtotal, 0);
    const descMonto = sale.descuentoGlobal?.monto || 0;
    sale.total = Math.max(0, subtotal - descMonto);

    sale.markModified("items");
    await sale.save();

    res.json({ message: "Devolución registrada", sale });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;