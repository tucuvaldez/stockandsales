import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, download } from "../api";
import { Badge, Empty, Loader, Pagination, useDebounced } from "../components/ui";
import { MOVEMENT_TYPES, dateTime, plural } from "../lib/format";

export default function Movements() {
  const [params, setParams] = useSearchParams();
  const productId = params.get("productId") || "";
  const productName = params.get("producto") || "";
  const [f, setF] = useState({ tipo: "", desde: "", hasta: "", q: "" });
  const dq = useDebounced(f.q, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  const query = { tipo: f.tipo, desde: f.desde, hasta: f.hasta, q: dq, productId };
  useEffect(() => {
    api.get("/movements", { ...query, page }).then(setData).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.tipo, f.desde, f.hasta, dq, productId, page]);

  const setFilter = (patch) => { setF({ ...f, ...patch }); setPage(1); };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Movimientos de stock</h2>
          <p className="page-subtitle">Cada entrada y salida de mercadería, con stock antes y después{data ? ` · ${plural(data.total, "movimiento", "movimientos")}` : ""}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => download("/movements/export.csv", query, "movimientos.csv").catch((e) => toast.error(e.message))}>⬇️ Exportar a Excel</button>
      </div>

      {productId && (
        <div className="alert-banner alert-info">
          Mostrando solo: <strong>{productName || `producto #${productId}`}</strong>
          <button className="btn btn-sm btn-secondary push-right" onClick={() => setParams({})}>Ver todos</button>
        </div>
      )}

      <div className="filters-bar">
        <input className="form-input" placeholder="🔍 Producto, código o motivo..." value={f.q} onChange={(e) => setFilter({ q: e.target.value })} />
        <select className="form-select auto" value={f.tipo} onChange={(e) => setFilter({ tipo: e.target.value })}>
          <option value="">Todos los tipos</option>
          {Object.entries(MOVEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="inline-label">Desde <input className="form-input" type="date" value={f.desde} onChange={(e) => setFilter({ desde: e.target.value })} /></label>
        <label className="inline-label">Hasta <input className="form-input" type="date" value={f.hasta} onChange={(e) => setFilter({ hasta: e.target.value })} /></label>
      </div>

      {!data ? <Loader /> : data.movements.length === 0 ? <Empty icon="🔁" title="No hay movimientos para mostrar" /> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th className="text-right">Cantidad</th><th className="text-right">Stock</th><th>Motivo</th><th>Usuario</th></tr></thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="fs-13 nowrap">{dateTime(m.fecha)}</td>
                    <td><Badge kind={MOVEMENT_TYPES[m.tipo]?.badge}>{MOVEMENT_TYPES[m.tipo]?.label || m.tipo}</Badge></td>
                    <td><span className="mono fs-12 text-muted">{m.codigo}</span> {m.nombre}</td>
                    <td className={`text-right fw-700 ${m.cantidad < 0 ? "text-danger" : "text-success"}`}>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</td>
                    <td className="text-right nowrap text-muted">{m.stock_antes} → <strong className="text-body">{m.stock_despues}</strong></td>
                    <td className="fs-13">{m.motivo}</td>
                    <td className="fs-13 text-muted">{m.usuario_nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
