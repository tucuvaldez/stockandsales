import { useState, useEffect } from "react";
import { getDashboard } from "../services/api";
import { Link } from "react-router-dom";

const fmt = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmtDate = (d) => new Date(d).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getDashboard().then(setData).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="loader"><div className="spinner" /> Cargando...</div>;
  if (!data) return <p>Error al cargar datos.</p>;

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">Dashboard</h2><p className="page-subtitle">Resumen del día y del mes</p></div>
        <Link to="/nueva-venta" className="btn btn-primary">+ Nueva Venta</Link>
      </div>

      {data.bajoStock.length > 0 && (
        <div className="alert-banner alert-warning">
          ⚠️ <strong>{data.bajoStock.length} producto{data.bajoStock.length > 1 ? "s" : ""}</strong> con stock bajo o sin stock
          <Link to="/productos?bajoStock=true" className="btn btn-sm btn-secondary" style={{ marginLeft: "auto" }}>Ver</Link>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Ventas hoy</div><div className="stat-value accent">{fmt(data.ventasHoy.total)}</div><div className="stat-meta">{data.ventasHoy.cantidad} transacciones</div></div>
        <div className="stat-card"><div className="stat-label">Ventas del mes</div><div className="stat-value success">{fmt(data.ventasMes.total)}</div><div className="stat-meta">{data.ventasMes.cantidad} transacciones</div></div>
        <div className="stat-card"><div className="stat-label">Total productos</div><div className="stat-value">{data.totalProductos}</div><div className="stat-meta">en inventario</div></div>
        <div className="stat-card"><div className="stat-label">Stock bajo</div><div className={`stat-value ${data.bajoStock.length > 0 ? "warning" : "success"}`}>{data.bajoStock.length}</div><div className="stat-meta">productos a reponer</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Ventas últimos 7 días</h3>
          {data.ventasPorDia.length === 0 ? <p className="text-muted fs-13">Sin ventas registradas</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.ventasPorDia.map((d) => {
                const max = Math.max(...data.ventasPorDia.map((x) => x.total));
                return (
                  <div key={d._id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 80, fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(d._id)}</span>
                    <div style={{ flex: 1, height: 8, background: "var(--surface2)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${max ? (d.total/max)*100 : 0}%`, height: "100%", background: "var(--accent)", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: "right" }}>{fmt(d.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Top productos del mes</h3>
          {data.topProductos.length === 0 ? <p className="text-muted fs-13">Sin ventas este mes</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.topProductos.map((p, i) => (
                <div key={p._id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: i === 0 ? "var(--accent)" : "var(--surface2)", color: i === 0 ? "white" : "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.totalVendido} unidades</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--success)" }}>{fmt(p.totalIngresos)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {data.bajoStock.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>⚠️ Productos a reponer</h3>
          <div className="table-wrap" style={{ border: "none", boxShadow: "none" }}>
            <table>
              <thead><tr><th>Código</th><th>Nombre</th><th>Talle</th><th>Stock actual</th><th>Stock mínimo</th></tr></thead>
              <tbody>
                {data.bajoStock.map((p) => (
                  <tr key={p._id}>
                    <td className="mono">{p.codigo}</td>
                    <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                    <td>{p.talle || "—"}</td>
                    <td><span className={`badge ${p.stock === 0 ? "badge-danger" : "badge-warning"}`}>{p.stock} ud.</span></td>
                    <td className="text-muted fs-13">{p.stockMinimo} ud.</td>
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
