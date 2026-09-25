import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Layout, { NAV } from "./components/Layout";
import { Loader } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewSale from "./pages/NewSale";
import Sales from "./pages/Sales";
import Products from "./pages/Products";
import Movements from "./pages/Movements";
import Invoices from "./pages/Invoices";
import Clients from "./pages/Clients";
import Users from "./pages/Users";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";
import PrintSale from "./pages/PrintSale";
import PrintInvoice from "./pages/PrintInvoice";
import PrintCash from "./pages/PrintCash";
import Cash from "./pages/Cash";

const PAGES = {
  "/": Dashboard, "/nueva-venta": NewSale, "/caja": Cash, "/ventas": Sales, "/productos": Products, "/movimientos": Movements,
  "/comprobantes": Invoices, "/clientes": Clients, "/usuarios": Users, "/actividad": Activity, "/configuracion": Settings,
};

export default function App() {
  const { status, error, user, isBilling } = useAuth();

  if (status === "loading") return <Loader text="Abriendo StockLocal..." />;
  if (status === "error") {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-logo">Stock<span>Local</span></h1>
          <div className="login-error">{error}</div>
          <button className="btn btn-primary btn-block" onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      </div>
    );
  }
  if (!user) return <Login />;

  const allowed = NAV.filter((n) => (!n.roles || n.roles.includes(user.rol)) && (!n.billing || isBilling));
  const home = allowed[0].to;

  return (
    <Routes>
      <Route path="/imprimir/venta/:id" element={<PrintSale />} />
      <Route path="/imprimir/comprobante/:id" element={<PrintInvoice />} />
      <Route path="/imprimir/caja/:id" element={<PrintCash />} />
      <Route element={<Layout />}>
        {allowed.map((n) => {
          const Page = PAGES[n.to];
          return <Route key={n.to} path={n.to} element={n.to === "/" && home !== "/" ? <Navigate to={home} replace /> : <Page />} />;
        })}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}
