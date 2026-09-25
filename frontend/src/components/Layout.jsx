import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../auth";
import { api } from "../api";
import { Field, Modal } from "./ui";
import { ROLES } from "../lib/format";

// roles: quién ve cada opción. billing: solo en instalaciones con facturación.
export const NAV = [
  { to: "/", label: "Resumen", icon: "📊", roles: ["admin", "supervisor"], end: true },
  { to: "/nueva-venta", label: "Nueva venta", icon: "🛒" },
  { to: "/caja", label: "Caja", icon: "💵" },
  { to: "/ventas", label: "Ventas", icon: "🧾" },
  { to: "/productos", label: "Productos", icon: "📦" },
  { to: "/movimientos", label: "Movimientos de stock", icon: "🔁", roles: ["admin", "supervisor"] },
  { to: "/comprobantes", label: "Comprobantes ARCA", icon: "🏛️", billing: true },
  { to: "/clientes", label: "Clientes", icon: "👥", billing: true },
  { to: "/usuarios", label: "Usuarios", icon: "🔑", roles: ["admin"] },
  { to: "/actividad", label: "Registro de actividad", icon: "🕓", roles: ["admin"] },
  { to: "/configuracion", label: "Configuración", icon: "⚙️", roles: ["admin"] },
];

export const visibleNav = (user, isBilling) =>
  NAV.filter((n) => (!n.roles || n.roles.includes(user.rol)) && (!n.billing || isBilling));

export default function Layout() {
  const { user, logout, isBilling, negocio, config } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const fiscal = negocio?.fiscal;

  return (
    <div className="app-layout">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <h1>Stock<span>Local</span></h1>
          <p title={config?.negocio}>{config?.negocio || "Control de stock"}</p>
        </div>
        <nav className="sidebar-nav" onClick={() => setMenuOpen(false)}>
          {visibleNav(user, isBilling).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              <span className="nav-icon" aria-hidden>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{user.nombre}</strong>
            <span>{ROLES[user.rol]?.label}</span>
          </div>
          <button className="sidebar-link" onClick={() => setPwdOpen(true)}>Cambiar mi contraseña</button>
          <button className="sidebar-link" onClick={logout}>Cerrar sesión</button>
          <div className="sidebar-mode">{isBilling ? "Modo facturación" : "Modo local"} · v{config?.version}</div>
        </div>
      </aside>

      <main className="main-content">
        <button className="menu-toggle btn btn-secondary btn-sm" onClick={() => setMenuOpen((v) => !v)}>☰ Menú</button>
        {isBilling && fiscal?.entorno === "homologacion" && fiscal.faltantes?.length === 0 && (
          <div className="alert-banner alert-info">
            🧪 <strong>Facturación en modo PRUEBA (homologación).</strong> Los comprobantes no tienen validez fiscal.
          </div>
        )}
        {isBilling && fiscal?.faltantes?.length > 0 && user.rol === "admin" && (
          <div className="alert-banner alert-warning">
            ⚠️ Para facturar falta configurar: {fiscal.faltantes.join(", ")}.{" "}
            <NavLink to="/configuracion?tab=fiscal">Completar ahora</NavLink>
          </div>
        )}
        <Outlet />
      </main>

      {pwdOpen && <ChangePassword onClose={() => setPwdOpen(false)} />}
    </div>
  );
}

function ChangePassword({ onClose }) {
  const { updateSession } = useAuth();
  const [f, setF] = useState({ actual: "", nueva: "", repetir: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (f.nueva.length < 6) return toast.error("La contraseña nueva debe tener al menos 6 caracteres");
    if (f.nueva !== f.repetir) return toast.error("Las contraseñas nuevas no coinciden");
    setBusy(true);
    try {
      updateSession(await api.post("/auth/change-password", { actual: f.actual, nueva: f.nueva }));
      toast.success("Contraseña actualizada");
      onClose();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Cambiar mi contraseña" onClose={onClose} width={420}>
      <form onSubmit={submit}>
        <Field label="Contraseña actual" required><input className="form-input" type="password" autoFocus value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} /></Field>
        <Field label="Contraseña nueva" required hint="Mínimo 6 caracteres"><input className="form-input" type="password" value={f.nueva} onChange={(e) => setF({ ...f, nueva: e.target.value })} /></Field>
        <Field label="Repetir contraseña nueva" required><input className="form-input" type="password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} /></Field>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}
