import { useState } from "react";
import { useAuth } from "../auth";

export default function Login() {
  const { login, config } = useAuth();
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
        <p className="login-help">¿Olvidaste la contraseña? Pedile al administrador que la cambie desde Usuarios.</p>
      </form>
    </div>
  );
}
