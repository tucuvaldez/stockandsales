const { getDb, nowIso } = require("../db");
const { round2 } = require("../money");
const { badRequest, notFound, conflict } = require("../errors");
const { num, str, isValidCuit } = require("../validate");
const { audit } = require("../audit");
const { isBilling } = require("../settings");
const { getSale, discountFactor } = require("./sales");
const afip = require("./afip");
const C = require("./afip/constants");

const todayYmd = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/**
 * Calcula importes para ARCA a partir de líneas con precio final (IVA incluido).
 * lines: [{ gross, alicuota }]. Garantiza ImpTotal = ImpNeto + ImpIVA al centavo.
 */
function computeAmounts(lines, letra, target) {
  const total = round2(target ?? lines.reduce((s, l) => s + l.gross, 0));
  if (letra === "C") return { impTotal: total, impNeto: total, impIva: 0, iva: [] };

  const groups = new Map();
  for (const l of lines) {
    if (!(l.alicuota in C.ALICUOTAS_IVA)) throw badRequest(`Alícuota de IVA no soportada: ${l.alicuota}%`);
    groups.set(l.alicuota, (groups.get(l.alicuota) || 0) + l.gross);
  }
  const entries = [...groups.entries()].map(([alicuota, gross]) => ({ alicuota, gross: round2(gross) }));
  // Diferencias de redondeo del descuento general: se ajustan en el grupo más grande.
  const diff = round2(total - entries.reduce((s, e) => s + e.gross, 0));
  if (diff !== 0) entries.sort((a, b) => b.gross - a.gross)[0].gross = round2(entries[0].gross + diff);

  const iva = entries
    .filter((e) => e.gross > 0)
    .map((e) => {
      const base = round2(e.gross / (1 + e.alicuota / 100));
      return { id: C.ALICUOTAS_IVA[e.alicuota], alicuota: e.alicuota, base, importe: round2(e.gross - base) };
    });
  return {
    impTotal: total,
    impNeto: round2(iva.reduce((s, a) => s + a.base, 0)),
    impIva: round2(iva.reduce((s, a) => s + a.importe, 0)),
    iva,
  };
}

// Normaliza y valida al receptor según la letra y el monto.
function resolveReceptor(input, letra, total, cfg) {
  const db = getDb();
  let r;
  if (input?.clientId) {
    const c = db.prepare("SELECT * FROM clients WHERE id = ? AND activo = 1").get(Number(input.clientId));
    if (!c) throw badRequest("Cliente no encontrado");
    r = { docTipo: c.doc_tipo, docNro: c.doc_nro, nombre: c.nombre, condicionIva: c.condicion_iva, domicilio: c.direccion };
  } else {
    r = {
      docTipo: num(input?.docTipo, { name: "Tipo de documento", int: true, fallback: 99 }),
      docNro: str(input?.docNro, { name: "Documento", max: 20 }).replace(/\D/g, ""),
      nombre: str(input?.nombre, { name: "Nombre", max: 120 }),
      condicionIva: num(input?.condicionIva, { name: "Condición IVA", int: true, fallback: 5 }),
      domicilio: str(input?.domicilio, { name: "Domicilio", max: 200 }),
    };
  }

  if (!(r.docTipo in C.DOC_TIPOS)) throw badRequest("Tipo de documento inválido");
  if (!(r.condicionIva in C.CONDICIONES_IVA)) throw badRequest("Condición frente al IVA inválida");
  if (r.docTipo === 99) {
    if (r.condicionIva !== 5) throw badRequest("Sin documento solo se puede facturar a Consumidor Final");
    if (total >= cfg.limiteConsumidorFinal) {
      throw badRequest(`Para montos desde $${cfg.limiteConsumidorFinal.toLocaleString("es-AR")} ARCA exige identificar al comprador (DNI o CUIT)`);
    }
    r.docNro = "0";
    r.nombre = r.nombre || "Consumidor Final";
  } else if (r.docTipo === 80 || r.docTipo === 86) {
    if (!isValidCuit(r.docNro)) throw badRequest("El CUIT/CUIL no es válido (revisá los 11 dígitos)");
  } else if (r.docTipo === 96 && !/^\d{7,8}$/.test(r.docNro)) {
    throw badRequest("El DNI debe tener 7 u 8 dígitos");
  }
  if (letra === "A" && r.docTipo !== 80) throw badRequest("La Factura A requiere el CUIT del comprador");
  if (r.docTipo !== 99 && !r.nombre) throw badRequest("Ingresá el nombre o razón social del comprador");
  return r;
}

