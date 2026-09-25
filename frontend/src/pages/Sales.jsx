import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, download } from "../api";
import { useAuth } from "../auth";
import { Badge, Confirm, Empty, Field, Loader, Modal, Pagination, useDebounced } from "../components/ui";
import ReceptorForm, { CONSUMIDOR_FINAL, receptorError, receptorPayload } from "../components/ReceptorForm";
import { CBTE_NOMBRES, INVOICE_STATES, PAYMENT_METHODS, cbteNumero, dateTime, money, paymentLabel, plural, round2 } from "../lib/format";

import { printInFrame as openPrint, openPdf } from "../lib/print";

export default function Sales() {
  const { isBilling } = useAuth();
  const [f, setF] = useState({ desde: "", hasta: "", estado: "", metodoPago: "", q: "" });
  const dq = useDebounced(f.q, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const params = { ...f, q: dq, page };
  const load = useCallback(() => {
    api.get("/sales", params).then(setData).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.desde, f.hasta, f.estado, f.metodoPago, dq, page]);
  useEffect(load, [load]);

  const setFilter = (patch) => { setF({ ...f, ...patch }); setPage(1); };
  const hasFilters = f.desde || f.hasta || f.estado || f.metodoPago || f.q;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Ventas</h2>
          <p className="page-subtitle">{data ? `${plural(data.total, "venta", "ventas")} · neto ${money(data.neto)}` : " "}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => download("/sales/export.csv", { ...f, q: dq }, "ventas.csv").catch((e) => toast.error(e.message))}>⬇️ Exportar a Excel</button>
      </div>

      <div className="filters-bar">
        <input className="form-input" placeholder="🔍 Producto vendido..." value={f.q} onChange={(e) => setFilter({ q: e.target.value })} />
        <label className="inline-label">Desde <input className="form-input" type="date" value={f.desde} onChange={(e) => setFilter({ desde: e.target.value })} /></label>
        <label className="inline-label">Hasta <input className="form-input" type="date" value={f.hasta} onChange={(e) => setFilter({ hasta: e.target.value })} /></label>
        <select className="form-select auto" value={f.metodoPago} onChange={(e) => setFilter({ metodoPago: e.target.value })}>
          <option value="">Todos los pagos</option>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select className="form-select auto" value={f.estado} onChange={(e) => setFilter({ estado: e.target.value })}>
          <option value="">Todas</option>
          <option value="completada">Completadas</option>
          <option value="anulada">Anuladas</option>
        </select>
        {hasFilters && <button className="btn btn-ghost btn-sm" onClick={() => setFilter({ desde: "", hasta: "", estado: "", metodoPago: "", q: "" })}>✕ Limpiar</button>}
      </div>

      {!data ? <Loader /> : data.sales.length === 0 ? <Empty icon="🧾" title="No hay ventas para mostrar" /> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Fecha</th><th>Productos</th><th>Pago</th><th className="text-right">Total</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.sales.map((s) => (
                  <tr key={s.id} className={`row-click ${s.estado === "anulada" ? "row-muted" : ""}`} onClick={() => setDetailId(s.id)}>
                    <td className="mono">{s.id}</td>
                    <td className="fs-13">{dateTime(s.fecha)}<div className="text-muted">{s.usuario_nombre}</div></td>
                    <td className="fs-13 ellipsis">{s.resumen}</td>
                    <td><Badge>{paymentLabel(s.metodo_pago)}</Badge></td>
                    <td className="text-right fw-700">
                      {money(s.total)}
                      {s.total_devuelto > 0 && <div className="fs-12 text-warning">devuelto {money(s.total_devuelto)}</div>}
                    </td>
                    <td>
                      {s.estado === "anulada" ? <Badge kind="danger">Anulada</Badge> : s.total_devuelto > 0 ? <Badge kind="warning">Con devolución</Badge> : <Badge kind="success">OK</Badge>}
                      {isBilling && s.factura_estado && <> <Badge kind={INVOICE_STATES[s.factura_estado]?.badge}>Factura {INVOICE_STATES[s.factura_estado]?.label.toLowerCase()}</Badge></>}
                    </td>
                    <td className="text-right"><button className="btn btn-sm btn-secondary">Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </>
      )}

      {detailId && <SaleDetail id={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}

function SaleDetail({ id, onClose, onChanged }) {
  const { can, isBilling, negocio } = useAuth();
  const [sale, setSale] = useState(null);
  const [mode, setMode] = useState(null);

  const reload = useCallback(() => api.get(`/sales/${id}`).then(setSale).catch((e) => toast.error(e.message)), [id]);
  useEffect(() => { reload(); }, [reload]);

  const afterChange = (r) => {
    if (r?.creditNote) {
      if (r.creditNote.estado === "autorizada") toast.success(`${CBTE_NOMBRES[r.creditNote.tipo_cbte]} autorizada`);
      else toast.error(`La nota de crédito quedó ${r.creditNote.estado}. Revisala en Comprobantes ARCA.`);
    }
    if (r?.invoiceError) toast.error(`No se pudo emitir la nota de crédito: ${r.invoiceError}`);
    setMode(null);
    reload();
    onChanged();
  };

  if (!sale) return <Modal title="Venta" onClose={onClose}><Loader /></Modal>;

  const anulada = sale.estado === "anulada";
  const quedan = sale.items.some((i) => i.cantidad > i.cantidad_devuelta);
  const factura = sale.invoices.find((i) => [1, 6, 11].includes(i.tipo_cbte) && ["autorizada", "pendiente"].includes(i.estado));
  const puedeFacturar = isBilling && !anulada && !factura && quedan && negocio?.fiscal?.faltantes?.length === 0;

  return (
    <>
      <Modal
        title={`Venta #${sale.id}`}
        onClose={onClose}
        width={720}
        footer={
          <div className="footer-split">
            <div className="btn-row">
              {can("admin", "supervisor") && !anulada && quedan && <button className="btn btn-warning btn-sm" onClick={() => setMode("devolucion")}>↩️ Devolución</button>}
              {can("admin", "supervisor") && !anulada && <button className="btn btn-danger btn-sm" onClick={() => setMode("anular")}>Anular venta</button>}
              {puedeFacturar && <button className="btn btn-secondary btn-sm" onClick={() => setMode("facturar")}>🏛️ Facturar</button>}
            </div>
            <div className="btn-row">
              <button className="btn btn-secondary btn-sm" onClick={() => openPrint(`/imprimir/venta/${sale.id}`)}>🖨️ Ticket</button>
              <button className="btn btn-primary btn-sm" onClick={onClose}>Cerrar</button>
            </div>
          </div>
        }
      >
        {anulada && (
          <div className="alert-banner alert-danger">Anulada el {dateTime(sale.anulada_at)} por {sale.anulada_por}. Motivo: {sale.motivo_anulacion}</div>
        )}
        <div className="info-strip">
          <span><span className="text-muted">Fecha</span> {dateTime(sale.fecha)}</span>
          <span><span className="text-muted">Vendedor</span> {sale.usuario_nombre}</span>
          <span><span className="text-muted">Pago</span> {sale.payments.length > 1 ? sale.payments.map((p) => `${paymentLabel(p.metodo_pago)} ${money(p.monto)}`).join(" + ") : paymentLabel(sale.metodo_pago)}</span>
          {sale.nota && <span><span className="text-muted">Nota</span> {sale.nota}</span>}
        </div>

        <table className="table-plain">
          <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Desc.</th><th className="text-right">Subtotal</th></tr></thead>
          <tbody>
            {sale.items.map((i) => (
              <tr key={i.id}>
                <td><span className="mono fs-12 text-muted">{i.codigo}</span> {i.nombre}{i.talle && ` (${i.talle})`}
                  {i.cantidad_devuelta > 0 && <div className="fs-12 text-warning">{i.cantidad_devuelta} devuelto(s)</div>}
                </td>
                <td className="text-right">{i.cantidad}</td>
                <td className="text-right">{money(i.precio_unitario)}</td>
                <td className="text-right">{i.descuento_pct > 0 ? `${i.descuento_pct}%` : "—"}</td>
                <td className="text-right fw-600">{money(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals-right">
          {sale.descuento_monto > 0 && <div className="text-success">Descuento general: − {money(sale.descuento_monto)}</div>}
          <div className="total-line">Total {money(sale.total)}</div>
          {sale.total_devuelto > 0 && <div className="text-warning">Devuelto: − {money(sale.total_devuelto)} · Neto {money(sale.total - sale.total_devuelto)}</div>}
        </div>

        {sale.returns.length > 0 && (
          <div className="mt-12">
            <h4 className="section-title">Devoluciones</h4>
            {sale.returns.map((r) => (
              <div key={r.id} className="row-between fs-13 line">
                <span>{dateTime(r.fecha)} · {r.usuario_nombre}{r.motivo && ` · ${r.motivo}`}</span>
                <strong>{money(r.total)}</strong>
              </div>
            ))}
          </div>
        )}

        {isBilling && sale.invoices.length > 0 && (
          <div className="mt-12">
            <h4 className="section-title">Comprobantes</h4>
            {sale.invoices.map((inv) => (
              <div key={inv.id} className="row-between fs-13 line">
                <span>
                  {CBTE_NOMBRES[inv.tipo_cbte]} {cbteNumero(inv.pto_vta, inv.numero)} · {money(inv.imp_total)}{" "}
                  <Badge kind={INVOICE_STATES[inv.estado]?.badge}>{INVOICE_STATES[inv.estado]?.label}</Badge>
                  {inv.estado !== "autorizada" && inv.mensajes && <div className="text-muted">{inv.mensajes}</div>}
                </span>
                {inv.estado === "autorizada" && (
                  <span className="nowrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => openPdf(`/documents/comprobante/${inv.id}.pdf`).catch((e) => toast.error(e.message))}>📄 PDF</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openPrint(`/imprimir/comprobante/${inv.id}`)}>🖨️</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {mode === "devolucion" && <ReturnModal sale={sale} onClose={() => setMode(null)} onDone={afterChange} />}
      {mode === "anular" && (
        <Confirm
          title={`Anular venta #${sale.id}`}
          danger
          askReason
          confirmLabel="Anular venta"
          message={
            <>
              <p>Se repone el stock de lo que no se devolvió y la venta queda en el historial marcada como anulada.</p>
              <p className="mt-8">Se registra en la caja la devolución de {money(sale.total - sale.total_devuelto)} por el mismo medio con que se cobró.</p>
              {factura && <p className="mt-8"><strong>Se emitirá una Nota de Crédito</strong> por {money(sale.total - sale.total_devuelto)}.</p>}
            </>
          }
          onConfirm={async (motivo) => {
            try {
              afterChange(await api.post(`/sales/${sale.id}/anular`, { motivo }));
              toast.success("Venta anulada");
            } catch (e) {
              toast.error(e.message);
              throw e;
            }
          }}
          onClose={() => setMode(null)}
        />
      )}
      {mode === "facturar" && <InvoiceLaterModal sale={sale} onClose={() => setMode(null)} onDone={afterChange} />}
    </>
  );
}

function ReturnModal({ sale, onClose, onDone }) {
  const [qty, setQty] = useState({});
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [metodo, setMetodo] = useState(sale.payments.some((p) => p.metodo_pago === "efectivo") ? "efectivo" : sale.payments[0]?.metodo_pago || "efectivo");
  const factor = sale.subtotal > 0 ? sale.total / sale.subtotal : 0;
  const factura = sale.invoices.some((i) => [1, 6, 11].includes(i.tipo_cbte) && i.estado === "autorizada");

  const monto = round2(sale.items.reduce((s, i) => s + round2((i.subtotal / i.cantidad) * (qty[i.id] || 0) * factor), 0));
  const any = Object.values(qty).some((v) => v > 0);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/sales/${sale.id}/devolucion`, {
        motivo,
        metodoReembolso: metodo,
        items: Object.entries(qty).filter(([, c]) => c > 0).map(([saleItemId, cantidad]) => ({ saleItemId: Number(saleItemId), cantidad })),
      });
      toast.success(`Devolución registrada: ${money(r.total)}`);
      onDone(r);
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Registrar devolución"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-warning" onClick={submit} disabled={!any || busy}>{busy ? "Procesando..." : `Devolver ${money(monto)}`}</button>
        </>
      }
    >
      <p className="text-muted fs-13 mb-12">Indicá cuántas unidades devuelve el cliente. El stock se repone automáticamente.</p>
      {sale.items.map((i) => {
        const max = i.cantidad - i.cantidad_devuelta;
        if (max <= 0) return null;
        const v = qty[i.id] || 0;
        return (
          <div key={i.id} className="row-between line">
            <div><strong>{i.nombre}</strong><div className="fs-12 text-muted">Puede devolver hasta {max}</div></div>
            <div className="cart-qty">
              <button className="qty-btn" onClick={() => setQty({ ...qty, [i.id]: Math.max(0, v - 1) })}>−</button>
              <span className="qty-value">{v}</span>
              <button className="qty-btn" onClick={() => setQty({ ...qty, [i.id]: Math.min(max, v + 1) })} disabled={v >= max}>+</button>
            </div>
          </div>
        );
      })}
      <Field label="¿Cómo se le devuelve el dinero?">
        <select className="form-select" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </Field>
      <Field label="Motivo (opcional)"><input className="form-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ej: talle incorrecto" /></Field>
      {any && factura && <div className="alert-banner alert-info">Se emitirá una Nota de Crédito por {money(monto)}.</div>}
    </Modal>
  );
}

function InvoiceLaterModal({ sale, onClose, onDone }) {
  const { negocio } = useAuth();
  const [receptor, setReceptor] = useState(CONSUMIDOR_FINAL);
  const [busy, setBusy] = useState(false);
  const pendiente = sale.total - sale.total_devuelto;
  const err = receptorError(receptor, pendiente, negocio?.fiscal);

  const submit = async () => {
    setBusy(true);
    try {
      const { invoice } = await api.post(`/sales/${sale.id}/facturar`, { receptor: receptorPayload(receptor) });
      if (invoice.estado === "autorizada") toast.success(`${CBTE_NOMBRES[invoice.tipo_cbte]} autorizada`);
      else toast.error(`La factura quedó ${invoice.estado}: ${invoice.mensajes}`);
      onDone();
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Facturar venta #${sale.id}`}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={!!err || busy}>{busy ? "Emitiendo..." : `Emitir por ${money(pendiente)}`}</button>
        </>
      }
    >
      <ReceptorForm value={receptor} onChange={setReceptor} />
      {err && <div className="form-error">{err}</div>}
    </Modal>
  );
}
