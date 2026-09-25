const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  tipoDocumento: { type: String, enum: ["DNI", "CUIT", "CUIL", "LE", "LC", "Otro"], default: "DNI" },
  documento: { type: String, default: "", trim: true },
  email: { type: String, default: "", trim: true },
  telefono: { type: String, default: "", trim: true },
  direccion: { type: String, default: "", trim: true },
  ciudad: { type: String, default: "", trim: true },
  condicionIva: { type: String, default: "Consumidor Final", trim: true },
  observaciones: { type: String, default: "", trim: true },
  activo: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Client", clientSchema);