// Líneas de la venta que todavía no fueron devueltas, con el descuento general prorrateado.
function remainingLines(sale) {
  const factor = discountFactor(sale);
  return sale.items
    .map((i) => {
      const cantidad = i.cantidad - i.cantidad_devuelta;
      const unit = round2((i.subtotal / i.cantidad) * factor);
      return { codigo: i.codigo, nombre: i.nombre, cantidad, precioUnitario: unit, gross: round2((i.subtotal / i.cantidad) * cantidad * factor), alicuota: i.alicuota_iva };
    })
    .filter((l) => l.cantidad > 0);
}

function assertBillingReady() {
  if (!isBilling()) throw badRequest("La facturación no está habilitada en esta instalación");
  const cfg = afip.fiscalConfig();
  const missing = afip.missingFiscalConfig(cfg);
  if (missing.length) throw badRequest(`Falta completar la configuración fiscal: ${missing.join(", ")}`);
  return cfg;
}

function insertInvoice(data, ctx) {
  const { lastInsertRowid } = getDb()
    .prepare(
      `INSERT INTO invoices (sale_id, return_id, asociado_id, entorno, cuit_emisor, pto_vta, tipo_cbte, fecha, doc_tipo, doc_nro,
         condicion_iva_receptor, receptor_nombre, receptor_domicilio, imp_total, imp_neto, imp_iva, iva_json, items_json, estado, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`
    )
    .run(
      data.saleId, data.returnId ?? null, data.asociadoId ?? null, data.cfg.entorno, data.cfg.cuit, data.cfg.ptoVta, data.tipo, todayYmd(),
      data.receptor.docTipo, data.receptor.docNro, data.receptor.condicionIva, data.receptor.nombre, data.receptor.domicilio || "",
      data.amounts.impTotal, data.amounts.impNeto, data.amounts.impIva, JSON.stringify(data.amounts.iva), JSON.stringify(data.items), ctx.user?.id ?? null
    );
  return Number(lastInsertRowid);
}

const FACTURA_TIPOS = [1, 6, 11];

function letraForInput(cfg, receptorInput) {
  const condicion = receptorInput?.clientId
    ? getDb().prepare("SELECT condicion_iva FROM clients WHERE id = ?").get(Number(receptorInput.clientId))?.condicion_iva
    : Number(receptorInput?.condicionIva || 5);
  return C.letraPara(cfg.condicion, condicion);
}

// Valida los datos del comprador antes de registrar la venta, para no dejar ventas sin facturar por un error de tipeo.
function precheckInvoice(receptorInput, total) {
  const cfg = assertBillingReady();
  const letra = letraForInput(cfg, receptorInput);
  const receptor = resolveReceptor(receptorInput, letra, total, cfg);
  return { letra, receptor };
}

/** Crea y emite la factura de una venta. */
async function invoiceSale(saleId, receptorInput, ctx) {
  const cfg = assertBillingReady();
  const sale = getSale(saleId);
  if (sale.estado === "anulada") throw badRequest("La venta está anulada");
  const existing = sale.invoices.find((i) => FACTURA_TIPOS.includes(i.tipo_cbte) && ["autorizada", "pendiente"].includes(i.estado));
  if (existing) throw conflict("Esta venta ya tiene una factura", { invoiceId: existing.id });

  const lines = remainingLines(sale);
  if (!lines.length) throw badRequest("No queda nada para facturar en esta venta");
  const target = round2(lines.reduce((s, l) => s + l.gross, 0));

  const letra = letraForInput(cfg, receptorInput);
  const receptor = resolveReceptor(receptorInput, letra, target, cfg);

  // Si había una factura rechazada o con error, se cancela y se reemplaza por esta.
  getDb().prepare("UPDATE invoices SET estado = 'cancelada', updated_at = ? WHERE sale_id = ? AND tipo_cbte IN (1,6,11) AND estado IN ('error','rechazada')")
    .run(nowIso(), saleId);

  const invoiceId = insertInvoice(
    { saleId, cfg, tipo: C.FACTURA_POR_LETRA[letra], receptor, amounts: computeAmounts(lines, letra, target), items: stripLines(lines) },
    ctx
  );
  audit(ctx, "factura.crear", { entidad: "comprobante", entidadId: invoiceId, detalle: { saleId, letra, total: target } });
  return emit(invoiceId, ctx);
}

const stripLines = (lines) => lines.map(({ codigo, nombre, cantidad, precioUnitario, alicuota }) => ({ codigo, nombre, cantidad, precioUnitario, alicuota }));

/**
 * Nota de crédito para una devolución (returnId) o una anulación (annul=true).
 * Si la venta no tiene factura autorizada no hace nada.
 */
