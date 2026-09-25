import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Loader } from "../components/ui";
import { autoPrint, inFrame } from "../lib/print";
import { PAYMENT_METHODS, dateTime, money } from "../lib/format";

const TIPO_LABEL = { venta: "Ventas", devolucion: "Devoluciones", anulacion: "Anulaciones", ingreso: "Ingresos", egreso: "Egresos" };

export default function PrintCash() {
  const { id } = useParams();
  const { negocio } = useAuth();
  const [s, setS] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { api.get(`/cash/${id}`).then(setS).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { if (s && negocio) autoPrint(); }, [s, negocio]);

  if (error) return <p className="print-error">{error}</p>;
  if (!s || !negocio) return <Loader />;
  const manual = s.entries.filter((e) => e.tipo === "ingreso" || e.tipo === "egreso");

  return (
    <div className="print-page">
      {!inFrame() && <div className="print-toolbar no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Imprimir</button>
        <button className="btn btn-secondary" onClick={() => window.close()}>Cerrar</button>
      </div>}
      <div className="ticket">
        <div className="t-center t-big">{negocio.negocio_nombre}</div>
        <div className="t-center">CIERRE DE CAJA N° {s.id}</div>
        <div className="t-sep" />
        <div>Apertura: {dateTime(s.abierta_at)}</div>
        <div>Por: {s.abierta_por}</div>
        <div>Cierre: {dateTime(s.cerrada_at)}</div>
        <div>Por: {s.cerrada_por || "—"}</div>
        <div className="t-sep" />
        <div className="t-row"><span>Ventas ({s.cantidadVentas})</span><span>{money(s.porTipo.venta || 0)}</span></div>
        {Object.entries(TIPO_LABEL).filter(([k]) => k !== "venta" && s.porTipo[k]).map(([k, l]) => (
          <div key={k} className="t-row"><span>{l}</span><span>{money(s.porTipo[k])}</span></div>
        ))}
        <div className="t-sep" />
        <div>POR MEDIO DE PAGO</div>
        {PAYMENT_METHODS.filter((m) => s.porMedio[m.value]).map((m) => (
          <div key={m.value} className="t-row"><span>{m.label}</span><span>{money(s.porMedio[m.value])}</span></div>
        ))}
        {manual.length > 0 && (
          <>
            <div className="t-sep" />
            <div>INGRESOS / EGRESOS</div>
            {manual.map((e) => <div key={e.id} className="t-row"><span>{e.motivo}</span><span>{money(e.monto)}</span></div>)}
          </>
        )}
        <div className="t-sep" />
        <div className="t-row"><span>Efectivo inicial</span><span>{money(s.monto_inicial)}</span></div>
        <div className="t-row"><span>Efectivo esperado</span><span>{money(s.efectivo_esperado)}</span></div>
        <div className="t-row"><span>Efectivo contado</span><span>{money(s.efectivo_contado)}</span></div>
        <div className="t-row t-big"><span>DIFERENCIA</span><span>{money(s.diferencia)}</span></div>
        {s.nota_cierre && <div className="mt-8">Obs: {s.nota_cierre}</div>}
        <div className="t-sep" />
        <div className="mt-20 t-center">Firma: ____________________</div>
      </div>
    </div>
  );
}
