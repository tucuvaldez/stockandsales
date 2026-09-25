import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Modal, useDebounced } from "../components/ui";
import ReceptorForm, { CONSUMIDOR_FINAL, letraReceptor, receptorError, receptorPayload } from "../components/ReceptorForm";
import { CBTE_NOMBRES, PAYMENT_METHODS, cbteNumero, money, paymentLabel, round2 } from "../lib/format";

const openPrint = (path) => window.open(path, "_blank", "noopener");

export default function NewSale() {
  const { isBilling, negocio } = useAuth();
  const fiscal = negocio?.fiscal;
  const fiscalReady = isBilling && fiscal && fiscal.faltantes.length === 0;

  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [nota, setNota] = useState("");
  const [desc, setDesc] = useState({ tipo: "pct", valor: "" });
  const [emitir, setEmitir] = useState(true);
  const [receptor, setReceptor] = useState(CONSUMIDOR_FINAL);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    api.get("/products", { q: dq, limit: 60 }).then(setResults).catch((e) => toast.error(e.message));
  }, [dq]);

  const add = useCallback((p) => {
    if (p.stock <= 0) return toast.error(`"${p.nombre}" no tiene stock`);
    setCart((prev) => {
      const ex = prev.find((i) => i.id === p.id);
      if (ex) {
        if (ex.cantidad >= p.stock) {
          toast.error(`Solo hay ${p.stock} en stock`);
          return prev;
        }
        return prev.map((i) => (i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [...prev, { ...p, cantidad: 1, descuentoPct: "" }];
    });
  }, []);

  // Enter en el buscador: primero código exacto (lector de barras), si no, el único resultado.
  const onSearchEnter = async () => {
    const term = q.trim();
    if (!term) return;
    try {
      add(await api.get(`/products/codigo/${encodeURIComponent(term)}`));
      setQ("");
    } catch {
      if (results.length === 1) { add(results[0]); setQ(""); }
      else toast.error(results.length ? "Hay varios resultados: elegí uno de la lista" : "No se encontró el producto");
    }
  };

  const setQty = (id, cantidad) =>
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, cantidad: Math.max(1, Math.min(i.stock, Math.floor(Number(cantidad) || 1))) } : i)));
  const setItemDesc = (id, v) => setCart((prev) => prev.map((i) => (i.id === id ? { ...i, descuentoPct: v === "" ? "" : Math.min(100, Math.max(0, Number(v))) } : i)));
  const remove = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  // Mismos cálculos que el servidor (el servidor es el que manda).
  const lineTotal = (i) => round2(i.precio * i.cantidad * (1 - (Number(i.descuentoPct) || 0) / 100));
  const bruto = round2(cart.reduce((s, i) => s + i.precio * i.cantidad, 0));
  const subtotal = round2(cart.reduce((s, i) => s + lineTotal(i), 0));
  const descValor = Number(desc.valor) || 0;
  const descMonto = desc.tipo === "pct" ? round2((subtotal * Math.min(descValor, 100)) / 100) : round2(Math.min(descValor, subtotal));
  const total = round2(subtotal - descMonto);
  const unidades = cart.reduce((s, i) => s + i.cantidad, 0);

  const facturar = fiscalReady && emitir;
  const recError = facturar ? receptorError(receptor, total, fiscal) : null;

  const openConfirm = useCallback(() => {
    if (!cart.length) return toast.error("Agregá al menos un producto");
    if (recError) return toast.error(recError);
    setConfirmOpen(true);
  }, [cart.length, recError]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F2") { e.preventDefault(); openConfirm(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openConfirm]);

  const reset = () => {
    setCart([]); setNota(""); setDesc({ tipo: "pct", valor: "" }); setReceptor(CONSUMIDOR_FINAL); setMetodoPago("efectivo");
    setResult(null);
    api.get("/products", { q: "", limit: 60 }).then(setResults).catch(() => {});
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const confirm = async () => {
    setSaving(true);
    try {
      const r = await api.post("/sales", {
        items: cart.map((i) => ({ productId: i.id, cantidad: i.cantidad, descuentoPct: Number(i.descuentoPct) || 0 })),
        metodoPago, nota,
        descuento: { tipo: desc.tipo, valor: descValor },
        factura: { emitir: facturar, receptor: receptorPayload(receptor) },
      });
      setConfirmOpen(false);
      setResult(r);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sale-layout">
      <section>
        <div className="page-header compact">
          <div><h2 className="page-title">Nueva venta</h2><p className="page-subtitle">Escaneá el código o buscá el producto. <kbd>Enter</kbd> agrega · <kbd>F2</kbd> cobra</p></div>
        </div>
        <input
          ref={searchRef}
          className="form-input search-big"
          autoFocus
          placeholder="🔍 Código de barras, código o nombre..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearchEnter()}
        />
        <div className="table-wrap mt-12">
          <table>
            <thead><tr><th>Código</th><th>Producto</th><th className="text-right">Precio</th><th>Stock</th><th /></tr></thead>
            <tbody>
              {results.length === 0 && <tr><td colSpan={5} className="text-center text-muted">No se encontraron productos</td></tr>}
              {results.map((p) => (
                <tr key={p.id} className={p.stock <= 0 ? "row-disabled" : "row-click"} onClick={() => add(p)}>
                  <td className="mono">{p.codigo}</td>
                  <td><strong>{p.nombre}</strong>{p.talle && <span className="text-muted"> · {p.talle}</span>}</td>
                  <td className="text-right fw-600">{money(p.precio)}</td>
                  <td>{p.stock <= 0 ? <Badge kind="danger">Sin stock</Badge> : <Badge kind={p.stock <= p.stock_minimo ? "warning" : "success"}>{p.stock}</Badge>}</td>
                  <td className="text-right"><button className="btn btn-sm btn-primary" disabled={p.stock <= 0} onClick={(e) => { e.stopPropagation(); add(p); }}>Agregar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="cart card">
        <div className="cart-head">
          <h3>🛒 Venta actual</h3>
          <span className="text-muted fs-13">{cart.length ? `${unidades} unidad(es)` : "Vacía"}</span>
        </div>

        <div className="cart-items">
          {cart.length === 0 && <p className="cart-empty">Agregá productos desde la lista</p>}
          {cart.map((i) => (
            <div className="cart-item" key={i.id}>
              <div className="grow">
                <div className="cart-item-name">{i.nombre}{i.talle && <span className="text-muted"> · {i.talle}</span>}</div>
                <div className="cart-item-meta">{money(i.precio)} c/u · desc. <input className="mini-input" type="number" min="0" max="100" placeholder="0" value={i.descuentoPct} onChange={(e) => setItemDesc(i.id, e.target.value)} aria-label="Descuento %" />%</div>
              </div>
              <div className="cart-qty">
                <button className="qty-btn" onClick={() => (i.cantidad > 1 ? setQty(i.id, i.cantidad - 1) : remove(i.id))} aria-label="Restar">−</button>
                <input className="qty-input" value={i.cantidad} onChange={(e) => setQty(i.id, e.target.value)} inputMode="numeric" aria-label="Cantidad" />
                <button className="qty-btn" onClick={() => setQty(i.id, i.cantidad + 1)} disabled={i.cantidad >= i.stock} aria-label="Sumar">+</button>
              </div>
              <div className="cart-line-total">
                <strong>{money(lineTotal(i))}</strong>
                <button className="link-btn" onClick={() => remove(i.id)}>quitar</button>
              </div>
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="cart-foot">
            <div className="form-label mb-6">Medio de pago</div>
            <div className="pay-grid">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.value} type="button" className={`pay-btn ${metodoPago === m.value ? "active" : ""}`} onClick={() => setMetodoPago(m.value)}>
                  <span aria-hidden>{m.icon}</span> {m.label}
                </button>
              ))}
            </div>

            <div className="inline-fields mt-12">
              <span className="form-label">Descuento general</span>
              <select className="form-select sm" value={desc.tipo} onChange={(e) => setDesc({ ...desc, tipo: e.target.value })}>
                <option value="pct">%</option>
                <option value="monto">$</option>
              </select>
              <input className="form-input sm" type="number" min="0" placeholder="0" value={desc.valor} onChange={(e) => setDesc({ ...desc, valor: e.target.value })} />
            </div>
            <input className="form-input mt-8" placeholder="Nota (opcional)" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} />

            {isBilling && (
              <div className="billing-box">
                {!fiscalReady ? (
                  <p className="fs-13 text-muted">La facturación aún no está configurada. La venta se registrará sin factura.</p>
                ) : (
                  <>
                    <label className="check">
                      <input type="checkbox" checked={emitir} onChange={(e) => setEmitir(e.target.checked)} /> Emitir factura electrónica
                    </label>
                    {emitir && <ReceptorForm value={receptor} onChange={setReceptor} />}
                    {recError && <div className="form-error">{recError}</div>}
                  </>
                )}
              </div>
            )}

            <div className="totals">
              <div className="row-between text-muted"><span>Subtotal</span><span>{money(bruto)}</span></div>
              {bruto - total > 0.004 && <div className="row-between text-success"><span>Descuentos</span><span>− {money(bruto - total)}</span></div>}
              <div className="row-between total-line"><span>TOTAL</span><span>{money(total)}</span></div>
            </div>
            <button className="btn btn-primary btn-block btn-lg" onClick={openConfirm}>Cobrar {money(total)} <kbd>F2</kbd></button>
          </div>
        )}
      </aside>

      {confirmOpen && (
        <Modal
          title="Confirmar venta"
          onClose={() => !saving && setConfirmOpen(false)}
          width={460}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)} disabled={saving}>Volver</button>
              <button className="btn btn-primary" autoFocus onClick={confirm} disabled={saving}>{saving ? (facturar ? "Registrando y facturando..." : "Registrando...") : "Confirmar"}</button>
            </>
          }
        >
          {cart.map((i) => (
            <div key={i.id} className="row-between line">
              <span>{i.nombre} × {i.cantidad}{Number(i.descuentoPct) > 0 && <span className="text-success fs-13"> −{i.descuentoPct}%</span>}</span>
              <strong>{money(lineTotal(i))}</strong>
            </div>
          ))}
          {descMonto > 0 && <div className="row-between line text-success"><span>Descuento general</span><span>− {money(descMonto)}</span></div>}
          <div className="row-between total-line mt-12"><span>Total</span><span>{money(total)}</span></div>
          <div className="confirm-meta">
            <Badge>{paymentLabel(metodoPago)}</Badge>
            {facturar ? <Badge kind="accent">Factura {letraReceptor(receptor, fiscal)} · {receptor.tipo === "cf" ? "Consumidor final" : receptor.nombre}</Badge> : isBilling && <Badge kind="warning">Sin factura</Badge>}
          </div>
        </Modal>
      )}

      {result && <SaleDone result={result} onNew={reset} />}
    </div>
  );
}