async function creditNoteForSale(saleId, { returnId = null, annul = false }, ctx) {
  if (!isBilling()) return null;
  const db = getDb();
  const factura = db
    .prepare("SELECT * FROM invoices WHERE sale_id = ? AND tipo_cbte IN (1,6,11) AND estado = 'autorizada' ORDER BY id DESC LIMIT 1")
    .get(saleId);
  if (!factura) return null;

  const sale = getSale(saleId);
  let lines;
  if (returnId) {
    const ret = sale.returns.find((r) => r.id === returnId);
    if (!ret) throw notFound("Devolución no encontrada");
    lines = ret.items.map((ri) => {
      const item = sale.items.find((i) => i.id === ri.sale_item_id);
      return { codigo: item.codigo, nombre: item.nombre, cantidad: ri.cantidad, precioUnitario: round2(ri.monto / ri.cantidad), gross: ri.monto, alicuota: item.alicuota_iva };
    });
  } else if (annul) {
    // La anulación acredita lo que la factura cubrió menos lo ya acreditado.
    const acreditado = db.prepare("SELECT COALESCE(SUM(imp_total),0) AS t FROM invoices WHERE asociado_id = ? AND estado IN ('autorizada','pendiente')").get(factura.id).t;
    const pendiente = round2(factura.imp_total - acreditado);
    if (pendiente <= 0) return null;
    const items = JSON.parse(factura.items_json);
    const bruto = items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0) || 1;
    lines = items.map((i) => ({ ...i, gross: round2(((i.precioUnitario * i.cantidad) / bruto) * pendiente) }));
  } else {
    return null;
  }

  const letra = C.CBTE_TIPOS[factura.tipo_cbte].letra;
  const cfg = afip.fiscalConfig();
  const invoiceId = insertInvoice(
    {
      saleId, returnId, asociadoId: factura.id,
      cfg: { ...cfg, entorno: factura.entorno, cuit: factura.cuit_emisor, ptoVta: factura.pto_vta },
      tipo: C.NC_POR_LETRA[letra],
      receptor: { docTipo: factura.doc_tipo, docNro: factura.doc_nro, condicionIva: factura.condicion_iva_receptor, nombre: factura.receptor_nombre, domicilio: factura.receptor_domicilio },
      amounts: computeAmounts(lines, letra),
      items: stripLines(lines),
    },
    ctx
  );
  audit(ctx, "nota_credito.crear", { entidad: "comprobante", entidadId: invoiceId, detalle: { saleId, returnId, annul } });
  return emit(invoiceId, ctx);
}

function getInvoice(invoiceId) {
  const inv = getDb().prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
  if (!inv) throw notFound("Comprobante no encontrado");
  inv.iva = JSON.parse(inv.iva_json);
  inv.items = JSON.parse(inv.items_json);
  inv.tipo = C.CBTE_TIPOS[inv.tipo_cbte];
  inv.asociado = inv.asociado_id
    ? getDb().prepare("SELECT id, tipo_cbte, pto_vta, numero, fecha FROM invoices WHERE id = ?").get(inv.asociado_id)
    : null;
  return inv;
}

