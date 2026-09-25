const { getDb } = require("./db");

// Registro de actividad: quién hizo qué y cuándo. Es de solo inserción.
function audit(ctx, accion, { entidad = "", entidadId = null, detalle = "" } = {}) {
  const user = ctx?.user || null;
  getDb()
    .prepare(
      "INSERT INTO audit_log (user_id, usuario_nombre, accion, entidad, entidad_id, detalle, ip) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      user?.id ?? null,
      user?.nombre ?? "Sistema",
      accion,
      entidad,
      entidadId,
      typeof detalle === "string" ? detalle : JSON.stringify(detalle),
      ctx?.ip || ""
    );
}

module.exports = { audit };
