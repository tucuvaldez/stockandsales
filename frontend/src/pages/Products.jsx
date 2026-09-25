import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Confirm, Empty, Field, Loader, Modal, useDebounced } from "../components/ui";
import { PRODUCT_TEMPLATE, mapProductRows, parseCsv, saveText, toCsv } from "../lib/csv";
import { money, plural } from "../lib/format";

const EMPTY = { codigo: "", nombre: "", descripcion: "", categoria: "", talle: "", precio: "", precioCompra: "", stock: "", stockMinimo: "", alicuotaIva: 21 };

export default function Products() {
  const { can, isBilling } = useAuth();
  const manage = can("admin", "supervisor");
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [categoria, setCategoria] = useState("");
  const [bajoStock, setBajoStock] = useState(params.get("bajoStock") === "true");
  const [inactivos, setInactivos] = useState(false);
  const [products, setProducts] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [edit, setEdit] = useState(null);
  const [stockOf, setStockOf] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(() => {
    api.get("/products", { q: dq, categoria, bajoStock, inactivos }).then(setProducts).catch((e) => toast.error(e.message));
    api.get("/products/categorias").then(setCategorias).catch(() => {});
  }, [dq, categoria, bajoStock, inactivos]);
  useEffect(load, [load]);

  const exportCsv = () =>
    saveText(
      toCsv(products, [
        { label: "codigo", value: "codigo" }, { label: "nombre", value: "nombre" }, { label: "descripcion", value: "descripcion" },
        { label: "categoria", value: "categoria" }, { label: "talle", value: "talle" }, { label: "precio", value: "precio" },
        { label: "precioCompra", value: "precio_compra" }, { label: "stock", value: "stock" }, { label: "stockMinimo", value: "stock_minimo" },
        { label: "iva", value: "alicuota_iva" },
      ]),
      "productos.csv"
    );

  const restore = async (p) => {
    try { await api.post(`/products/${p.id}/restaurar`); toast.success("Producto restaurado"); load(); } catch (e) { toast.error(e.message); }
  };

  const stockBadge = (p) =>
    p.stock === 0 ? <Badge kind="danger">Sin stock</Badge> : p.stock <= p.stock_minimo ? <Badge kind="warning">{p.stock} u.</Badge> : <Badge kind="success">{p.stock} u.</Badge>;

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">Productos</h2><p className="page-subtitle">{products ? plural(products.length, "producto", "productos") : " "}</p></div>
        <div className="btn-row">
          {products?.length > 0 && <button className="btn btn-secondary" onClick={exportCsv}>⬇️ Exportar</button>}
          {manage && <button className="btn btn-secondary" onClick={() => setImportOpen(true)}>⬆️ Importar planilla</button>}
          {manage && <button className="btn btn-primary" onClick={() => setEdit(EMPTY)}>+ Nuevo producto</button>}
        </div>
      </div>

      <div className="filters-bar">
        <input className="form-input" autoFocus placeholder="🔍 Nombre, código o talle..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="form-select auto" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={bajoStock} onChange={(e) => setBajoStock(e.target.checked)} /> Solo stock bajo</label>
        {manage && <label className="check"><input type="checkbox" checked={inactivos} onChange={(e) => setInactivos(e.target.checked)} /> Ver eliminados</label>}
      </div>

      {!products ? <Loader /> : products.length === 0 ? (
        <Empty icon="📦" title="No hay productos para mostrar">{manage && !q && !bajoStock && "Creá el primero o importá una planilla."}</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th className="text-right">Precio</th><th>Stock</th>{manage && <th />}</tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.codigo}</td>
                  <td>
                    <strong>{p.nombre}</strong>{p.talle && <span className="text-muted"> · {p.talle}</span>}
                    {p.descripcion && <div className="fs-12 text-muted">{p.descripcion}</div>}
                  </td>
                  <td>{p.categoria}</td>
                  <td className="text-right fw-600">{money(p.precio)}{isBilling && p.alicuota_iva !== 21 && <div className="fs-12 text-muted">IVA {p.alicuota_iva}%</div>}</td>
                  <td>{stockBadge(p)}</td>
                  {manage && (
                    <td className="text-right nowrap">
                      {inactivos ? (
                        <button className="btn btn-sm btn-secondary" onClick={() => restore(p)}>Restaurar</button>
                      ) : (
                        <>
                          <button className="btn btn-sm btn-secondary" onClick={() => setStockOf(p)}>± Stock</button>
                          <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => setEdit(p)}>✏️</button>
                          <Link className="btn btn-sm btn-ghost" title="Movimientos" to={`/movimientos?productId=${p.id}&producto=${encodeURIComponent(p.nombre)}`}>🔁</Link>
                          <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => setToDelete(p)}>🗑️</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <ProductModal product={edit} categorias={categorias} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {stockOf && <StockModal product={stockOf} onClose={() => setStockOf(null)} onSaved={() => { setStockOf(null); load(); }} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />}
      {toDelete && (
        <Confirm
          title="Eliminar producto"
          danger
          confirmLabel="Eliminar"
          message={<p>¿Eliminar <strong>{toDelete.nombre}</strong>? Deja de aparecer en ventas, pero su historial se conserva y se puede restaurar.</p>}
          onConfirm={async () => {
            try { await api.del(`/products/${toDelete.id}`); toast.success("Producto eliminado"); load(); } catch (e) { toast.error(e.message); throw e; }
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

function ProductModal({ product, categorias, onClose, onSaved }) {
  const { isBilling } = useAuth();
  const isNew = !product.id;
  const [f, setF] = useState(
    isNew ? product : {
      codigo: product.codigo, nombre: product.nombre, descripcion: product.descripcion, categoria: product.categoria, talle: product.talle,
      precio: product.precio, precioCompra: product.precio_compra || "", stockMinimo: product.stock_minimo, alicuotaIva: product.alicuota_iva,
    }
  );
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const margen = Number(f.precioCompra) > 0 && Number(f.precio) > 0 ? Math.round(((f.precio - f.precioCompra) / f.precioCompra) * 100) : null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isNew) await api.post("/products", f);
      else await api.put(`/products/${product.id}`, f);
      toast.success(isNew ? "Producto creado" : "Cambios guardados");
      onSaved();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? "Nuevo producto" : "Editar producto"} onClose={onClose} closeOnOverlay={false}>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Código" required hint="Podés escanearlo con el lector"><input className="form-input mono" autoFocus value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value.toUpperCase() })} maxLength={40} /></Field>
          <Field label="Nombre" required><input className="form-input" value={f.nombre} onChange={set("nombre")} maxLength={120} /></Field>
        </div>
        <Field label="Descripción"><input className="form-input" value={f.descripcion} onChange={set("descripcion")} maxLength={300} /></Field>
        <div className="form-row">
          <Field label="Categoría">
            <input className="form-input" list="categorias" placeholder="General" value={f.categoria} onChange={set("categoria")} maxLength={60} />
            <datalist id="categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Talle / medida / variante"><input className="form-input" value={f.talle} onChange={set("talle")} maxLength={30} /></Field>
        </div>
        <div className="form-row">
          <Field label="Precio de venta (final)" required><input className="form-input" type="number" min="0" step="0.01" value={f.precio} onChange={set("precio")} /></Field>
          <Field label="Precio de costo" hint={margen !== null ? `Margen: ${margen}%` : undefined}><input className="form-input" type="number" min="0" step="0.01" value={f.precioCompra} onChange={set("precioCompra")} /></Field>
        </div>
        <div className="form-row">
          {isNew ? (
            <Field label="Stock inicial"><input className="form-input" type="number" min="0" step="1" value={f.stock} onChange={set("stock")} /></Field>
          ) : (
            <Field label="Stock actual" hint="Se cambia con el botón ± Stock"><input className="form-input" value={product.stock} disabled /></Field>
          )}
          <Field label="Stock mínimo (alerta)"><input className="form-input" type="number" min="0" step="1" value={f.stockMinimo} onChange={set("stockMinimo")} /></Field>
        </div>
        {isBilling && (
          <Field label="Alícuota de IVA" hint="El precio de venta incluye IVA">
            <select className="form-select" value={f.alicuotaIva} onChange={set("alicuotaIva")}>
              {[21, 10.5, 27, 5, 2.5, 0].map((a) => <option key={a} value={a}>{a}%</option>)}
            </select>
          </Field>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Guardando..." : isNew ? "Crear producto" : "Guardar cambios"}</button>
        </div>
      </form>
    </Modal>
  );
}

const OPS = {
  sumar: { label: "Ingreso de mercadería", hint: "Llegó mercadería: se suma al stock", motivo: false },
  restar: { label: "Egreso / pérdida", hint: "Rotura, vencimiento, uso interno, robo...", motivo: true },
  fijar: { label: "Conteo físico", hint: "Contaste el stock real: se reemplaza por ese número", motivo: true },
};

function StockModal({ product, onClose, onSaved }) {
  const [op, setOp] = useState("sumar");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Math.floor(Number(cantidad) || 0);
  const despues = op === "sumar" ? product.stock + n : op === "restar" ? product.stock - n : n;
  const invalid = cantidad === "" || n < (op === "fijar" ? 0 : 1) || despues < 0 || (OPS[op].motivo && !motivo.trim());

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/products/${product.id}/stock`, { operacion: op, cantidad: n, motivo });
      toast.success(`Stock de ${product.nombre}: ${despues}`);
      onSaved();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Stock · ${product.nombre}`} onClose={onClose} width={440}>
      <form onSubmit={submit}>
        <div className="op-list">
          {Object.entries(OPS).map(([k, o]) => (
            <label key={k} className={`op-option ${op === k ? "active" : ""}`}>
              <input type="radio" name="op" checked={op === k} onChange={() => setOp(k)} />
              <div><strong>{o.label}</strong><div className="fs-12 text-muted">{o.hint}</div></div>
            </label>
          ))}
        </div>
        <Field label={op === "fijar" ? "Cantidad contada" : "Cantidad"} required>
          <input className="form-input" type="number" min="0" step="1" autoFocus value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </Field>
        <Field label="Motivo" required={OPS[op].motivo}>
          <input className="form-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder={op === "sumar" ? "Ej: factura proveedor 0001-123" : ""} />
        </Field>
        <div className={`stock-preview ${despues < 0 ? "bad" : ""}`}>Stock: <strong>{product.stock}</strong> → <strong>{cantidad === "" ? "?" : despues}</strong></div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={invalid || busy}>{busy ? "Guardando..." : "Aplicar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({ onClose, onDone }) {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [modo, setModo] = useState("ignorar");
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files[0];
    setError("");
    setParsed(null);
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) return setError('Es un archivo de Excel. Abrilo en Excel y usá "Guardar como" → "CSV (delimitado por comas)", y subí ese archivo.');
    try {
      const buf = await file.arrayBuffer();
      let text = new TextDecoder("utf-8", { fatal: true }).decode(buf, { stream: false });
      setParsed(mapProductRows(parseCsv(text)));
    } catch (err) {
      if (err instanceof TypeError) {
        // No es UTF-8: Excel viejo guarda en Windows-1252.
        const text = new TextDecoder("windows-1252").decode(await file.arrayBuffer());
        try { setParsed(mapProductRows(parseCsv(text))); } catch (e2) { setError(e2.message); }
      } else setError(err.message);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post("/products/importar", { rows: parsed.products, stockExistentes: modo });
      toast.success(`Importación lista: ${r.creados} nuevos, ${r.actualizados} actualizados`);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Importar productos desde planilla"
      onClose={onClose}
      width={680}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!parsed || busy} onClick={submit}>{busy ? "Importando..." : parsed ? `Importar ${parsed.products.length} productos` : "Importar"}</button>
        </>
      }
    >
      <ol className="steps">
        <li>Descargá la <button className="link-btn" onClick={() => saveText(PRODUCT_TEMPLATE, "plantilla-productos.csv")}>plantilla de ejemplo</button> y completala en Excel.</li>
        <li>Guardala como <strong>CSV</strong> (Archivo → Guardar como → CSV).</li>
        <li>Subila acá. Columnas obligatorias: <strong>codigo, nombre, precio</strong>.</li>
      </ol>
      <input type="file" accept=".csv,.txt,.xls,.xlsx" onChange={onFile} className="mt-12" />
      {error && <div className="alert-banner alert-danger mt-12">{error}</div>}
      {parsed && (
        <>
          <p className="mt-12 fs-13">Se leyeron <strong>{parsed.products.length}</strong> filas. Columnas detectadas: {parsed.columns.join(", ")}.</p>
          <div className="table-wrap flat mt-8 preview">
            <table>
              <thead><tr>{parsed.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{parsed.products.slice(0, 8).map((p, i) => <tr key={i}>{parsed.columns.map((c) => <td key={c}>{p[c]}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {parsed.columns.includes("stock") && (
            <Field label="Si un producto ya existe, ¿qué hago con la columna stock?" className="mt-12">
              <select className="form-select" value={modo} onChange={(e) => setModo(e.target.value)}>
                <option value="ignorar">No tocar su stock (solo actualizar precio y datos)</option>
                <option value="sumar">Sumar la cantidad (llegó mercadería)</option>
                <option value="fijar">Reemplazar el stock por el de la planilla (conteo)</option>
              </select>
            </Field>
          )}
          <p className="fs-12 text-muted">Los productos nuevos se crean con el stock de la planilla. Cada cambio queda registrado en Movimientos.</p>
        </>
      )}
    </Modal>
  );
}
