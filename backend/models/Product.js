const mongoose = require("mongoose");
const productSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, trim: true, uppercase: true },
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String, default: "" },
  categoria: { type: String, default: "General" },
  talle: { type: String, default: "" },
  precio: { type: Number, required: true, min: 0 },
  precioCompra: { type: Number, default: 0 },
  stock: { type: Number, required: true, default: 0, min: 0 },
  stockMinimo: { type: Number, default: 5 },
  activo: { type: Boolean, default: true },
}, { timestamps: true });
module.exports = mongoose.model("Product", productSchema);
