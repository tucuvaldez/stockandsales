import { useEffect, useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import NewSale from "./pages/NewSale";
import SalesHistory from "./pages/SalesHistory";

const NAV = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/productos", label: "Productos", icon: "📦" },
  { to: "/nueva-venta", label: "Nueva Venta", icon: "🛒" },
  { to: "/historial", label: "Historial", icon: "📋" },
];

export default function App() {
  const [modeInfo, setModeInfo] = useState({ mode: "local", isBilling: false });

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => setModeInfo({ mode: data.mode || "local", isBilling: !!data.isBilling }))
      .catch(() => setModeInfo({ mode: "local", isBilling: false }));
  }, []);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Stock<span>Local</span></h1>
          <p>{modeInfo.isBilling ? "Facturación activa" : "Control de inventario"}</p>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <div className="mode-banner">
          <span className="mode-pill">{modeInfo.isBilling ? "Modo: Facturación" : "Modo: Local"}</span>
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/productos" element={<Products />} />
          <Route path="/nueva-venta" element={<NewSale />} />
          <Route path="/historial" element={<SalesHistory />} />
        </Routes>
      </main>
    </div>
  );
}
