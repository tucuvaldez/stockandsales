const express = require("express");
const { getDb, nowIso } = require("../db");
const { hashPassword, requireRole, ROLES } = require("../auth");
const { badRequest, notFound, conflict } = require("../errors");
const { str, oneOf, id } = require("../validate");
const { audit } = require("../audit");

const router = express.Router();
router.use(requireRole("admin"));

const COLS = "id, nombre, usuario, rol, activo, created_at, updated_at";

router.get("/", (req, res) => {
  res.json(getDb().prepare(`SELECT ${COLS} FROM users ORDER BY activo DESC, nombre`).all());
});

router.post("/", async (req, res) => {
  const nombre = str(req.body.nombre, { name: "Nombre", max: 80, required: true });
  const usuario = str(req.body.usuario, { name: "Usuario", max: 40, required: true }).toLowerCase();
  const password = str(req.body.password, { name: "Contraseña", max: 200, required: true });
  const rol = oneOf(req.body.rol, ROLES, { name: "Rol", fallback: "vendedor" });
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw badRequest("El usuario debe tener 3 a 40 caracteres: letras, números, punto o guion");
  if (password.length < 6) throw badRequest("La contraseña debe tener al menos 6 caracteres");

  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE usuario = ?").get(usuario)) throw conflict("Ese nombre de usuario ya existe");
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, ?)")
    .run(nombre, usuario, await hashPassword(password), rol);
  audit(req, "usuario.crear", { entidad: "usuario", entidadId: Number(lastInsertRowid), detalle: { usuario, rol } });
  res.status(201).json(db.prepare(`SELECT ${COLS} FROM users WHERE id = ?`).get(lastInsertRowid));
});

router.put("/:id", async (req, res) => {
  const userId = id(req.params.id);
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) throw notFound("Usuario no encontrado");

  const nombre = str(req.body.nombre, { name: "Nombre", max: 80, required: true });
  const rol = oneOf(req.body.rol, ROLES, { name: "Rol" });
  const activo = req.body.activo === false ? 0 : 1;
  const password = str(req.body.password, { name: "Contraseña", max: 200 });
  if (password && password.length < 6) throw badRequest("La contraseña debe tener al menos 6 caracteres");

  if (user.rol === "admin" && (rol !== "admin" || !activo)) {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE rol = 'admin' AND activo = 1").get().n;
    if (admins <= 1) throw badRequest("Tiene que quedar al menos un administrador activo");
  }

  // Cambiar rol, clave o desactivar cierra las sesiones abiertas del usuario.
  const revoke = rol !== user.rol || !activo || !!password;
  db.prepare("UPDATE users SET nombre = ?, rol = ?, activo = ?, password_hash = ?, token_version = token_version + ?, updated_at = ? WHERE id = ?")
    .run(nombre, rol, activo, password ? await hashPassword(password) : user.password_hash, revoke ? 1 : 0, nowIso(), userId);
  audit(req, "usuario.editar", { entidad: "usuario", entidadId: userId, detalle: { rol, activo: !!activo, cambioClave: !!password } });
  res.json(db.prepare(`SELECT ${COLS} FROM users WHERE id = ?`).get(userId));
});

module.exports = router;
