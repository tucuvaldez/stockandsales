import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import { Empty, Loader, Pagination, useDebounced } from "../components/ui";
import { dateTime } from "../lib/format";

const ACCIONES = {
  login: "Inicio de sesión", "login.fallido": "Intento de ingreso fallido",
  "venta.crear": "Venta", "venta.devolucion": "Devolución", "venta.anular": "Anulación de venta",
  "producto.crear": "Alta de producto", "producto.editar": "Edición de producto", "producto.eliminar": "Baja de producto",
  "producto.restaurar": "Producto restaurado", "producto.reactivar": "Producto reactivado", "producto.importar": "Importación de productos",
  "factura.crear": "Factura", "nota_credito.crear": "Nota de crédito", "comprobante.emitir": "Envío a ARCA", "comprobante.descartar": "Comprobante descartado",
  "usuario.crear": "Alta de usuario", "usuario.editar": "Edición de usuario", "usuario.cambiar_clave": "Cambio de contraseña",
  "config.negocio": "Datos del negocio", "config.fiscal": "Configuración fiscal", "config.certificado": "Certificado ARCA", "config.generar_csr": "Solicitud de certificado",
  "backup.crear": "Copia de seguridad", "backup.descargar": "Descarga de copia",
  "sistema.instalar": "Instalación", "sistema.cambiar_modo": "Cambio de modo", "sistema.restablecer_clave": "Contraseña restablecida por técnico",
  "caja.abrir": "Apertura de caja", "caja.cerrar": "Cierre de caja", "caja.ingreso": "Ingreso de dinero", "caja.egreso": "Pago / gasto / retiro",
  "cliente.crear": "Alta de cliente", "cliente.editar": "Edición de cliente", "cliente.eliminar": "Baja de cliente",
};

function detail(raw) {
  if (!raw) return "";
  try {
    const d = JSON.parse(raw);
    return Object.entries(d)
      .map(([k, v]) => `${k}: ${v && typeof v === "object" ? ("antes" in v ? `${v.antes} → ${v.despues}` : JSON.stringify(v)) : v}`)
      .join(" · ");
  } catch {
    return raw;
  }
}

export default function Activity() {
  const [f, setF] = useState({ q: "", desde: "", hasta: "" });
  const dq = useDebounced(f.q, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/settings/actividad", { q: dq, desde: f.desde, hasta: f.hasta, page }).then(setData).catch((e) => toast.error(e.message));
  }, [dq, f.desde, f.hasta, page]);
  const setFilter = (patch) => { setF({ ...f, ...patch }); setPage(1); };

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">Registro de actividad</h2><p className="page-subtitle">Quién hizo qué y cuándo. No se puede editar ni borrar.</p></div>
      </div>
      <div className="filters-bar">
        <input className="form-input" placeholder="🔍 Usuario, acción o detalle..." value={f.q} onChange={(e) => setFilter({ q: e.target.value })} />
        <label className="inline-label">Desde <input className="form-input" type="date" value={f.desde} onChange={(e) => setFilter({ desde: e.target.value })} /></label>
        <label className="inline-label">Hasta <input className="form-input" type="date" value={f.hasta} onChange={(e) => setFilter({ hasta: e.target.value })} /></label>
      </div>
      {!data ? <Loader /> : data.items.length === 0 ? <Empty icon="🕓" title="Sin actividad registrada" /> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className={a.accion === "login.fallido" ? "row-warn" : ""}>
                    <td className="fs-13 nowrap">{dateTime(a.fecha)}</td>
                    <td className="fs-13">{a.usuario_nombre}</td>
                    <td className="fs-13">{ACCIONES[a.accion] || a.accion}{a.entidad_id && <span className="text-muted"> #{a.entidad_id}</span>}</td>
                    <td className="fs-12 text-muted msg">{detail(a.detalle)}</td>
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
