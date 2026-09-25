import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Field, Loader, Modal } from "../components/ui";
import { ROLES, date } from "../lib/format";

export default function Users() {
  const { user: me } = useAuth();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => api.get("/users").then(setList).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header">
        <div><h2 className="page-title">Usuarios</h2><p className="page-subtitle">Cada persona con su usuario: así queda registrado quién hizo cada venta y cada cambio</p></div>
        <button className="btn btn-primary" onClick={() => setEdit({ nombre: "", usuario: "", password: "", rol: "vendedor", activo: true })}>+ Nuevo usuario</button>
      </div>

      <div className="roles-help">
        {Object.entries(ROLES).map(([k, r]) => <div key={k}><strong>{r.label}:</strong> {r.desc}</div>)}
      </div>

      {!list ? <Loader /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Alta</th><th /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={u.activo ? "" : "row-muted"}>
                  <td><strong>{u.nombre}</strong>{u.id === me.id && <span className="text-muted"> (vos)</span>}</td>
                  <td className="mono">{u.usuario}</td>
                  <td>{ROLES[u.rol]?.label}</td>
                  <td>{u.activo ? <Badge kind="success">Activo</Badge> : <Badge>Desactivado</Badge>}</td>
                  <td className="fs-13 text-muted">{date(u.created_at)}</td>
                  <td className="text-right"><button className="btn btn-sm btn-secondary" onClick={() => setEdit({ ...u, activo: !!u.activo, password: "" })}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <UserModal user={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function UserModal({ user, onClose, onSaved }) {
  const isNew = !user.id;
  const [f, setF] = useState(user);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isNew) await api.post("/users", f);
      else await api.put(`/users/${user.id}`, { nombre: f.nombre, rol: f.rol, activo: f.activo, password: f.password });
      toast.success("Usuario guardado");
      onSaved();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? "Nuevo usuario" : `Editar ${user.usuario}`} onClose={onClose} width={460} closeOnOverlay={false}>
      <form onSubmit={submit}>
        <Field label="Nombre" required><input className="form-input" autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={80} /></Field>
        {isNew && (
          <Field label="Usuario para ingresar" required hint="Letras, números, punto o guion. Ej: juan.perez">
            <input className="form-input mono" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value.toLowerCase() })} maxLength={40} />
          </Field>
        )}
        <Field label={isNew ? "Contraseña" : "Nueva contraseña"} required={isNew} hint={isNew ? "Mínimo 6 caracteres" : "Dejala vacía para no cambiarla"}>
          <input className="form-input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field label="Rol">
          <select className="form-select" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
            {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label} — {r.desc}</option>)}
          </select>
        </Field>
        {!isNew && <label className="check"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Usuario activo (puede ingresar)</label>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}
