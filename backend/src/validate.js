const { badRequest } = require("./errors");

// Texto: recorta espacios, aplica largo máximo y obligatoriedad.
function str(value, { name = "campo", max = 200, required = false, fallback = "" } = {}) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string" && typeof value !== "number") throw badRequest(`${name} inválido`);
  const s = String(value).trim();
  if (required && !s) throw badRequest(`${name} es obligatorio`);
  if (s.length > max) throw badRequest(`${name} supera los ${max} caracteres`);
  return s || fallback;
}

// Número: acepta "1.234,56" (formato argentino) además de 1234.56.
function num(value, { name = "valor", min = -Infinity, max = Infinity, int = false, required = false, fallback = 0 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw badRequest(`${name} es obligatorio`);
    return fallback;
  }
  const n = typeof value === "number" ? value : parseLocaleNumber(value);
  if (!Number.isFinite(n)) throw badRequest(`${name} debe ser un número`);
  if (int && !Number.isInteger(n)) throw badRequest(`${name} debe ser un número entero`);
  if (n < min) throw badRequest(`${name} debe ser mayor o igual a ${min}`);
  if (n > max) throw badRequest(`${name} debe ser menor o igual a ${max}`);
  return n;
}

function parseLocaleNumber(value) {
  let s = String(value).trim().replace(/\s|\$/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return s === "" ? NaN : Number(s);
}

function oneOf(value, allowed, { name = "valor", fallback } = {}) {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  if (!allowed.includes(value)) throw badRequest(`${name} inválido`);
  return value;
}

function id(value, name = "id") {
  return num(value, { name, int: true, min: 1, required: true });
}

// Fecha YYYY-MM-DD (del input date del navegador) -> límites ISO en hora local.
function dateRange(desde, hasta) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const out = {};
  if (desde) {
    if (!re.test(desde)) throw badRequest("Fecha 'desde' inválida");
    out.desde = new Date(`${desde}T00:00:00`).toISOString();
  }
  if (hasta) {
    if (!re.test(hasta)) throw badRequest("Fecha 'hasta' inválida");
    out.hasta = new Date(`${hasta}T23:59:59.999`).toISOString();
  }
  return out;
}

function pagination(query, { defaultLimit = 50, maxLimit = 500 } = {}) {
  const limit = num(query.limit, { name: "limit", int: true, min: 1, max: maxLimit, fallback: defaultLimit });
  const page = num(query.page, { name: "page", int: true, min: 1, fallback: 1 });
  return { limit, page, offset: (page - 1) * limit };
}

// Escapa comodines de LIKE para que la búsqueda sea literal.
const likeTerm = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Valida CUIT/CUIL con dígito verificador.
function isValidCuit(value) {
  const s = String(value || "").replace(/\D/g, "");
  if (s.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(s[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === Number(s[10]);
}

module.exports = { str, num, oneOf, id, dateRange, pagination, likeTerm, isValidCuit, parseLocaleNumber };
