import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Loader } from "../components/ui";
import { dateTime, money, paymentLabel } from "../lib/format";

export default function PrintSale() {
  const { id } = useParams();
  const { negocio } = useAuth();
  const [sale, setSale] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { api.get(`/sales/${id}`).then(setSale).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => {
    if (sale && negocio) setTimeout(() => window.print(), 300);
  }, [sale, negocio]);

  if (error) return <p className="print-error">{error}</p>;
  if (!sale || !negocio) return <Loader />;

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Imprimir</button>
        <button className="btn btn-secondary" onClick={() => window.close()}>Cerrar</button>
      </div>
      <div className="ticket">
        <div className="t-center t-big">{negocio.negocio_nombre}</div>
        {negocio.negocio_direccion && <div className="t-center">{negocio.negocio_direccion}</div>}
        {negocio.negocio_telefono && <div className="t-center">Tel: {negocio.negocio_telefono}</div>}
        <div className="t-sep" />
        <div>Venta N° {sale.id}</div>
        <div>{dateTime(sale.fecha)}</div>
        <div>Atendió: {sale.usuario_nombre}</div>
        {sale.estado === "anulada" && <div className="t-center t-big">*** ANULADA ***</div>}
        <div className="t-sep" />
        {sale.items.map((i) => (
          <div key={i.id} className="t-item">
            <div>{i.nombre}{i.talle && ` (${i.talle})`}</div>
            <div className="t-row">
              <span>{i.cantidad} x {money(i.precio_unitario)}{i.descuento_pct > 0 && ` -${i.descuento_pct}%`}</span>
              <span>{money(i.subtotal)}</span>
            </div>
          </div>
        ))}
        <div className="t-sep" />
        {sale.descuento_monto > 0 && <div className="t-row"><span>Descuento</span><span>-{money(sale.descuento_monto)}</span></div>}
        <div className="t-row t-big"><span>TOTAL</span><span>{money(sale.total)}</span></div>
        {sale.total_devuelto > 0 && <div className="t-row"><span>Devuelto</span><span>-{money(sale.total_devuelto)}</span></div>}
        <div className="t-row"><span>Pago</span><span>{paymentLabel(sale.metodo_pago)}</span></div>
        <div className="t-sep" />
        <div className="t-center t-small">COMPROBANTE NO VÁLIDO COMO FACTURA</div>
        {negocio.negocio_pie_ticket && <div className="t-center t-small mt-8">{negocio.negocio_pie_ticket}</div>}
      </div>
    </div>
  );
}
