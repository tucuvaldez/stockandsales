const moneyFmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => moneyFmt.format(Number(n) || 0);

export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const date = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "—");

// "20260925" (formato ARCA) -> "25/09/2026"
export const ymd = (s) => (s && s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : s || "—");

export const cbteNumero = (ptoVta, numero) =>
  `${String(ptoVta || 0).padStart(5, "0")}-${numero ? String(numero).padStart(8, "0") : "--------"}`;

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo", icon: "💵" },
  { value: "debito", label: "Débito", icon: "💳" },
  { value: "credito", label: "Crédito", icon: "💳" },
  { value: "transferencia", label: "Transferencia", icon: "🏦" },
  { value: "qr", label: "QR / Billetera", icon: "📱" },
  { value: "otro", label: "Otro", icon: "•" },
];
export const paymentLabel = (v) => PAYMENT_METHODS.find((p) => p.value === v)?.label || v;

export const MOVEMENT_TYPES = {
  alta: { label: "Alta", badge: "neutral" },
  ingreso: { label: "Ingreso", badge: "success" },
  egreso: { label: "Egreso", badge: "danger" },
  ajuste: { label: "Ajuste", badge: "warning" },
  venta: { label: "Venta", badge: "accent" },
  devolucion: { label: "Devolución", badge: "success" },
  anulacion: { label: "Anulación", badge: "warning" },
};

export const ROLES = {
  admin: { label: "Administrador", desc: "Todo, incluidos usuarios y configuración" },
  supervisor: { label: "Supervisor", desc: "Ventas, productos, stock, devoluciones y reportes" },
  vendedor: { label: "Vendedor", desc: "Registrar ventas y consultar productos" },
};

export const INVOICE_STATES = {
  autorizada: { label: "Autorizada", badge: "success" },
  pendiente: { label: "Pendiente", badge: "warning" },
  error: { label: "Error", badge: "danger" },
  rechazada: { label: "Rechazada", badge: "danger" },
  cancelada: { label: "Descartada", badge: "neutral" },
};

export const DOC_TIPOS = [
  { value: 99, label: "Sin identificar (Consumidor Final)" },
  { value: 96, label: "DNI" },
  { value: 80, label: "CUIT" },
  { value: 86, label: "CUIL" },
];

export const CONDICIONES_IVA = [
  { value: 5, label: "Consumidor Final" },
  { value: 1, label: "IVA Responsable Inscripto" },
  { value: 6, label: "Responsable Monotributo" },
  { value: 4, label: "IVA Sujeto Exento" },
  { value: 7, label: "Sujeto No Categorizado" },
  { value: 13, label: "Monotributista Social" },
  { value: 15, label: "IVA No Alcanzado" },
  { value: 16, label: "Monotributo Trabajador Independiente Promovido" },
  { value: 9, label: "Cliente del Exterior" },
  { value: 10, label: "IVA Liberado - Ley 19.640" },
];
export const condicionLabel = (v) => CONDICIONES_IVA.find((c) => c.value === Number(v))?.label || "—";

export const CBTE_NOMBRES = { 1: "Factura A", 3: "Nota de Crédito A", 6: "Factura B", 8: "Nota de Crédito B", 11: "Factura C", 13: "Nota de Crédito C" };
export const CBTE_LETRA = { 1: "A", 3: "A", 6: "B", 8: "B", 11: "C", 13: "C" };

// Misma regla que el backend: RI emite A a inscriptos/monotributistas y B al resto; los demás emiten C.
export const letraPara = (condicionEmisor, condicionReceptor) => {
  if (condicionEmisor !== "RI") return "C";
  return [1, 6, 13, 16].includes(Number(condicionReceptor)) ? "A" : "B";
};

export function isValidCuit(value) {
  const s = String(value || "").replace(/\D/g, "");
  if (s.length !== 11) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let check = 11 - (w.reduce((a, x, i) => a + x * Number(s[i]), 0) % 11);
  if (check === 11) check = 0;
  return check !== 10 && check === Number(s[10]);
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
