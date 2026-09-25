import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { RecoveryCodeBox } from "../components/RecoveryCode";

export default function Login() {
  const { login, config } = useAuth();
  const [mode, setMode] = useState("login");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(usuario.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      {mode === "login" ? (
        <form className="login-card" onSubmit={submit}>
          <h1 className="login-logo">Stock<span>Local</span></h1>
          {config?.negocio && <p className="login-negocio">{config.negocio}</p>}
          <label className="form-group">
            <span className="form-label">Usuario</span>
            <input className="form-input" autoFocus autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">Contraseña</span>
            <input className="form-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy || !usuario || !password}>{busy ? "Ingresando..." : "Ingresar"}</button>
          <p className="login-help"><button type="button" className="link-btn" onClick={() => setMode("recuperar")}>¿Olvidaste tu contraseña?</button></p>
        </form>
      ) : (
        <Recover initialUser={usuario} onBack={() => setMode("login")} />
      )}
    </div>
  );
}

function Recover({ initialUser, onBack }) {
  const { updateSession, reloadNegocio } = useAuth();
  const [f, setF] = useState({ usuario: initialUser, codigo: "", nueva: "", repetir: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (f.nueva.length < 6) return setError("La contraseña nueva debe tener al menos 6 caracteres");
    if (f.nueva !== f.repetir) return setError("Las contraseñas no coinciden");
    setBusy(true);
    try {
      setResult(await api.post("/auth/recuperar", { usuario: f.usuario.trim(), codigo: f.codigo, nueva: f.nueva }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  // Antes de entrar se muestra el código nuevo: el que se usó ya no sirve.
  if (result) {
    return (
      <div className="login-card wide">
        <h2 className="card-title">✅ Contraseña cambiada</h2>
        <p className="fs-13 mb-12">El código que usaste ya no sirve. Este es tu <strong>nuevo código de recuperación</strong>: anotalo o imprimilo y guardalo en un lugar seguro.</p>
        <RecoveryCodeBox code={result.nuevoCodigo} />
        <button className="btn btn-primary btn-block btn-lg mt-12" onClick={async () => { updateSession(result); await reloadNegocio(); }}>Ya lo guardé, entrar</button>
      </div>
    );
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <h2 className="card-title">Recuperar contraseña</h2>
      <p className="fs-13 text-muted mb-12">
        <strong>Si sos el dueño o administrador:</strong> usá el código de recuperación que se entregó en la instalación.<br />
        <strong>Si sos vendedor:</strong> pedile al administrador que te cambie la contraseña desde Usuarios.
      </p>
      <label className="form-group">
        <span className="form-label">Usuario</span>
        <input className="form-input" autoFocus={!initialUser} value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} />
      </label>
      <label className="form-group">
        <span className="form-label">Código de recuperación</span>
        <input className="form-input mono" autoFocus={!!initialUser} placeholder="XXXX-XXXX-XXXX-XXXX" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value.toUpperCase() })} autoComplete="off" />
      </label>
      <label className="form-group">
        <span className="form-label">Contraseña nueva</span>
        <input className="form-input" type="password" autoComplete="new-password" value={f.nueva} onChange={(e) => setF({ ...f, nueva: e.target.value })} />
      </label>
      <label className="form-group">
        <span className="form-label">Repetir contraseña nueva</span>
        <input className="form-input" type="password" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} />
      </label>
      {error && <div className="login-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy || !f.usuario || !f.codigo || !f.nueva}>{busy ? "Verificando..." : "Cambiar contraseña"}</button>
      <p className="login-help">
        Sin el código, el técnico puede restablecerla. · <button type="button" className="link-btn" onClick={onBack}>Volver</button>
      </p>
    </form>
  );
}
