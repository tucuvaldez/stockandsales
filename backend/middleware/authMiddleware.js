const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "stocklocal-dev-secret";

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Usuario no autenticado" });
  }

  if (!roles.includes(req.user.rol)) {
    return res.status(403).json({ error: "No tenés permisos para esta acción" });
  }

  next();
};

module.exports = { requireAuth, requireRole };
