const { getDb, tx, nowIso } = require("../db");
const { round2 } = require("../money");
const { badRequest, notFound, conflict } = require("../errors");
const { num, str, oneOf } = require("../validate");
const settings = require("../settings");
const { audit } = require("../audit");

const PAYMENT_METHODS = ["efectivo", "debito", "credito", "transferencia", "qr", "otro"];

// Por defecto se exige caja abierta para vender; el administrador lo puede desactivar.
const isCashRequired = () => settings.get("caja_obligatoria", "1") === "1";

const getOpenSession = () => getDb().prepare("SELECT * FROM cash_sessions WHERE estado = 'abierta'").get() || null;

/**
 * Sesión en la que se registra un movimiento de dinero. Si la caja es obligatoria y está cerrada, frena la operación.
 * Debe llamarse dentro de la transacción de la operación.
 */
function sessionForOperation(accion) {
  const session = getOpenSession();
  if (!session && isCashRequired()) throw conflict(`La caja está cerrada. Abrí la caja para ${accion}.`, { cajaCerrada: true });
  return session;
}

function addEntry({ sessionId, tipo, metodoPago, monto, motivo = "", refTipo = null, refId = null, user }) {
  getDb()
    .prepare(
      `INSERT INTO cash_entries (session_id, fecha, tipo, metodo_pago, monto, motivo, ref_tipo, ref_id, user_id, usuario_nombre)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(sessionId ?? null, nowIso(), tipo, metodoPago, round2(monto), motivo, refTipo, refId, user?.id ?? null, user?.nombre ?? "Sistema");
}

function openSession(input, ctx) {
  const montoInicial = round2(num(input.montoInicial, { name: "Efectivo inicial", min: 0, max: 1e10, required: true }));
  const nota = str(input.nota, { name: "Nota", max: 300 });
  return tx((db) => {
    if (getOpenSession()) throw conflict("Ya hay una caja abierta");
    const { lastInsertRowid } = db
      .prepare("INSERT INTO cash_sessions (abierta_at, abierta_por_id, abierta_por, monto_inicial, nota_apertura) VALUES (?, ?, ?, ?, ?)")
      .run(nowIso(), ctx.user.id, ctx.user.nombre, montoInicial, nota);
    audit(ctx, "caja.abrir", { entidad: "caja", entidadId: Number(lastInsertRowid), detalle: { montoInicial } });
    return summary(Number(lastInsertRowid));
  });
}

// Ingreso o retiro de dinero que no es una venta (cambio, pago a proveedor, retiro del dueño...).
function manualMovement(input, ctx) {
  const tipo = oneOf(input.tipo, ["ingreso", "egreso"], { name: "Tipo" });
  const monto = round2(num(input.monto, { name: "Monto", min: 0.01, max: 1e10, required: true }));
  const motivo = str(input.motivo, { name: "Motivo", max: 200, required: true });
  const metodoPago = oneOf(input.metodoPago, PAYMENT_METHODS, { name: "Medio", fallback: "efectivo" });
  return tx(() => {
    const session = getOpenSession();
    if (!session) throw conflict("La caja está cerrada", { cajaCerrada: true });
    if (tipo === "egreso" && metodoPago === "efectivo") {
      const disponible = summary(session.id).efectivoEsperado;
      if (monto > disponible) throw badRequest(`No hay tanto efectivo en caja (esperado: $${disponible.toLocaleString("es-AR")})`);
    }
    addEntry({ sessionId: session.id, tipo, metodoPago, monto: tipo === "egreso" ? -monto : monto, motivo, user: ctx.user });
    audit(ctx, `caja.${tipo}`, { entidad: "caja", entidadId: session.id, detalle: { monto, motivo, metodoPago } });
    return summary(session.id);
  });
}

/** Cierre con arqueo: se compara el efectivo contado con el que debería haber. */
function closeSession(input, ctx) {
  const contado = round2(num(input.efectivoContado, { name: "Efectivo contado", min: 0, max: 1e10, required: true }));
  const nota = str(input.nota, { name: "Nota", max: 300 });
  return tx((db) => {
    const session = getOpenSession();
    if (!session) throw conflict("No hay ninguna caja abierta");
    const esperado = summary(session.id).efectivoEsperado;
    const diferencia = round2(contado - esperado);
    db.prepare(
      `UPDATE cash_sessions SET estado = 'cerrada', cerrada_at = ?, cerrada_por_id = ?, cerrada_por = ?,
         efectivo_esperado = ?, efectivo_contado = ?, diferencia = ?, nota_cierre = ? WHERE id = ?`
    ).run(nowIso(), ctx.user.id, ctx.user.nombre, esperado, contado, diferencia, nota, session.id);
    audit(ctx, "caja.cerrar", { entidad: "caja", entidadId: session.id, detalle: { esperado, contado, diferencia } });
    return summary(session.id);
  });
}

function summary(sessionId) {
  const db = getDb();
  const session = db.prepare("SELECT * FROM cash_sessions WHERE id = ?").get(sessionId);
  if (!session) throw notFound("Caja no encontrada");
  const entries = db.prepare("SELECT * FROM cash_entries WHERE session_id = ? ORDER BY id").all(sessionId);

  const porMedio = {};
  const porTipo = {};
  for (const e of entries) {
    porMedio[e.metodo_pago] = round2((porMedio[e.metodo_pago] || 0) + e.monto);
    porTipo[e.tipo] = round2((porTipo[e.tipo] || 0) + e.monto);
  }
  // Una venta con pago dividido genera varios registros: se cuentan ventas distintas.
  const ventas = new Set(entries.filter((e) => e.tipo === "venta").map((e) => e.ref_id)).size;
  const efectivoEsperado = round2(session.monto_inicial + (porMedio.efectivo || 0));
  return {
    ...session,
    entries,
    porMedio,
    porTipo,
    cantidadVentas: ventas,
    totalNeto: round2((porTipo.venta || 0) + (porTipo.devolucion || 0) + (porTipo.anulacion || 0)),
    efectivoEsperado: session.estado === "cerrada" ? session.efectivo_esperado : efectivoEsperado,
  };
}

function listSessions({ limit, offset }) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM cash_sessions ORDER BY id DESC LIMIT ? OFFSET ?").all(limit, offset);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM cash_sessions").get();
  for (const r of rows) {
    r.totalNeto = db.prepare("SELECT COALESCE(SUM(monto),0) AS t FROM cash_entries WHERE session_id = ? AND tipo IN ('venta','devolucion','anulacion')").get(r.id).t;
  }
  return { sessions: rows, total: n };
}

module.exports = { PAYMENT_METHODS, isCashRequired, getOpenSession, sessionForOperation, addEntry, openSession, manualMovement, closeSession, summary, listSessions };
