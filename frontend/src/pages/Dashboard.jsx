import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Loader } from "../components/ui";
import { money, paymentLabel, plural } from "../lib/format";

const dayLabel = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric" });

export default function Dashboard() {
  const { isBilling } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/stats/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert-banner alert-warning">{error}</div>;
  if (!data) return <Loader />;
  const max = Math.max(1, ...data.ventasPorDia.map((d) => d.total));

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Resumen</h2>
          <p className="page-subtitle">{new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <Link to="/nueva-venta" className="btn btn-primary btn-lg">+ Nueva venta</Link>
      </div>

      {data.bajoStock.length > 0 && (
        <div className="alert-banner alert-warning">
          ⚠️ <strong>{plural(data.bajoStock.length, "producto", "productos")}</strong> con stock bajo o agotado
          <Link to="/productos?bajoStock=true" className="btn btn-sm btn-secondary push-right">Ver</Link>
        </div>
      )}
      {isBilling && data.comprobantesConProblemas > 0 && (
        <div className="alert-banner alert-danger">
          🏛️ <strong>{plural(data.comprobantesConProblemas, "comprobante", "comprobantes")}</strong> sin autorizar por ARCA
          <Link to="/comprobantes?problemas=true" className="btn btn-sm btn-secondary push-right">Revisar</Link>
        </div>
      )}

      <div className="stats-grid">
        <Stat label="Vendido hoy" value={money(data.ventasHoy.total)} meta={plural(data.ventasHoy.cantidad, "venta", "ventas")} kind="accent" />
        <Stat label="Vendido este mes" value={money(data.ventasMes.total)} meta={plural(data.ventasMes.cantidad, "venta", "ventas")} kind="success" />
        <Stat label="Ticket promedio (mes)" value={money(data.ventasMes.cantidad ? data.ventasMes.total / data.ventasMes.cantidad : 0)} />
        <Stat label="Productos activos" value={data.totalProductos} meta={`Inventario al costo: ${money(data.valorInventario)}`} />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">Últimos 7 días</h3>
          <div className="bars">
            {data.ventasPorDia.map((d) => (
              <div key={d.fecha} className="bar-row">
                <span className="bar-label">{dayLabel(d.fecha)}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(d.total / max) * 100}%` }} /></div>
                <span className="bar-value">{money(d.total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Más vendidos del mes</h3>
          {data.topProductos.length === 0 ? (
            <p className="text-muted fs-13">Todavía no hay ventas este mes</p>
          ) : (
            <ol className="rank">
              {data.topProductos.map((p) => (
                <li key={p.codigo}>
                  <div><strong>{p.nombre}</strong><span className="text-muted fs-13"> · {p.unidades} u.</span></div>
                  <span className="text-success fw-600">{money(p.ingresos)}</span>
                </li>
              ))}
            </ol>
          )}
          {data.mediosPago.length > 0 && (
            <>
              <h3 className="card-title mt-20">Medios de pago del mes</h3>
              {data.mediosPago.map((m) => (
                <div key={m.metodo_pago} className="row-between fs-13">
                  <span>{paymentLabel(m.metodo_pago)} ({m.cantidad})</span>
                  <strong>{money(m.total)}</strong>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {data.bajoStock.length > 0 && (
        <div className="card mt-20">
          <h3 className="card-title">Para reponer</h3>
          <div className="table-wrap flat">
            <table>
              <thead><tr><th>Código</th><th>Producto</th><th>Stock</th><th>Mínimo</th></tr></thead>
              <tbody>
                {data.bajoStock.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.codigo}</td>
                    <td>{p.nombre}{p.talle && <span className="text-muted"> ({p.talle})</span>}</td>
                    <td><span className={`badge ${p.stock === 0 ? "badge-danger" : "badge-warning"}`}>{p.stock} u.</span></td>
                    <td className="text-muted">{p.stock_minimo} u.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value, meta, kind = "" }) => (
  <div className="stat-card">
    <div className="stat-label">{label}</div>
    <div className={`stat-value ${kind}`}>{value}</div>
    {meta && <div className="stat-meta">{meta}</div>}
  </div>
);
