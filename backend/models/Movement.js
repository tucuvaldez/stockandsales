const mongoose = require("mongoose");

const movementSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["ingreso", "egreso", "venta", "devolucion", "ajuste", "anulacion"],
    required: true,
  },
  producto: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  codigo: { type: String, required: true, trim: true },
  nombre: { type: String, required: true, trim: true },
  talle: { type: String, default: "" },
  cantidad: { type: Number, required: true },
  stockAntes: { type: Number, required: true },
  stockDespues: { type: Number, required: true },
  motivo: { type: String, default: "" },
  referencia: { type: String, default: "" },
  usuario: { type: String, default: "Sistema" },
  fecha: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("Movement", movementSchema);
