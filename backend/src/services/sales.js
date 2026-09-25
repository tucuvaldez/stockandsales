const { getDb, tx, nowIso } = require("../db");
const { round2 } = require("../money");
const { badRequest, notFound, conflict } = require("../errors");
const { num, str, oneOf, id } = require("../validate");
const { changeStock } = require("./stock");
const { audit } = require("../audit");

const PAYMENT_METHODS = ["efectivo", "debito", "credito", "transferencia", "qr", "otro"];

function parseSaleInput(input) {
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length === 0) throw badRequest("La venta debe tener al menos un producto");
  if (rawItems.length > 500) throw badRequest("Demasiados productos en una sola venta");

  // Unificar el mismo producto cargado dos veces.
  const merged = new Map();
  for (const it of rawItems) {
    const productId = id(it.productId, "Producto");
    const cantidad = num(it.cantidad, { name: "Cantidad", int: true, min: 1, max: 100000, required: true });
    const descuentoPct = num(it.descuentoPct, { name: "Descuento", min: 0, max: 100 });
    const prev = merged.get(productId);
    if (prev && prev.descuentoPct !== descuentoPct) throw badRequest("El mismo producto figura con descuentos distintos");
    merged.set(productId, { productId, cantidad: (prev?.cantidad || 0) + cantidad, descuentoPct });
  }

  const descTipo = oneOf(input.descuento?.tipo, ["pct", "monto"], { name: "Tipo de descuento", fallback: "pct" });
  return {
    items: [...merged.values()],
    metodoPago: oneOf(input.metodoPago, PAYMENT_METHODS, { name: "Método de pago", fallback: "efectivo" }),
    nota: str(input.nota, { name: "Nota", max: 300 }),
    descTipo,
    descValor: num(input.descuento?.valor, { name: "Descuento", min: 0, max: descTipo === "pct" ? 100 : 1e12 }),
    clientId: input.clientId ? id(input.clientId, "Cliente") : null,
  };
}

// Calcula importes con los precios de la base, sin escribir nada.
function quote(db, parsed) {
  const lines = [];
  for (const it of parsed.items) {
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(it.productId);
    if (!p || !p.activo) throw badRequest("Uno de los productos ya no existe");
    const subtotal = round2(p.precio * it.cantidad * (1 - it.descuentoPct / 100));
    lines.push({ p, ...it, subtotal });
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0));
  const descMonto = parsed.descTipo === "pct" ? round2((subtotal * parsed.descValor) / 100) : round2(Math.min(parsed.descValor, subtotal));
  return { lines, subtotal, descMonto, total: round2(subtotal - descMonto) };
}

const quoteSale = (input) => quote(getDb(), parseSaleInput(input));

/**
 * Registra una venta. Los precios se toman de la base, nunca del navegador,
 * y todo (venta + items + stock + movimientos) se guarda en una sola transacción.
 */
function createSale(input, ctx) {
  const parsed = parseSaleInput(input);

  return tx((db) => {
    const { lines, subtotal, descMonto, total } = quote(db, parsed);
    const { metodoPago, nota, descTipo, descValor, clientId } = parsed;

    if (clientId && !db.prepare("SELECT 1 FROM clients WHERE id = ? AND activo = 1").get(clientId)) {
      throw badRequest("Cliente no encontrado");
    }

    const { lastInsertRowid: saleId } = db
      .prepare(
        `INSERT INTO sales (fecha, user_id, usuario_nombre, client_id, metodo_pago, subtotal, descuento_tipo, descuento_valor, descuento_monto, total, nota)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(nowIso(), ctx.user.id, ctx.user.nombre, clientId, metodoPago, subtotal, descTipo, descValor, descMonto, total, nota);

    const insertItem = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, codigo, nombre, talle, cantidad, precio_unitario, descuento_pct, alicuota_iva, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of lines) {
      insertItem.run(saleId, l.p.id, l.p.codigo, l.p.nombre, l.p.talle, l.cantidad, l.p.precio, l.descuentoPct, l.p.alicuota_iva, l.subtotal);
      changeStock({ productId: l.p.id, delta: -l.cantidad, tipo: "venta", motivo: `Venta #${saleId}`, refTipo: "venta", refId: Number(saleId), user: ctx.user });
    }

    audit(ctx, "venta.crear", { entidad: "venta", entidadId: Number(saleId), detalle: { total, items: lines.length, metodoPago } });
    return getSale(Number(saleId));
  });
}

// Factor que reparte el descuento general entre los items (para devoluciones y facturas).
const discountFactor = (sale) => (sale.subtotal > 0 ? sale.total / sale.subtotal : 0);

function getSale(saleId) {
  const db = getDb();
  const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId);
  if (!sale) throw notFound("Venta no encontrada");
  sale.items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id").all(saleId);
  sale.returns = db.prepare("SELECT * FROM sale_returns WHERE sale_id = ? ORDER BY id").all(saleId);
  for (const r of sale.returns) {
    r.items = db.prepare("SELECT * FROM sale_return_items WHERE return_id = ?").all(r.id);
  }
  sale.invoices = db
    .prepare("SELECT id, tipo_cbte, pto_vta, numero, estado, imp_total, cae, return_id, asociado_id, mensajes, fecha FROM invoices WHERE sale_id = ? ORDER BY id")
    .all(saleId);
  sale.client = sale.client_id ? db.prepare("SELECT * FROM clients WHERE id = ?").get(sale.client_id) : null;
  return sale;
}

