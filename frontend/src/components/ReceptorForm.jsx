import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useDebounced } from "./ui";
import { CONDICIONES_IVA, DOC_TIPOS, condicionLabel, isValidCuit, letraPara, money } from "../lib/format";

export const CONSUMIDOR_FINAL = { tipo: "cf", docTipo: 99, docNro: "", nombre: "", condicionIva: 5, domicilio: "" };

// Convierte el estado del formulario en el "receptor" que espera la API.
export function receptorPayload(r) {
  if (r.tipo === "cliente") return { clientId: r.clientId };
  if (r.tipo === "cf") return { docTipo: 99, condicionIva: 5 };
  return { docTipo: Number(r.docTipo), docNro: r.docNro, nombre: r.nombre, condicionIva: Number(r.condicionIva), domicilio: r.domicilio };
}

// Validación rápida en pantalla (el servidor vuelve a validar todo).
export function receptorError(r, total, fiscal) {
  if (r.tipo === "cf") {
    if (fiscal && total >= fiscal.limiteConsumidorFinal) return `Desde ${money(fiscal.limiteConsumidorFinal)} ARCA exige DNI o CUIT del comprador`;
    return null;
  }
  if (r.tipo === "cliente") return r.clientId ? null : "Elegí un cliente";
  const doc = String(r.docNro || "").replace(/\D/g, "");
  if (!r.nombre?.trim()) return "Ingresá el nombre del comprador";
  if ([80, 86].includes(Number(r.docTipo)) && !isValidCuit(doc)) return "El CUIT/CUIL no es válido";
  if (Number(r.docTipo) === 96 && !/^\d{7,8}$/.test(doc)) return "El DNI debe tener 7 u 8 dígitos";
  if (letraPara(fiscal?.condicion, r.condicionIva) === "A" && Number(r.docTipo) !== 80) return "La Factura A requiere CUIT";
  return null;
}

export function letraReceptor(r, fiscal) {
  return letraPara(fiscal?.condicion, r.tipo === "cliente" ? r.condicionIva : r.tipo === "cf" ? 5 : r.condicionIva);
}

export default function ReceptorForm({ value, onChange }) {
  const { negocio } = useAuth();
  const fiscal = negocio?.fiscal;
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const dq = useDebounced(q, 250);
  const set = (patch) => onChange({ ...value, ...patch });

  useEffect(() => {
    if (value.tipo !== "cliente" || !dq) return setResults([]);
    api.get("/clients", { q: dq }).then(setResults).catch(() => setResults([]));
  }, [dq, value.tipo]);

  return (
    <div className="receptor">
      <div className="segmented">
        {[["cf", "Consumidor final"], ["datos", "Con datos"], ["cliente", "Cliente guardado"]].map(([k, l]) => (
          <button key={k} type="button" className={value.tipo === k ? "active" : ""} onClick={() => onChange({ ...CONSUMIDOR_FINAL, tipo: k, docTipo: k === "datos" ? 96 : 99 })}>{l}</button>
        ))}
      </div>

      {value.tipo === "datos" && (
        <div className="receptor-fields">
          <div className="form-row">
            <select className="form-select" value={value.docTipo} onChange={(e) => set({ docTipo: Number(e.target.value), condicionIva: Number(e.target.value) === 80 ? value.condicionIva : 5 })}>
              {DOC_TIPOS.filter((d) => d.value !== 99).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <input className="form-input mono" placeholder="Número (sin guiones)" inputMode="numeric" value={value.docNro} onChange={(e) => set({ docNro: e.target.value.replace(/\D/g, "") })} />
          </div>
          <input className="form-input" placeholder="Nombre o razón social" value={value.nombre} onChange={(e) => set({ nombre: e.target.value })} />
          <select className="form-select" value={value.condicionIva} onChange={(e) => set({ condicionIva: Number(e.target.value) })}>
            {CONDICIONES_IVA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input className="form-input" placeholder="Domicilio (opcional)" value={value.domicilio} onChange={(e) => set({ domicilio: e.target.value })} />
        </div>
      )}

      {value.tipo === "cliente" && (
        <div className="receptor-fields">
          {value.clientId ? (
            <div className="picked">
              <div><strong>{value.nombre}</strong><div className="fs-13 text-muted">{value.docNro} · {condicionLabel(value.condicionIva)}</div></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ clientId: null, nombre: "" })}>Cambiar</button>
            </div>
          ) : (
            <>
              <input className="form-input" autoFocus placeholder="Buscar cliente por nombre o documento..." value={q} onChange={(e) => setQ(e.target.value)} />
              {results.map((c) => (
                <button type="button" key={c.id} className="pick-option" onClick={() => { set({ clientId: c.id, nombre: c.nombre, docNro: c.doc_nro, condicionIva: c.condicion_iva }); setQ(""); }}>
                  <strong>{c.nombre}</strong> <span className="text-muted fs-13">{c.doc_nro} · {condicionLabel(c.condicion_iva)}</span>
                </button>
              ))}
              {dq && results.length === 0 && <p className="fs-13 text-muted">Sin resultados. Podés cargarlo en Clientes o usar "Con datos".</p>}
            </>
          )}
        </div>
      )}

      {fiscal && <div className="fs-13 text-muted mt-8">Se emitirá <strong>Factura {letraReceptor(value, fiscal)}</strong></div>}
    </div>
  );
}
