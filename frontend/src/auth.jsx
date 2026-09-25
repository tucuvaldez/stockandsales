import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [negocio, setNegocio] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const loadNegocio = useCallback(() => api.get("/settings/negocio").then(setNegocio).catch(() => {}), []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
    (async () => {
      try {
        setConfig(await api.get("/config"));
        if (getToken()) {
          const me = await api.get("/auth/me").catch(() => null);
          setUser(me);
          if (me) await loadNegocio();
        }
        setStatus("ready");
      } catch (e) {
        setError(e.message);
        setStatus("error");
      }
    })();
  }, [loadNegocio]);

  const login = async (usuario, password) => {
    const r = await api.post("/auth/login", { usuario, password });
    setToken(r.token);
    setUser(r.user);
    await loadNegocio();
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const updateSession = (r) => {
    setToken(r.token);
    setUser(r.user);
  };

  const can = (...roles) => !!user && roles.includes(user.rol);
  const isBilling = !!config?.isBilling;

  return (
    <AuthContext.Provider value={{ config, user, negocio, status, error, login, logout, updateSession, can, isBilling, reloadNegocio: loadNegocio }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
