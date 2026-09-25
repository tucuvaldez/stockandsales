const express = require("express");
const { getDb, tx, nowIso } = require("../db");
const { requireRole } = require("../auth");
const { badRequest, notFound, conflict } = require("../errors");
const { str, num, oneOf, id, likeTerm } = require("../validate");
const { round2 } = require("../money");
const { changeStock } = require("../services/stock");
const { audit } = require("../audit");
const { ALICUOTAS_IVA } = require("../services/afip/constants");

const router = express.Router();
const canManage = requireRole("admin", "supervisor");
const ALICUOTAS = Object.keys(ALICUOTAS_IVA).map(Number);

function parseProduct(body) {
  return {
    codigo: str(body.codigo, { name: "Código", max: 40, required: true }).toUpperCase(),
    nombre: str(body.nombre, { name: "Nombre", max: 120, required: true }),
    descripcion: str(body.descripcion, { name: "Descripción", max: 300 }),
    categoria: str(body.categoria, { name: "Categoría", max: 60, fallback: "General" }),
    talle: str(body.talle, { name: "Talle", max: 30 }),
    precio: round2(num(body.precio, { name: "Precio de venta", min: 0, max: 1e10, required: true })),
    precio_compra: round2(num(body.precioCompra, { name: "Precio de costo", min: 0, max: 1e10 })),
    alicuota_iva: oneOf(num(body.alicuotaIva, { name: "IVA", fallback: 21 }), ALICUOTAS, { name: "Alícuota de IVA" }),
    stock_minimo: num(body.stockMinimo, { name: "Stock mínimo", int: true, min: 0, max: 1e7 }),
  };
}

router.get("/", (req, res) => {
  const { q, categoria, bajoStock, inactivos } = req.query;
  const where = [inactivos === "true" ? "activo = 0" : "activo = 1"];
  const params = [];
  if (q) {
    where.push("(nombre LIKE ? ESCAPE '\\' OR codigo LIKE ? ESCAPE '\\' OR talle LIKE ? ESCAPE '\\')");
    const t = likeTerm(str(q, { max: 100 }));
    params.push(t, t, t);
  }
  if (categoria) {
    where.push("categoria = ?");
    params.push(str(categoria, { max: 60 }));
  }
  if (bajoStock === "true") where.push("stock <= stock_minimo");
  const limit = num(req.query.limit, { int: true, min: 1, max: 5000, fallback: 1000 });
  res.json(getDb().prepare(`SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY nombre COLLATE NOCASE LIMIT ${limit}`).all(...params));
});

router.get("/categorias", (req, res) => {
  res.json(getDb().prepare("SELECT DISTINCT categoria FROM products WHERE activo = 1 ORDER BY categoria").all().map((r) => r.categoria));
});

// Búsqueda exacta por código (lector de código de barras).
router.get("/codigo/:codigo", (req, res) => {
  const p = getDb().prepare("SELECT * FROM products WHERE codigo = ? AND activo = 1").get(str(req.params.codigo, { max: 40 }));
  if (!p) throw notFound("No hay ningún producto con ese código");
  res.json(p);
});

