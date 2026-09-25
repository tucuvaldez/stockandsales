const express = require("express");
const rateLimit = require("express-rate-limit");
const { getDb } = require("../db");
const { checkPassword, signToken, requireAuth, hashPassword } = require("../auth");
const { HttpError, badRequest } = require("../errors");
const { str } = require("../validate");
const { audit } = require("../audit");
const installer = require("../installer");

const router = express.Router();
const bcrypt = require("bcryptjs");
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos fallidos. Esperá 15 minutos y volvé a intentar." },
});

const publicUser = (u) => ({ id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol });

router.post("/login", loginLimiter, async (req, res) => {
  const usuario = str(req.body?.usuario, { name: "Usuario", max: 60, required: true });
  const password = str(req.body?.password, { name: "Contraseña", max: 200, required: true });

  const user = getDb().prepare("SELECT * FROM users WHERE usuario = ?").get(usuario);
  // Se compara igual aunque el usuario no exista, para no revelar cuáles existen por el tiempo de respuesta.
  const ok = await checkPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok || !user.activo) {
    audit({ ip: req.ip }, "login.fallido", { detalle: { usuario } });
    throw new HttpError(401, "Usuario o contraseña incorrectos");
  }

  audit({ user, ip: req.ip }, "login", { entidad: "usuario", entidadId: user.id });
  res.json({ token: signToken(user), user: publicUser(user) });
});

const recoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Esperá 15 minutos." },
});

// El dueño recupera el acceso con su código de recuperación. Se le entrega un código nuevo.
router.post("/recuperar", recoverLimiter, async (req, res) => {
  const usuario = str(req.body?.usuario, { name: "Usuario", max: 60, required: true });
  const codigo = str(req.body?.codigo, { name: "Código de recuperación", max: 40, required: true });
  const nueva = str(req.body?.nueva, { name: "Contraseña nueva", max: 200, required: true });
  let r;
  try {
    r = await installer.resetWithRecoveryCode(usuario, codigo, nueva);
  } catch (err) {
    audit({ ip: req.ip }, "login.recuperacion_fallida", { detalle: { usuario } });
    throw badRequest(err.message);
  }
  res.json({ token: signToken(r.user), user: publicUser(r.user), nuevoCodigo: r.newCode });
});

router.get("/me", requireAuth, (req, res) => res.json(req.user));

router.post("/change-password", requireAuth, async (req, res) => {
  const actual = str(req.body?.actual, { name: "Contraseña actual", max: 200, required: true });
  const nueva = str(req.body?.nueva, { name: "Contraseña nueva", max: 200, required: true });
  if (nueva.length < 6) throw badRequest("La contraseña nueva debe tener al menos 6 caracteres");

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!(await checkPassword(actual, user.password_hash))) throw badRequest("La contraseña actual no es correcta");

  db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?")
    .run(await hashPassword(nueva), new Date().toISOString(), user.id);
  audit(req, "usuario.cambiar_clave", { entidad: "usuario", entidadId: user.id });

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  res.json({ token: signToken(updated), user: publicUser(updated) });
});

module.exports = router;
