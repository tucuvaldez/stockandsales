const express = require("express");
const { getDb } = require("../db");
const { requireRole } = require("../auth");
const { badRequest, notFound } = require("../errors");
const { str, num, oneOf, pagination, dateRange, likeTerm, isValidCuit } = require("../validate");
const { audit } = require("../audit");
const settings = require("../settings");
const afip = require("../services/afip");
const backup = require("../services/backup");
const { CONDICIONES_EMISOR } = require("../services/afip/constants");

const router = express.Router();
const adminOnly = requireRole("admin");

const NEGOCIO_KEYS = ["negocio_nombre", "negocio_direccion", "negocio_telefono", "negocio_pie_ticket"];
const cajaObligatoria = () => settings.get("caja_obligatoria", "1") === "1";

function certInfo() {
  const cert = settings.get("afip_cert");
  if (!cert) return null;
  try {
    return afip.wsaa.inspectCertificate(cert);
  } catch {
    return null;
  }
}

// Datos que necesita cualquier usuario logueado (encabezado de tickets y facturas).
router.get("/negocio", (req, res) => {
  const out = { ...settings.getMany(NEGOCIO_KEYS), modo: settings.getMode(), cajaObligatoria: cajaObligatoria() };
  if (settings.isBilling()) {
    const cfg = afip.fiscalConfig();
    out.fiscal = {
      cuit: cfg.cuit, razonSocial: cfg.razonSocial, condicion: cfg.condicion, condicionNombre: CONDICIONES_EMISOR[cfg.condicion],
      ptoVta: cfg.ptoVta, entorno: cfg.entorno, domicilio: cfg.domicilio, iibb: cfg.iibb, inicioActividades: cfg.inicioActividades,
      limiteConsumidorFinal: cfg.limiteConsumidorFinal, faltantes: afip.missingFiscalConfig(cfg),
    };
  }
  res.json(out);
});

router.put("/negocio", adminOnly, (req, res) => {
  const values = {
    negocio_nombre: str(req.body.nombre, { name: "Nombre del negocio", max: 100, required: true }),
    negocio_direccion: str(req.body.direccion, { name: "Dirección", max: 200 }),
    negocio_telefono: str(req.body.telefono, { name: "Teléfono", max: 50 }),
    negocio_pie_ticket: str(req.body.pieTicket, { name: "Pie del ticket", max: 300 }),
  };
  for (const [k, v] of Object.entries(values)) settings.set(k, v);
  if (typeof req.body.cajaObligatoria === "boolean") settings.set("caja_obligatoria", req.body.cajaObligatoria ? "1" : "0");
  audit(req, "config.negocio", { detalle: { ...values, cajaObligatoria: cajaObligatoria() } });
  res.json({ ok: true });
});

function requireBilling(req, res, next) {
  if (!settings.isBilling()) return next(notFound("La facturación no está habilitada en esta instalación"));
  next();
}

router.get("/fiscal", adminOnly, requireBilling, (req, res) => {
  res.json({ ...afip.fiscalConfig(), certificado: certInfo(), csrPendiente: !!settings.get("afip_key_pendiente") });
});

router.put("/fiscal", adminOnly, requireBilling, (req, res) => {
  const cuit = str(req.body.cuit, { name: "CUIT", max: 13, required: true }).replace(/\D/g, "");
  if (!isValidCuit(cuit)) throw badRequest("El CUIT no es válido");
  const values = {
    afip_cuit: cuit,
    afip_razon_social: str(req.body.razonSocial, { name: "Razón social", max: 120, required: true }),
    afip_condicion: oneOf(req.body.condicion, Object.keys(CONDICIONES_EMISOR), { name: "Condición frente al IVA" }),
    afip_pto_vta: num(req.body.ptoVta, { name: "Punto de venta", int: true, min: 1, max: 99998, required: true }),
    afip_entorno: oneOf(req.body.entorno, ["homologacion", "produccion"], { name: "Entorno" }),
    afip_domicilio: str(req.body.domicilio, { name: "Domicilio comercial", max: 200 }),
    afip_iibb: str(req.body.iibb, { name: "Ingresos Brutos", max: 40 }),
    afip_inicio_actividades: str(req.body.inicioActividades, { name: "Inicio de actividades", max: 10 }),
    afip_limite_cf: num(req.body.limiteConsumidorFinal, { name: "Monto límite", min: 0, fallback: 10000000 }),
  };
  const info = certInfo();
  if (info?.cuit && info.cuit !== cuit) throw badRequest(`El certificado cargado es del CUIT ${info.cuit}, no coincide con ${cuit}`);
  const antes = settings.get("afip_entorno");
  for (const [k, v] of Object.entries(values)) settings.set(k, v);
  audit(req, "config.fiscal", { detalle: { ...values, entornoAnterior: antes } });
  res.json({ ok: true });
});

