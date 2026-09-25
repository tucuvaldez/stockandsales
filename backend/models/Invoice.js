const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema({
  tipo: { type: String, enum: ["A", "B", "C", "Consumidor Final"], required: true },
  numero: { type: String, required: true, trim: true },
  fecha: { type: Date, default: Date.now },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
  clienteNombre: { type: String, default: "" },
  total: { type: Number, required: true, min: 0 },
  estado: { type: String, enum: ["draft", "emitida", "anulada"], default: "draft" },
  items: [{
    producto: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    nombre: { type: String, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    precioUnitario: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  }],
  observaciones: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Invoice", invoiceSchema);
