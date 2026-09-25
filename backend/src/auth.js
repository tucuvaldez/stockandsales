const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { getDb } = require("./db");
const { getJwtSecret } = require("./settings");
const { HttpError, forbidden } = require("./errors");

const ROLES = ["admin", "supervisor", "vendedor"];
const TOKEN_TTL = "12h";

const hashPassword = (plain) => bcrypt.hash(String(plain), 10);
const checkPassword = (plain, hash) => bcrypt.compare(String(plain), hash);

function signToken(user) {
  return jwt.sign({ sub: user.id, tv: user.token_version }, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

// Verifica el token y que el usuario siga activo. Cambiar la clave o desactivar al usuario invalida sus sesiones.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, "Iniciá sesión para continuar"));

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch {
    return next(new HttpError(401, "La sesión expiró. Volvé a iniciar sesión"));
  }

  const user = getDb()
    .prepare("SELECT id, nombre, usuario, rol, activo, token_version FROM users WHERE id = ?")
    .get(payload.sub);
  if (!user || !user.activo || user.token_version !== payload.tv) {
    return next(new HttpError(401, "La sesión ya no es válida. Volvé a iniciar sesión"));
  }

  req.user = { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol };
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.rol)) return next(forbidden());
  next();
};

module.exports = { ROLES, hashPassword, checkPassword, signToken, requireAuth, requireRole };