function updateInvoice(invoiceId, fields) {
  const keys = Object.keys(fields);
  getDb()
    .prepare(`UPDATE invoices SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), nowIso(), invoiceId);
}

/**
 * Pide el CAE. Si la respuesta se pierde (corte de internet), el comprobante queda "pendiente"
 * con el número intentado; al reintentar se consulta a ARCA antes de pedir un número nuevo.
 */
function emit(invoiceId, ctx) {
  return afip.enqueue(async () => {
    let inv = getInvoice(invoiceId);
    if (inv.estado === "autorizada") return inv;
    if (inv.estado === "cancelada") throw badRequest("El comprobante fue cancelado");

    const cfg = { ...afip.fiscalConfig(), entorno: inv.entorno, cuit: inv.cuit_emisor };
    try {
      await afip.withAuth(cfg, async (auth) => {
        inv = getInvoice(invoiceId);
        if (inv.numero_intentado) {
          const found = await afip.wsfe.consult(inv.entorno, auth, inv.pto_vta, inv.tipo_cbte, inv.numero_intentado);
          if (found && found.Resultado === "A" && Number(found.ImpTotal).toFixed(2) === inv.imp_total.toFixed(2) && String(found.DocNro) === String(inv.doc_nro)) {
            updateInvoice(invoiceId, {
              numero: inv.numero_intentado, numero_intentado: null, cae: String(found.CodAutorizacion), cae_vto: String(found.FchVto),
              fecha: String(found.CbteFch), estado: "autorizada", mensajes: "Recuperado de ARCA tras un corte de conexión",
            });
            return;
          }
          updateInvoice(invoiceId, { numero_intentado: null });
        }

        const numero = (await afip.wsfe.lastAuthorized(inv.entorno, auth, inv.pto_vta, inv.tipo_cbte)) + 1;
        const fecha = todayYmd();
        // Se guarda antes de enviar: si se corta la conexión sabemos qué número verificar.
        updateInvoice(invoiceId, { numero_intentado: numero, fecha, estado: "pendiente", intentos: inv.intentos + 1 });

        let asociado = null;
        if (inv.asociado) asociado = { tipo: inv.asociado.tipo_cbte, ptoVta: inv.asociado.pto_vta, numero: inv.asociado.numero, fecha: inv.asociado.fecha };

        const r = await afip.wsfe.requestCae(inv.entorno, auth, {
          tipo: inv.tipo_cbte, ptoVta: inv.pto_vta, numero, fecha,
          docTipo: inv.doc_tipo, docNro: inv.doc_nro, condIvaReceptor: inv.condicion_iva_receptor,
          impTotal: inv.imp_total, impNeto: inv.imp_neto, impIva: inv.imp_iva, iva: inv.iva, asociado,
        });
        if (r.aprobado) {
          updateInvoice(invoiceId, { numero, numero_intentado: null, cae: r.cae, cae_vto: r.caeVto, estado: "autorizada", mensajes: r.mensajes });
        } else {
          const tokenInvalid = r.errores.some((e) => String(e.Code) === "600");
          updateInvoice(invoiceId, { numero_intentado: null, estado: "rechazada", mensajes: r.mensajes || "Rechazado por ARCA" });
          if (tokenInvalid) {
            const err = new Error(r.mensajes);
            err.afipErrors = r.errores;
            throw err;
          }
        }
      });
    } catch (err) {
      const current = getInvoice(invoiceId);
      if (err.network && current.numero_intentado) {
        updateInvoice(invoiceId, { mensajes: `Sin respuesta de ARCA: se verificará al reintentar. ${err.message}` });
      } else {
        updateInvoice(invoiceId, { estado: "error", numero_intentado: null, mensajes: err.message });
      }
    }

    inv = getInvoice(invoiceId);
    audit(ctx, "comprobante.emitir", { entidad: "comprobante", entidadId: invoiceId, detalle: { estado: inv.estado, numero: inv.numero, mensajes: inv.mensajes } });
    return inv;
  });
}

async function retry(invoiceId, ctx) {
  assertBillingReady();
  const inv = getInvoice(invoiceId);
  if (!["pendiente", "error", "rechazada"].includes(inv.estado)) throw badRequest("Este comprobante no se puede reintentar");
  if (inv.sale_id && getSale(inv.sale_id).estado === "anulada" && FACTURA_TIPOS.includes(inv.tipo_cbte) && !inv.numero_intentado) {
    updateInvoice(invoiceId, { estado: "cancelada" });
    throw badRequest("La venta fue anulada: el comprobante se canceló");
  }
  // Si hubo devoluciones mientras la factura no estaba autorizada, se factura solo lo que quedó.
  if (FACTURA_TIPOS.includes(inv.tipo_cbte) && inv.sale_id && !inv.numero_intentado) {
    const lines = remainingLines(getSale(inv.sale_id));
    if (!lines.length) {
      updateInvoice(invoiceId, { estado: "cancelada" });
      throw badRequest("Se devolvió todo lo vendido: el comprobante se canceló");
    }
    const amounts = computeAmounts(lines, inv.tipo.letra);
    updateInvoice(invoiceId, {
      imp_total: amounts.impTotal, imp_neto: amounts.impNeto, imp_iva: amounts.impIva,
      iva_json: JSON.stringify(amounts.iva), items_json: JSON.stringify(stripLines(lines)),
    });
  }
  return emit(invoiceId, ctx);
}

function cancel(invoiceId, ctx) {
  const inv = getInvoice(invoiceId);
  if (!["error", "rechazada"].includes(inv.estado)) {
    throw badRequest("Solo se pueden descartar comprobantes rechazados o con error. Para anular una factura autorizada, anulá la venta (se emite una nota de crédito).");
  }
  updateInvoice(invoiceId, { estado: "cancelada" });
  audit(ctx, "comprobante.descartar", { entidad: "comprobante", entidadId: invoiceId });
}

module.exports = { computeAmounts, resolveReceptor, precheckInvoice, invoiceSale, creditNoteForSale, getInvoice, retry, cancel, todayYmd, FACTURA_TIPOS };
