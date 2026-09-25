const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  codigo: String,
  nombre: String,
  talle: String,
  cantidad: { type: Number, required: true, min: 1 },
  precioUnitario: { type: Number, required: true },
  descuentoPct: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
});

const saleSchema = new mongoose.Schema({
  items: [saleItemSchema],
  total: { type: Number, required: true },
  descuentoGlobal: {
    tipo: { type: String, enum: ["pct", "monto"], default: "pct" },
    valor: { type: Number, default: 0 },
    monto: { type: Number, default: 0 },
  },
  metodoPago: { type: String, enum: ["efectivo", "tarjeta", "transferencia", "otro"], default: "efectivo" },
  nota: { type: String, default: "" },
  fecha: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("Sale", saleSchema);
