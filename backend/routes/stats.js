const express = require("express");
const router = express.Router();
const Sale = require("../models/Sale");
const Product = require("../models/Product");

router.get("/dashboard", async (req, res) => {
  try {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const manana = new Date(hoy); manana.setDate(manana.getDate()+1);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const hace7 = new Date(hoy); hace7.setDate(hace7.getDate()-6);

    const [ventasHoy, ventasMes, bajoStock, totalProductos, topProductos, ventasPorDia] = await Promise.all([
      Sale.aggregate([{ $match: { fecha: { $gte: hoy, $lt: manana } } }, { $group: { _id: null, total: { $sum: "$total" }, cantidad: { $sum: 1 } } }]),
      Sale.aggregate([{ $match: { fecha: { $gte: inicioMes } } }, { $group: { _id: null, total: { $sum: "$total" }, cantidad: { $sum: 1 } } }]),
      Product.find({ activo: true, $expr: { $lte: ["$stock","$stockMinimo"] } }).select("codigo nombre talle stock stockMinimo"),
      Product.countDocuments({ activo: true }),
      Sale.aggregate([
        { $match: { fecha: { $gte: inicioMes } } },
        { $unwind: "$items" },
        { $group: { _id: "$items.codigo", nombre: { $first: "$items.nombre" }, totalVendido: { $sum: "$items.cantidad" }, totalIngresos: { $sum: "$items.subtotal" } } },
        { $sort: { totalVendido: -1 } }, { $limit: 5 }
      ]),
      Sale.aggregate([
        { $match: { fecha: { $gte: hace7 } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$fecha" } }, total: { $sum: "$total" }, cantidad: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
    ]);

    res.json({
      ventasHoy: ventasHoy[0] || { total: 0, cantidad: 0 },
      ventasMes: ventasMes[0] || { total: 0, cantidad: 0 },
      bajoStock, totalProductos, topProductos, ventasPorDia,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
