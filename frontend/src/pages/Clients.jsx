import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import { Confirm, Empty, Field, Loader, Modal, useDebounced } from "../components/ui";
import { CONDICIONES_IVA, DOC_TIPOS, condicionLabel, isValidCuit, plural } from "../lib/format";

const EMPTY = { nombre: "", docTipo: 96, docNro: "", condicionIva: 5, email: "", telefono: "", direccion: "" };
const docLabel = (t) => DOC_TIPOS.find((d) => d.value === t)?.label || "";

export default function Clients() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(() => api.get("/clients", { q: dq }).then(setList).catch((e) => toast.error(e.message)), [dq]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">Clientes</h2><p className="page-subtitle">Compradores frecuentes para facturar más rápido{list ? ` · ${plural(list.length, "cliente", "clientes")}` : ""}</p></div>
        <button className="btn btn-primary" onClick={() => setEdit(EMPTY)}>+ Nuevo cliente</button>
      </div>
      <div className="filters-bar">
        <input className="form-input" autoFocus placeholder="🔍 Nombre o documento..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!list ? <Loader /> : list.length === 0 ? <Empty icon="👥" title="No hay clientes cargados" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Documento</th><th>Condición IVA</th><th>Contacto</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.nombre}</strong>{c.direccion && <div className="fs-12 text-muted">{c.direccion}</div>}</td>
                  <td className="mono fs-13">{docLabel(c.doc_tipo)} {c.doc_nro !== "0" && c.doc_nro}</td>
                  <td className="fs-13">{condicionLabel(c.condicion_iva)}</td>
                  <td className="fs-13 text-muted">{[c.telefono, c.email].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="text-right nowrap">
                    <button className="btn btn-sm btn-ghost" onClick={() => setEdit(c)}>✏️</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setToDelete(c)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <ClientModal client={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {toDelete && (
        <Confirm
          title="Eliminar cliente"
          danger
          confirmLabel="Eliminar"
          message={<p>¿Eliminar a <strong>{toDelete.nombre}</strong>? Sus facturas anteriores se conservan.</p>}
          onConfirm={async () => { try { await api.del(`/clients/${toDelete.id}`); load(); } catch (e) { toast.error(e.message); throw e; } }}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

function ClientModal({ client, onClose, onSaved }) {
  const isNew = !client.id;
  const [f, setF] = useState(
    isNew ? client : { nombre: client.nombre, docTipo: client.doc_tipo, docNro: client.doc_nro === "0" ? "" : client.doc_nro, condicionIva: client.condicion_iva, email: client.email, telefono: client.telefono, direccion: client.direccion }
  );
  const [busy, setBusy] = useState(false);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  const cuitMal = [80, 86].includes(f.docTipo) && f.docNro.length === 11 && !isValidCuit(f.docNro);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isNew) await api.post("/clients", f);
      else await api.put(`/clients/${client.id}`, f);
      toast.success("Cliente guardado");
      onSaved();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? "Nuevo cliente" : "Editar cliente"} onClose={onClose} closeOnOverlay={false}>
      <form onSubmit={submit}>
        <Field label="Nombre o razón social" required><input className="form-input" autoFocus value={f.nombre} onChange={set("nombre")} maxLength={120} /></Field>
        <div className="form-row">
          <Field label="Tipo de documento">
            <select className="form-select" value={f.docTipo} onChange={set("docTipo", true)}>
              {DOC_TIPOS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
          {f.docTipo !== 99 && (
            <Field label="Número" hint={cuitMal ? "⚠️ El CUIT no es válido" : "Sin guiones ni puntos"}>
              <input className="form-input mono" inputMode="numeric" value={f.docNro} onChange={(e) => setF({ ...f, docNro: e.target.value.replace(/\D/g, "") })} maxLength={11} />
            </Field>
          )}
        </div>
        <Field label="Condición frente al IVA">
          <select className="form-select" value={f.condicionIva} onChange={set("condicionIva", true)}>
            {CONDICIONES_IVA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Domicilio"><input className="form-input" value={f.direccion} onChange={set("direccion")} maxLength={200} /></Field>
        <div className="form-row">
          <Field label="Teléfono"><input className="form-input" value={f.telefono} onChange={set("telefono")} maxLength={40} /></Field>
          <Field label="Email"><input className="form-input" type="email" value={f.email} onChange={set("email")} maxLength={120} /></Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}
