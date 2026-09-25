const Product = require("../models/Product");
const Movement = require("../models/Movement");

const sanitizeAmount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
};

const recordMovement = async ({
  tipo,
  producto,
  cantidad,
  motivo,
  referencia,
  usuario,
  stockAntes,
  stockDespues,
}) => {
  if (!producto || !producto._id) return;

  await Movement.create({
    tipo,
    producto: producto._id,
    codigo: producto.codigo,
    nombre: producto.nombre,
    talle: producto.talle || "",
    cantidad,
    motivo: motivo || "",
    referencia: referencia || "",
    usuario: usuario || "Sistema",
    stockAntes,
    stockDespues,
  });
};

const updateStockByOperation = async ({ productId, cantidad, operacion, motivo = "Ajuste manual", referencia = "", usuario = "Sistema" }) => {
  const product = await Product.findById(productId);
  if (!product) throw new Error("Producto no encontrado");

  const stockAntes = product.stock;
  let stockDespues = stockAntes;

  if (operacion === "sumar") stockDespues = stockAntes + sanitizeAmount(cantidad);
  else if (operacion === "restar") stockDespues = Math.max(0, stockAntes - sanitizeAmount(cantidad));
  else if (operacion === "fijar") stockDespues = sanitizeAmount(cantidad);
  else throw new Error("Operación de stock inválida");

  product.stock = stockDespues;
  await product.save();

  await recordMovement({
    tipo: operacion === "sumar" ? "ingreso" : operacion === "restar" ? "egreso" : "ajuste",
    producto: product,
    cantidad: Math.abs(Number(cantidad) || 0),
    motivo,
    referencia,
    usuario,
    stockAntes,
    stockDespues,
  });

  return product;
};

module.exports = {
  updateStockByOperation,
  recordMovement,
  sanitizeAmount,
};