function SaleDone({ result, onNew }) {
  const { sale, invoice, invoiceError } = result;
  const ok = invoice?.estado === "autorizada";
  const btnRef = useRef(null);
  useEffect(() => btnRef.current?.focus(), []);

  return (
    <Modal
      title={`Venta #${sale.id} registrada`}
      onClose={onNew}
      width={460}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => openPrint(`/imprimir/venta/${sale.id}`)}>🖨️ Ticket</button>
          {ok && <button className="btn btn-secondary" onClick={() => openPrint(`/imprimir/comprobante/${invoice.id}`)}>🖨️ Factura</button>}
          <button ref={btnRef} className="btn btn-primary" onClick={onNew}>Nueva venta</button>
        </>
      }
    >
      <div className="done-total">{money(sale.total)}</div>
      <p className="text-center text-muted">{paymentLabel(sale.metodo_pago)} · stock actualizado</p>
      {invoice && ok && (
        <div className="alert-banner alert-success mt-12">
          ✅ {CBTE_NOMBRES[invoice.tipo_cbte]} {cbteNumero(invoice.pto_vta, invoice.numero)} autorizada. CAE {invoice.cae}
        </div>
      )}
      {invoice && !ok && (
        <div className="alert-banner alert-warning mt-12">
          ⚠️ La venta quedó registrada, pero la factura está <strong>{invoice.estado}</strong>: {invoice.mensajes || "sin detalle"}.<br />
          Podés reintentarla desde <strong>Comprobantes ARCA</strong>.
        </div>
      )}
      {invoiceError && (
        <div className="alert-banner alert-warning mt-12">⚠️ La venta quedó registrada pero no se pudo facturar: {invoiceError}. Podés facturarla desde Ventas.</div>
      )}
    </Modal>
  );
}
