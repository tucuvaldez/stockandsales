import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../api";
import { useAuth } from "../auth";
import { Loader } from "../components/ui";
import { autoPrint, inFrame } from "../lib/print";
import { CBTE_LETRA, CBTE_NOMBRES, DOC_TIPOS, cbteNumero, condicionLabel, date, money, round2, ymd } from "../lib/format";

const CODIGOS = { 1: "01", 3: "03", 6: "06", 8: "08", 11: "11", 13: "13" };
const ymdIso = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

// Código QR obligatorio (RG 4892): JSON en base64 dentro de la URL de ARCA.
function qrUrl(inv) {
  const data = {
    ver: 1, fecha: ymdIso(inv.fecha), cuit: Number(inv.cuit_emisor), ptoVta: inv.pto_vta, tipoCmp: inv.tipo_cbte, nroCmp: inv.numero,
    importe: inv.imp_total, moneda: "PES", ctz: 1, tipoDocRec: inv.doc_tipo, nroDocRec: Number(inv.doc_nro) || 0, tipoCodAut: "E", codAut: Number(inv.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(data))}`;
}

export default function PrintInvoice() {
  const { id } = useParams();
  const { negocio } = useAuth();
  const [inv, setInv] = useState(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/invoices/${id}`).then(async (r) => {
      if (r.estado !== "autorizada") throw new Error("Este comprobante no está autorizado por ARCA y no se puede imprimir.");
      setInv(r);
      setQr(await QRCode.toDataURL(qrUrl(r), { margin: 0, width: 220 }));
    }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (inv && qr && negocio) autoPrint();
  }, [inv, qr, negocio]);

  if (error) return <p className="print-error">{error}</p>;
  if (!inv || !qr || !negocio) return <Loader />;

  const f = negocio.fiscal || {};
  const letra = CBTE_LETRA[inv.tipo_cbte];
  const discrimina = letra === "A";
  const neto = (gross, alic) => round2(gross / (1 + alic / 100));
  const formato = new URLSearchParams(window.location.search).get("formato") || negocio.impresion?.factura_formato || "a4";
  if (formato === "ticket") return <InvoiceTicket inv={inv} f={f} qr={qr} letra={letra} discrimina={discrimina} neto={neto} />;

  return (
    <div className="print-page">
      {!inFrame() && <div className="print-toolbar no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Imprimir / Guardar PDF</button>
        <button className="btn btn-secondary" onClick={() => window.close()}>Cerrar</button>
      </div>}
      <div className="invoice">
        {inv.entorno === "homologacion" && <div className="inv-watermark">PRUEBA — SIN VALIDEZ FISCAL</div>}
        <div className="inv-original">ORIGINAL</div>
        <header className="inv-head">
          <div className="inv-emisor">
            <div className="inv-razon">{f.razonSocial}</div>
            {f.domicilio && <div><b>Domicilio:</b> {f.domicilio}</div>}
            <div><b>Condición frente al IVA:</b> {f.condicionNombre}</div>
          </div>
          <div className="inv-letra"><span>{letra}</span><small>COD. {CODIGOS[inv.tipo_cbte]}</small></div>
          <div className="inv-datos">
            <div className="inv-tipo">{CBTE_NOMBRES[inv.tipo_cbte].replace(/ [ABC]$/, "").toUpperCase()}</div>
            <div><b>Punto de venta:</b> {String(inv.pto_vta).padStart(5, "0")} <b>Comp. Nro:</b> {String(inv.numero).padStart(8, "0")}</div>
            <div><b>Fecha de emisión:</b> {ymd(inv.fecha)}</div>
            <div><b>CUIT:</b> {inv.cuit_emisor}</div>
            {f.iibb && <div><b>Ingresos Brutos:</b> {f.iibb}</div>}
            {f.inicioActividades && <div><b>Inicio de actividades:</b> {date(`${f.inicioActividades}T12:00:00`)}</div>}
          </div>
        </header>

        <section className="inv-receptor">
          <div><b>{DOC_TIPOS.find((d) => d.value === inv.doc_tipo)?.label.split(" ")[0]}:</b> {inv.doc_tipo === 99 ? "—" : inv.doc_nro}</div>
          <div><b>Apellido y nombre / Razón social:</b> {inv.receptor_nombre}</div>
          <div><b>Condición frente al IVA:</b> {condicionLabel(inv.condicion_iva_receptor)}</div>
          {inv.receptor_domicilio && <div><b>Domicilio:</b> {inv.receptor_domicilio}</div>}
          <div><b>Condición de venta:</b> Contado</div>
          {inv.asociado && <div><b>Comprobante asociado:</b> {CBTE_NOMBRES[inv.asociado.tipo_cbte]} {cbteNumero(inv.asociado.pto_vta, inv.asociado.numero)} del {ymd(inv.asociado.fecha)}</div>}
        </section>

        <table className="inv-items">
          <thead>
            <tr><th>Código</th><th>Producto</th><th className="r">Cant.</th><th className="r">Precio unit.</th>{discrimina && <th className="r">IVA</th>}<th className="r">Subtotal</th></tr>
          </thead>
          <tbody>
            {inv.items.map((i, idx) => (
              <tr key={idx}>
                <td>{i.codigo}</td>
                <td>{i.nombre}</td>
                <td className="r">{i.cantidad}</td>
                <td className="r">{money(discrimina ? neto(i.precioUnitario, i.alicuota) : i.precioUnitario)}</td>
                {discrimina && <td className="r">{i.alicuota}%</td>}
                <td className="r">{money(discrimina ? neto(i.precioUnitario * i.cantidad, i.alicuota) : i.precioUnitario * i.cantidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="inv-totals">
          {discrimina && (
            <>
              <div><span>Importe neto gravado</span><span>{money(inv.imp_neto)}</span></div>
              {inv.iva.map((a) => <div key={a.id}><span>IVA {a.alicuota}%</span><span>{money(a.importe)}</span></div>)}
            </>
          )}
          <div className="inv-total"><span>Importe total</span><span>{money(inv.imp_total)}</span></div>
          {letra === "B" && (
            <div className="inv-transparencia">
              Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) — IVA contenido: {money(inv.imp_iva)}
            </div>
          )}
        </section>

        <footer className="inv-foot">
          <img src={qr} alt="Código QR ARCA" width="110" height="110" />
          <div className="inv-cae">
            <div className="inv-arca">Comprobante autorizado por ARCA</div>
            <div><b>CAE N°:</b> {inv.cae}</div>
            <div><b>Fecha de vto. de CAE:</b> {ymd(inv.cae_vto)}</div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Factura electrónica en formato ticket (80 mm) para impresoras térmicas.
function InvoiceTicket({ inv, f, qr, letra, discrimina, neto }) {
  return (
    <div className="print-page">
      {!inFrame() && (
        <div className="print-toolbar no-print">
          <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Imprimir</button>
          <button className="btn btn-secondary" onClick={() => window.close()}>Cerrar</button>
        </div>
      )}
      <div className="ticket">
        {inv.entorno === "homologacion" && <div className="t-center t-big">*** PRUEBA - SIN VALIDEZ FISCAL ***</div>}
        <div className="t-center t-big">{f.razonSocial}</div>
        {f.domicilio && <div className="t-center">{f.domicilio}</div>}
        <div className="t-center">CUIT {inv.cuit_emisor}{f.iibb && ` · IIBB ${f.iibb}`}</div>
        <div className="t-center">{f.condicionNombre}</div>
        {f.inicioActividades && <div className="t-center">Inicio act.: {date(`${f.inicioActividades}T12:00:00`)}</div>}
        <div className="t-sep" />
        <div className="t-center t-big">{CBTE_NOMBRES[inv.tipo_cbte].toUpperCase()} (cód. {CODIGOS[inv.tipo_cbte]})</div>
        <div className="t-center">N° {cbteNumero(inv.pto_vta, inv.numero)} · {ymd(inv.fecha)}</div>
        <div className="t-sep" />
        <div>{inv.receptor_nombre}</div>
        {inv.doc_tipo !== 99 && <div>{DOC_TIPOS.find((d) => d.value === inv.doc_tipo)?.label.split(" ")[0]}: {inv.doc_nro}</div>}
        <div>{condicionLabel(inv.condicion_iva_receptor)}</div>
        {inv.asociado && <div>Asoc.: {CBTE_NOMBRES[inv.asociado.tipo_cbte]} {cbteNumero(inv.asociado.pto_vta, inv.asociado.numero)}</div>}
        <div className="t-sep" />
        {inv.items.map((i, idx) => (
          <div key={idx} className="t-item">
            <div>{i.nombre}</div>
            <div className="t-row">
              <span>{i.cantidad} x {money(discrimina ? neto(i.precioUnitario, i.alicuota) : i.precioUnitario)}{discrimina && ` (IVA ${i.alicuota}%)`}</span>
              <span>{money(discrimina ? neto(i.precioUnitario * i.cantidad, i.alicuota) : i.precioUnitario * i.cantidad)}</span>
            </div>
          </div>
        ))}
        <div className="t-sep" />
        {discrimina && (
          <>
            <div className="t-row"><span>Neto gravado</span><span>{money(inv.imp_neto)}</span></div>
            {inv.iva.map((a) => <div key={a.id} className="t-row"><span>IVA {a.alicuota}%</span><span>{money(a.importe)}</span></div>)}
          </>
        )}
        <div className="t-row t-big"><span>TOTAL</span><span>{money(inv.imp_total)}</span></div>
        {letra === "B" && <div className="t-small">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) - IVA contenido: {money(inv.imp_iva)}</div>}
        <div className="t-sep" />
        <div className="t-center"><img src={qr} alt="QR ARCA" width="130" height="130" /></div>
        <div className="t-center">CAE {inv.cae}</div>
        <div className="t-center">Vto. CAE {ymd(inv.cae_vto)}</div>
        <div className="t-center t-small">Comprobante autorizado por ARCA</div>
      </div>
    </div>
  );
}
