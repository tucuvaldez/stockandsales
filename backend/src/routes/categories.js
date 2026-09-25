const express = require("express");
const { getDb, tx, nowIso } = require("../db");
const { requireRole } = require("../auth");
const { badRequest, notFound } = require("../errors");
const { str, id } = require("../validate");
const { audit } = require("../audit");
const { RUBROS } = require("../rubros");

const router = express.Router();
const canManage = requireRole("admin", "supervisor");
const DEFAULT = "General";

const list = () =>
  getDb()
    .prepare(
      `SELECT c.id, c.nombre, (SELECT COUNT(*) FROM products p WHERE p.categoria = c.nombre COLLATE NOCASE AND p.activo = 1) AS productos
       FROM categories c ORDER BY c.nombre = 'General' DESC, c.nombre COLLATE NOCASE`
    )
    .all();

// Asegura que la categoría exista (la usan productos e importación). Devuelve el nombre tal como quedó guardado.
function ensureCategory(nombre) {
  const n = String(nombre || "").trim() || DEFAULT;
  getDb().prepare("INSERT OR IGNORE INTO categories (nombre) VALUES (?)").run(n);
  return getDb().prepare("SELECT nombre FROM categories WHERE nombre = ?").get(n).nombre;
}

router.get("/", (req, res) => res.json(list()));

router.post("/", canManage, (req, res) => {
  const nombre = str(req.body.nombre, { name: "Nombre de la categoría", max: 60, required: true });
  if (getDb().prepare("SELECT 1 FROM categories WHERE nombre = ?").get(nombre)) throw badRequest("Esa categoría ya existe");
  getDb().prepare("INSERT INTO categories (nombre) VALUES (?)").run(nombre);
  audit(req, "categoria.crear", { detalle: { nombre } });
  res.status(201).json(list());
});

// Renombrar. Si el nombre nuevo ya existe, se unifican (útil para corregir "Bebida" y "Bebidas").
router.put("/:id", canManage, (req, res) => {
  const catId = id(req.params.id);
  const nombre = str(req.body.nombre, { name: "Nombre de la categoría", max: 60, required: true });
  const result = tx((db) => {
    const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(catId);
    if (!cat) throw notFound("Categoría no encontrada");
    if (cat.nombre === DEFAULT) throw badRequest(`"${DEFAULT}" no se puede renombrar`);
    const other = db.prepare("SELECT * FROM categories WHERE nombre = ? AND id <> ?").get(nombre, catId);
    db.prepare("UPDATE products SET categoria = ?, updated_at = ? WHERE categoria = ? COLLATE NOCASE").run(other ? other.nombre : nombre, nowIso(), cat.nombre);
    if (other) db.prepare("DELETE FROM categories WHERE id = ?").run(catId);
    else db.prepare("UPDATE categories SET nombre = ? WHERE id = ?").run(nombre, catId);
    audit(req, other ? "categoria.unificar" : "categoria.renombrar", { detalle: { antes: cat.nombre, despues: other ? other.nombre : nombre } });
    return { unificada: !!other };
  });
  res.json({ ...result, categorias: list() });
});

// Eliminar: sus productos pasan a "General"; no se borra ningún producto.
router.delete("/:id", canManage, (req, res) => {
  const catId = id(req.params.id);
  const movidos = tx((db) => {
    const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(catId);
    if (!cat) throw notFound("Categoría no encontrada");
    if (cat.nombre === DEFAULT) throw badRequest(`"${DEFAULT}" no se puede eliminar`);
    ensureCategory(DEFAULT);
    const r = db.prepare("UPDATE products SET categoria = ?, updated_at = ? WHERE categoria = ? COLLATE NOCASE").run(DEFAULT, nowIso(), cat.nombre);
    db.prepare("DELETE FROM categories WHERE id = ?").run(catId);
    audit(req, "categoria.eliminar", { detalle: { nombre: cat.nombre, productosMovidos: r.changes } });
    return Number(r.changes);
  });
  res.json({ movidos, categorias: list() });
});

// Agrega las categorías sugeridas del tipo de negocio (las que ya existen no se duplican).
router.post("/sugeridas", canManage, (req, res) => {
  const rubro = RUBROS[req.body.rubro];
  if (!rubro) throw badRequest("Tipo de negocio inválido");
  for (const c of rubro.categorias) ensureCategory(c);
  res.json(list());
});

module.exports = router;
module.exports.ensureCategory = ensureCategory;
