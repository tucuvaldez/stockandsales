import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, download } from "../api";
import { useAuth } from "../auth";
import { openPdf, printInFrame } from "../lib/print";
import { Badge, Confirm, Empty, Loader, Pagination } from "../components/ui";
import { CBTE_NOMBRES, INVOICE_STATES, cbteNumero, money, plural, ymd } from "../lib/format";

export default function Invoices() {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [f, setF] = useState({ estado: "", desde: "", hasta: "", problemas: params.get("problemas") === "true" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toDiscard, setToDiscard] = useState(null);

  const load = useCallback(() => {
    api.get("/invoices", { ...f, page }).then(setData).catch((e) => toast.error(e.message));
  }, [f, page]);
  useEffect(load, [load]);
  const setFilter = (patch) => { setF({ ...f, ...patch }); setPage(1); };

  const retry = async (inv) => {
    setBusyId(inv.id);
    try {
      const r = await api.post(`/invoices/${inv.id}/reintentar`);
      if (r.estado === "autorizada") toast.success(`${CBTE_NOMBRES[r.tipo_cbte]} ${cbteNumero(r.pto_vta, r.numero)} autorizada`);
      else toast.error(`Sigue ${r.estado}: ${r.mensajes}`);
    } catch (e) {
      toast.error(e.message);
    }
    setBusyId(null);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">Comprobantes ARCA</h2><p className="page-subtitle">Facturas y notas de crédito electrónicas{data ? ` · ${plural(data.total, "comprobante", "comprobantes")}` : ""}</p></div>
        {can("admin", "supervisor") && <button className="btn btn-secondary" onClick={() => download("/invoices/export.csv", f, "comprobantes.csv").catch((e) => toast.error(e.message))}>⬇️ Libro para el contador</button>}
      </div>

      <div className="filters-bar">
        <select className="form-select auto" value={f.estado} onChange={(e) => setFilter({ estado: e.target.value, problemas: false })}>
          <option value="">Todos los estados</option>
          {Object.entries(INVOICE_STATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="inline-label">Desde <input className="form-input" type="date" value={f.desde} onChange={(e) => setFilter({ desde: e.target.value })} /></label>
        <label className="inline-label">Hasta <input className="form-input" type="date" value={f.hasta} onChange={(e) => setFilter({ hasta: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={f.problemas} onChange={(e) => setFilter({ problemas: e.target.checked, estado: "" })} /> Solo con problemas</label>
      </div>

      {!data ? <Loader /> : data.invoices.length === 0 ? <Empty icon="🏛️" title="No hay comprobantes para mostrar" /> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Comprobante</th><th>Receptor</th><th className="text-right">Total</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="nowrap fs-13">{ymd(inv.fecha)}</td>
                    <td>
                      <strong>{CBTE_NOMBRES[inv.tipo_cbte]}</strong> <span className="mono">{cbteNumero(inv.pto_vta, inv.numero)}</span>
                      <div className="fs-12 text-muted">Venta #{inv.sale_id}{inv.entorno === "homologacion" && " · PRUEBA"}</div>
                    </td>
                    <td className="fs-13">{inv.receptor_nombre}{inv.doc_nro !== "0" && <div className="text-muted">{inv.doc_nro}</div>}</td>
                    <td className="text-right fw-600">{money(inv.imp_total)}</td>
                    <td>
                      <Badge kind={INVOICE_STATES[inv.estado]?.badge}>{INVOICE_STATES[inv.estado]?.label}</Badge>
                      {inv.estado === "autorizada" ? <div className="fs-12 text-muted mono">CAE {inv.cae}</div> : inv.mensajes && <div className="fs-12 text-muted msg">{inv.mensajes}</div>}
                    </td>
                    <td className="text-right nowrap">
                      {inv.estado === "autorizada" && (
                        <>
                          <button className="btn btn-sm btn-secondary" onClick={() => openPdf(`/documents/comprobante/${inv.id}.pdf`).catch((e) => toast.error(e.message))}>📄 PDF</button>
                          <button className="btn btn-sm btn-ghost" title="Imprimir" onClick={() => printInFrame(`/imprimir/comprobante/${inv.id}`)}>🖨️</button>
                        </>
                      )}
                      {["pendiente", "error", "rechazada"].includes(inv.estado) && (
                        <button className="btn btn-sm btn-primary" disabled={busyId === inv.id} onClick={() => retry(inv)}>{busyId === inv.id ? "Enviando..." : "Reintentar"}</button>
                      )}
                      {can("admin", "supervisor") && ["error", "rechazada"].includes(inv.estado) && <button className="btn btn-sm btn-ghost" onClick={() => setToDiscard(inv)}>Descartar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </>
      )}

      {toDiscard && (
        <Confirm
          title="Descartar comprobante"
          message={<p>El comprobante nunca fue autorizado por ARCA. Al descartarlo la venta #{toDiscard.sale_id} queda sin factura (podés facturarla de nuevo desde Ventas).</p>}
          confirmLabel="Descartar"
          onConfirm={async () => {
            try { await api.post(`/invoices/${toDiscard.id}/descartar`); toast.success("Comprobante descartado"); load(); } catch (e) { toast.error(e.message); throw e; }
          }}
          onClose={() => setToDiscard(null)}
        />
      )}
    </div>
  );
}