router.post("/fiscal/csr", adminOnly, requireBilling, (req, res) => {
  const cuit = settings.get("afip_cuit");
  const razonSocial = settings.get("afip_razon_social");
  if (!cuit || !razonSocial) throw badRequest("Primero guardá el CUIT y la razón social");
  const alias = str(req.body.alias, { name: "Alias", max: 40, fallback: "stocklocal" }).replace(/[^a-zA-Z0-9]/g, "") || "stocklocal";
  const { csrPem, keyPem } = afip.wsaa.generateCsr({ cuit, razonSocial, alias });
  // La clave queda guardada hasta que se cargue el certificado que emita ARCA para esta solicitud.
  settings.set("afip_key_pendiente", keyPem);
  audit(req, "config.generar_csr", { detalle: { alias } });
  res.json({ csr: csrPem, alias });
});

router.post("/fiscal/certificado", adminOnly, requireBilling, (req, res) => {
  const cert = str(req.body.cert, { name: "Certificado", max: 20000, required: true });
  const pendingKey = settings.get("afip_key_pendiente");
  const key = str(req.body.key, { name: "Clave privada", max: 20000 }) || pendingKey || settings.get("afip_key");
  if (!key) throw badRequest("Falta la clave privada (.key). Generá la solicitud desde acá o subí la clave junto al certificado.");
  let info;
  try {
    info = afip.wsaa.inspectCertificate(cert, key);
  } catch (err) {
    throw badRequest(err.message);
  }
  if (new Date(info.validoHasta) < new Date()) throw badRequest(`El certificado venció el ${new Date(info.validoHasta).toLocaleDateString("es-AR")}`);
  const cuit = settings.get("afip_cuit");
  if (cuit && info.cuit && info.cuit !== cuit) throw badRequest(`El certificado es del CUIT ${info.cuit} y el configurado es ${cuit}`);

  settings.set("afip_cert", cert);
  settings.set("afip_key", key);
  if (key === pendingKey) settings.set("afip_key_pendiente", "");
  getDb().prepare("DELETE FROM afip_tickets").run();
  audit(req, "config.certificado", { detalle: { alias: info.alias, cuit: info.cuit, validoHasta: info.validoHasta } });
  res.json(info);
});

router.post("/fiscal/probar", adminOnly, requireBilling, async (req, res) => {
  try {
    res.json({ ok: true, ...(await afip.testConnection()) });
  } catch (err) {
    throw badRequest(err.message);
  }
});

router.get("/backups", adminOnly, (req, res) => res.json(backup.listBackups()));

router.post("/backups", adminOnly, (req, res) => {
  const b = backup.createBackup("manual");
  audit(req, "backup.crear", { detalle: b });
  res.json(b);
});

router.get("/backups/:name", adminOnly, (req, res) => {
  const file = backup.backupPath(req.params.name);
  if (!file) throw notFound("Copia no encontrada");
  audit(req, "backup.descargar", { detalle: { name: req.params.name } });
  res.download(file);
});

router.get("/actividad", adminOnly, (req, res) => {
  const { limit, page, offset } = pagination(req.query, { defaultLimit: 50 });
  const where = [];
  const params = [];
  const { desde, hasta } = dateRange(req.query.desde, req.query.hasta);
  if (desde) { where.push("fecha >= ?"); params.push(desde); }
  if (hasta) { where.push("fecha <= ?"); params.push(hasta); }
  if (req.query.q) {
    where.push("(accion LIKE ? ESCAPE '\\' OR usuario_nombre LIKE ? ESCAPE '\\' OR detalle LIKE ? ESCAPE '\\')");
    const t = likeTerm(str(req.query.q, { max: 100 }));
    params.push(t, t, t);
  }
  const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM audit_log ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM audit_log ${sql}`).get(...params);
  res.json({ items: rows, total: n, pages: Math.max(1, Math.ceil(n / limit)) });
});

module.exports = router;
