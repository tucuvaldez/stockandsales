const { getDb } = require("../../db");
const settings = require("../../settings");
const wsaa = require("./wsaa");
const wsfe = require("./wsfe");

const FISCAL_KEYS = [
  "afip_cuit", "afip_razon_social", "afip_condicion", "afip_pto_vta", "afip_entorno",
  "afip_domicilio", "afip_iibb", "afip_inicio_actividades", "afip_limite_cf",
];

function fiscalConfig() {
  const s = settings.getMany(FISCAL_KEYS);
  return {
    cuit: s.afip_cuit,
    razonSocial: s.afip_razon_social,
    condicion: s.afip_condicion || "MONO",
    ptoVta: Number(s.afip_pto_vta) || 0,
    entorno: s.afip_entorno === "produccion" ? "produccion" : "homologacion",
    domicilio: s.afip_domicilio,
    iibb: s.afip_iibb,
    inicioActividades: s.afip_inicio_actividades,
    limiteConsumidorFinal: Number(s.afip_limite_cf) || 10000000,
    tieneCertificado: !!settings.get("afip_cert") && !!settings.get("afip_key"),
  };
}

function missingFiscalConfig(cfg = fiscalConfig()) {
  const missing = [];
  if (!cfg.cuit) missing.push("CUIT");
  if (!cfg.razonSocial) missing.push("Razón social");
  if (!cfg.ptoVta) missing.push("Punto de venta");
  if (!cfg.tieneCertificado) missing.push("Certificado y clave de ARCA");
  return missing;
}

// Todas las operaciones con ARCA pasan por esta cola: evita pedir dos veces el mismo número.
let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function getAuth(cfg, { force = false } = {}) {
  const db = getDb();
  const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  if (!force) {
    const t = db.prepare("SELECT * FROM afip_tickets WHERE entorno = ? AND cuit = ? AND service = 'wsfe'").get(cfg.entorno, cfg.cuit);
    if (t && t.expira > soon) return { token: t.token, sign: t.sign, cuit: cfg.cuit };
  }
  let ticket;
  try {
    ticket = await wsaa.loginCms({
      entorno: cfg.entorno, service: "wsfe",
      certPem: settings.get("afip_cert"), keyPem: settings.get("afip_key"),
    });
  } catch (err) {
    if (/ya posee un TA valido/i.test(err.message)) {
      err.message = "ARCA indica que ya existe un ticket de acceso vigente para este certificado (quizás emitido desde otro sistema). Esperá unos minutos y reintentá.";
    } else if (/Computador no autorizado|cms\.cert|Certificado/i.test(err.message)) {
      err.message = `ARCA rechazó el certificado: ${err.message}. Verificá que el certificado esté asociado al servicio "wsfe" y corresponda al entorno ${cfg.entorno}.`;
    }
    throw err;
  }
  db.prepare(
    `INSERT INTO afip_tickets (entorno, cuit, service, token, sign, expira) VALUES (?, ?, 'wsfe', ?, ?, ?)
     ON CONFLICT(entorno, cuit, service) DO UPDATE SET token = excluded.token, sign = excluded.sign, expira = excluded.expira`
  ).run(cfg.entorno, cfg.cuit, ticket.token, ticket.sign, ticket.expira);
  return { token: ticket.token, sign: ticket.sign, cuit: cfg.cuit };
}

// Ejecuta fn con credenciales; si ARCA dice que el token no sirve (error 600), renueva una vez.
async function withAuth(cfg, fn) {
  const auth = await getAuth(cfg);
  try {
    return await fn(auth);
  } catch (err) {
    const tokenInvalid = (err.afipErrors || []).some((e) => String(e.Code) === "600");
    if (!tokenInvalid) throw err;
    return fn(await getAuth(cfg, { force: true }));
  }
}

function testConnection() {
  return enqueue(async () => {
    const cfg = fiscalConfig();
    const missing = missingFiscalConfig(cfg);
    if (missing.length) throw new Error(`Falta configurar: ${missing.join(", ")}`);
    const status = await wsfe.dummy(cfg.entorno);
    const ultimo = await withAuth(cfg, (auth) => wsfe.lastAuthorized(cfg.entorno, auth, cfg.ptoVta, cfg.condicion === "RI" ? 6 : 11));
    return {
      entorno: cfg.entorno,
      servidores: { app: status.AppServer, db: status.DbServer, auth: status.AuthServer },
      ultimoComprobante: ultimo,
    };
  });
}

module.exports = { FISCAL_KEYS, fiscalConfig, missingFiscalConfig, enqueue, withAuth, testConnection, wsfe, wsaa };