function ensureNoPendingInvoice(saleId) {
  const pending = getDb().prepare("SELECT 1 FROM invoices WHERE sale_id = ? AND estado = 'pendiente'").get(saleId);
  if (pending) {
    throw conflict("Esta venta tiene un comprobante pendiente de confirmación con ARCA. Reintentalo desde Comprobantes antes de continuar.");
  }
}

/** Devolución parcial o total. No se puede devolver más de lo vendido. */
function returnItems(saleId, input, ctx) {
  const motivo = str(input.motivo, { name: "Motivo", max: 300 });
  const rawItems = Array.isArray(input.items) ? input.items : [];

  return tx((db) => {
    const sale = getSale(saleId);
    if (sale.estado === "anulada") throw badRequest("La venta está anulada");
    ensureNoPendingInvoice(saleId);

    const factor = discountFactor(sale);
    const lines = [];
    for (const r of rawItems) {
      const cantidad = num(r.cantidad, { name: "Cantidad", int: true, min: 0, max: 100000 });
      if (cantidad === 0) continue;
      const item = sale.items.find((i) => i.id === Number(r.saleItemId));
      if (!item) throw badRequest("El producto no pertenece a esta venta");
      const disponible = item.cantidad - item.cantidad_devuelta;
      if (cantidad > disponible) {
        throw badRequest(`"${item.nombre}": solo quedan ${disponible} unidad(es) para devolver`);
      }
      const monto = round2((item.subtotal / item.cantidad) * cantidad * factor);
      lines.push({ item, cantidad, monto });
    }
    if (lines.length === 0) throw badRequest("Indicá al menos una unidad a devolver");

    const total = round2(lines.reduce((s, l) => s + l.monto, 0));
    const { lastInsertRowid: returnId } = db
      .prepare("INSERT INTO sale_returns (sale_id, fecha, user_id, usuario_nombre, total, motivo) VALUES (?, ?, ?, ?, ?, ?)")
      .run(saleId, nowIso(), ctx.user.id, ctx.user.nombre, total, motivo);

    for (const l of lines) {
      db.prepare("INSERT INTO sale_return_items (return_id, sale_item_id, cantidad, monto) VALUES (?, ?, ?, ?)").run(returnId, l.item.id, l.cantidad, l.monto);
      db.prepare("UPDATE sale_items SET cantidad_devuelta = cantidad_devuelta + ? WHERE id = ?").run(l.cantidad, l.item.id);
      changeStock({
        productId: l.item.product_id, delta: l.cantidad, tipo: "devolucion",
        motivo: `Devolución venta #${saleId}${motivo ? ` - ${motivo}` : ""}`, refTipo: "venta", refId: saleId, user: ctx.user,
      });
    }
    db.prepare("UPDATE sales SET total_devuelto = round(total_devuelto + ?, 2) WHERE id = ?").run(total, saleId);

    audit(ctx, "venta.devolucion", { entidad: "venta", entidadId: saleId, detalle: { total, motivo } });
    return { returnId: Number(returnId), total, items: lines.map((l) => ({ saleItemId: l.item.id, cantidad: l.cantidad, monto: l.monto })) };
  });
}

/** Anula la venta: repone el stock que queda sin devolver. La venta queda en el historial marcada como anulada. */
function annulSale(saleId, input, ctx) {
  const motivo = str(input.motivo, { name: "Motivo", max: 300, required: true });

  return tx((db) => {
    const sale = getSale(saleId);
    if (sale.estado === "anulada") throw badRequest("La venta ya estaba anulada");
    ensureNoPendingInvoice(saleId);

    for (const item of sale.items) {
      const restante = item.cantidad - item.cantidad_devuelta;
      if (restante > 0) {
        changeStock({
          productId: item.product_id, delta: restante, tipo: "anulacion",
          motivo: `Anulación venta #${saleId} - ${motivo}`, refTipo: "venta", refId: saleId, user: ctx.user,
        });
      }
    }
    db.prepare("UPDATE sales SET estado = 'anulada', anulada_at = ?, anulada_por = ?, motivo_anulacion = ? WHERE id = ?")
      .run(nowIso(), ctx.user.nombre, motivo, saleId);
    // Un comprobante que nunca llegó a autorizarse ya no debe reintentarse.
    db.prepare("UPDATE invoices SET estado = 'cancelada', updated_at = ? WHERE sale_id = ? AND estado IN ('error','rechazada')").run(nowIso(), saleId);

    audit(ctx, "venta.anular", { entidad: "venta", entidadId: saleId, detalle: { motivo, total: sale.total } });
    return { montoPendiente: round2(sale.total - sale.total_devuelto) };
  });
}

module.exports = { PAYMENT_METHODS, quoteSale, createSale, getSale, returnItems, annulSale, discountFactor };
