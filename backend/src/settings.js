const crypto = require("crypto");
const { getDb } = require("./db");

const MODES = ["local", "facturacion"];

function get(key, fallback = null) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function set(key, value) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, String(value ?? ""));
}

function getMany(keys) {
  const out = {};
  for (const k of keys) out[k] = get(k, "");
  return out;
}

// El modo lo fija el técnico en la instalación. No se lee del .env para que el usuario final no pueda cambiarlo.
function getMode() {
  const mode = get("app_mode");
  return MODES.includes(mode) ? mode : null;
}

const isBilling = () => getMode() === "facturacion";

function getJwtSecret() {
  let secret = get("jwt_secret");
  if (!secret) {
    secret = crypto.randomBytes(48).toString("hex");
    set("jwt_secret", secret);
  }
  return secret;
}

function featureFlags(mode = getMode()) {
  const billing = mode === "facturacion";
  return { inventory: true, sales: true, movements: true, reports: true, billing, clients: billing };
}

// Qué se imprime y qué solo se guarda en PDF. Pensado para que un comercio atendido por una sola persona no gaste papel.
const PRINT_DEFAULTS = {
  cierre_accion: "pdf", // pdf | pdf_imprimir
  ticket_venta: "preguntar", // no | preguntar | siempre
  factura_imprimir: "siempre", // siempre | preguntar
  factura_formato: "a4", // a4 | ticket
  impresion_directa: "0", // 1 = imprime sin mostrar el diálogo (Windows, navegador en modo aplicación)
};
function printConfig() {
  const out = {};
  for (const [k, v] of Object.entries(PRINT_DEFAULTS)) out[k] = get(k, v);
  return out;
}

module.exports = { PRINT_DEFAULTS, printConfig, MODES, get, set, getMany, getMode, isBilling, getJwtSecret, featureFlags };