router.post("/", canManage, (req, res) => {
  const data = parseProduct(req.body);
  const stockInicial = num(req.body.stock, { name: "Stock inicial", int: true, min: 0, max: 1e7 });

  const product = tx((db) => {
    const existing = db.prepare("SELECT * FROM products WHERE codigo = ?").get(data.codigo);
    if (existing?.activo) throw conflict(`Ya existe un producto con el código ${data.codigo}`);

    let productId;
    if (existing) {
      // El código pertenecía a un producto eliminado: se reactiva conservando su historial.
      db.prepare(`UPDATE products SET nombre=?, descripcion=?, categoria=?, talle=?, precio=?, precio_compra=?, alicuota_iva=?, stock_minimo=?, activo=1, updated_at=? WHERE id=?`)
        .run(data.nombre, data.descripcion, data.categoria, data.talle, data.precio, data.precio_compra, data.alicuota_iva, data.stock_minimo, nowIso(), existing.id);
      productId = existing.id;
    } else {
      const r = db
        .prepare(`INSERT INTO products (codigo, nombre, descripcion, categoria, talle, precio, precio_compra, alicuota_iva, stock_minimo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(data.codigo, data.nombre, data.descripcion, data.categoria, data.talle, data.precio, data.precio_compra, data.alicuota_iva, data.stock_minimo);
      productId = Number(r.lastInsertRowid);
    }
    if (stockInicial > 0) {
      changeStock({ productId, delta: stockInicial, tipo: "alta", motivo: "Stock inicial", user: req.user });
    }
    audit(req, existing ? "producto.reactivar" : "producto.crear", { entidad: "producto", entidadId: productId, detalle: { codigo: data.codigo, precio: data.precio, stockInicial } });
    return db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  });
  res.status(201).json(product);
});

// Editar datos. El stock NO se edita acá: se usa el ajuste de stock para que quede registrado.
router.put("/:id", canManage, (req, res) => {
  const productId = id(req.params.id);
  const data = parseProduct(req.body);
  const product = tx((db) => {
    const before = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
    if (!before) throw notFound("Producto no encontrado");
    const dup = db.prepare("SELECT id FROM products WHERE codigo = ? AND id <> ?").get(data.codigo, productId);
    if (dup) throw conflict(`El código ${data.codigo} ya lo usa otro producto`);

    db.prepare(`UPDATE products SET codigo=?, nombre=?, descripcion=?, categoria=?, talle=?, precio=?, precio_compra=?, alicuota_iva=?, stock_minimo=?, updated_at=? WHERE id=?`)
      .run(data.codigo, data.nombre, data.descripcion, data.categoria, data.talle, data.precio, data.precio_compra, data.alicuota_iva, data.stock_minimo, nowIso(), productId);

    const cambios = {};
    for (const k of Object.keys(data)) if (before[k] !== data[k]) cambios[k] = { antes: before[k], despues: data[k] };
    if (Object.keys(cambios).length) audit(req, "producto.editar", { entidad: "producto", entidadId: productId, detalle: cambios });
    return db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  });
  res.json(product);
});

router.post("/:id/stock", canManage, (req, res) => {
  const productId = id(req.params.id);
  const operacion = oneOf(req.body.operacion, ["sumar", "restar", "fijar"], { name: "Operación" });
  const cantidad = num(req.body.cantidad, { name: "Cantidad", int: true, min: operacion === "fijar" ? 0 : 1, max: 1e7, required: true });
  const motivo = str(req.body.motivo, { name: "Motivo", max: 200, required: operacion !== "sumar" });

  const product = tx((db) => {
    const p = db.prepare("SELECT * FROM products WHERE id = ? AND activo = 1").get(productId);
    if (!p) throw notFound("Producto no encontrado");
    const defaults = { sumar: "Ingreso de mercadería", restar: "Egreso manual", fijar: "Ajuste por conteo" };
    changeStock({
      productId,
      ...(operacion === "fijar" ? { setTo: cantidad } : { delta: operacion === "sumar" ? cantidad : -cantidad }),
      tipo: { sumar: "ingreso", restar: "egreso", fijar: "ajuste" }[operacion],
      motivo: motivo || defaults[operacion],
      user: req.user,
    });
    return db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  });
  res.json(product);
});

router.delete("/:id", canManage, (req, res) => {
  const productId = id(req.params.id);
  const p = getDb().prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!p) throw notFound("Producto no encontrado");
  getDb().prepare("UPDATE products SET activo = 0, updated_at = ? WHERE id = ?").run(nowIso(), productId);
  audit(req, "producto.eliminar", { entidad: "producto", entidadId: productId, detalle: { codigo: p.codigo, stock: p.stock } });
  res.json({ ok: true });
});

router.post("/:id/restaurar", canManage, (req, res) => {
  const productId = id(req.params.id);
  const r = getDb().prepare("UPDATE products SET activo = 1, updated_at = ? WHERE id = ?").run(nowIso(), productId);
  if (!r.changes) throw notFound("Producto no encontrado");
  audit(req, "producto.restaurar", { entidad: "producto", entidadId: productId });
  res.json({ ok: true });
});

/**
 * Importación masiva desde planilla. Crea los productos nuevos y actualiza los existentes (por código).
 * stockExistentes: 'ignorar' | 'sumar' | 'fijar' define qué hacer con la columna stock en productos que ya existían.
 */
router.post("/importar", canManage, (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) throw badRequest("La planilla no tiene filas");
  if (rows.length > 20000) throw badRequest("Máximo 20.000 productos por importación");
  const modo = oneOf(req.body.stockExistentes, ["ignorar", "sumar", "fijar"], { fallback: "ignorar" });

  // Validar todo antes de tocar la base: o entra la planilla completa o no entra nada.
  const parsed = rows.map((row, i) => {
    try {
      const data = parseProduct(row);
      const stock = num(row.stock, { name: "Stock", int: true, min: 0, max: 1e7, fallback: null });
      return { data, stock };
    } catch (err) {
      throw badRequest(`Fila ${i + 2}: ${err.message}`);
    }
  });
  const seen = new Set();
  for (const [i, { data }] of parsed.entries()) {
    if (seen.has(data.codigo)) throw badRequest(`Fila ${i + 2}: el código ${data.codigo} está repetido en la planilla`);
    seen.add(data.codigo);
  }

  const result = tx((db) => {
    let creados = 0, actualizados = 0;
    for (const { data, stock } of parsed) {
      const existing = db.prepare("SELECT * FROM products WHERE codigo = ?").get(data.codigo);
      if (!existing) {
        const r = db
          .prepare(`INSERT INTO products (codigo, nombre, descripcion, categoria, talle, precio, precio_compra, alicuota_iva, stock_minimo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(data.codigo, data.nombre, data.descripcion, data.categoria, data.talle, data.precio, data.precio_compra, data.alicuota_iva, data.stock_minimo);
        if (stock > 0) changeStock({ productId: Number(r.lastInsertRowid), delta: stock, tipo: "alta", motivo: "Importación - stock inicial", user: req.user });
        creados++;
      } else {
        db.prepare(`UPDATE products SET nombre=?, descripcion=?, categoria=?, talle=?, precio=?, precio_compra=?, alicuota_iva=?, stock_minimo=?, activo=1, updated_at=? WHERE id=?`)
          .run(data.nombre, data.descripcion, data.categoria, data.talle, data.precio, data.precio_compra, data.alicuota_iva, data.stock_minimo, nowIso(), existing.id);
        if (stock !== null && modo === "sumar" && stock > 0) {
          changeStock({ productId: existing.id, delta: stock, tipo: "ingreso", motivo: "Importación - ingreso", user: req.user });
        } else if (stock !== null && modo === "fijar" && stock !== existing.stock) {
          changeStock({ productId: existing.id, setTo: stock, tipo: "ajuste", motivo: "Importación - ajuste", user: req.user });
        }
        actualizados++;
      }
    }
    audit(req, "producto.importar", { detalle: { creados, actualizados, modo } });
    return { creados, actualizados };
  });
  res.json(result);
});

module.exports = router;
