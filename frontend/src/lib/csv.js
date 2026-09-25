// Lector de CSV tolerante: detecta ; , o tabulación, respeta comillas y el BOM de Excel.
export function parseCsv(text) {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] || "";
  const delim = [";", "\t", ","].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Nombres de columna aceptados para cada campo del producto.
const COLUMN_ALIASES = {
  codigo: ["codigo", "cod", "sku", "codigobarras", "codbarras", "ean", "articulo"],
  nombre: ["nombre", "producto", "descripcioncorta", "detalle"],
  descripcion: ["descripcion", "desc", "observaciones"],
  categoria: ["categoria", "rubro", "familia"],
  talle: ["variante", "talle", "medida", "tamano", "presentacion", "color", "modelo"],
  precio: ["precio", "precioventa", "pventa", "venta", "preciofinal"],
  precioCompra: ["preciocompra", "costo", "preciocosto", "pcosto", "compra"],
  stock: ["stock", "cantidad", "existencia", "unidades"],
  stockMinimo: ["stockminimo", "minimo", "stockmin"],
  alicuotaIva: ["iva", "alicuota", "alicuotaiva"],
};

export function mapProductRows(rows) {
  if (rows.length < 2) throw new Error("La planilla está vacía o no tiene encabezados");
  const header = rows[0].map(normalize);
  const index = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) index[field] = i;
  }
  const missing = ["codigo", "nombre", "precio"].filter((f) => index[f] === undefined);
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}`);
  const products = rows.slice(1).map((r) => {
    const p = {};
    for (const [field, i] of Object.entries(index)) p[field] = (r[i] ?? "").trim();
    return p;
  });
  return { products, columns: Object.keys(index) };
}

export const PRODUCT_TEMPLATE =
  "\uFEFFcodigo;nombre;categoria;variante;precio;precioCompra;stock;stockMinimo;iva\r\n" +
  "779123456789;Yerba mate;Almacén;1 kg;4500;3000;20;5;21\r\n" +
  "JUG-001;Rompecabezas 500 piezas;Juguetería;;15000;9000;6;2;21\r\n" +
  "ART-002;Remera básica;Ropa;M;12000,50;7000;10;2;21\r\n";

// Genera un CSV compatible con Excel en español.
export function toCsv(rows, columns) {
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [columns.map((c) => cell(c.label)).join(";"), ...rows.map((r) => columns.map((c) => cell(typeof c.value === "function" ? c.value(r) : r[c.value])).join(";"))].join("\r\n");
}

export function saveText(text, filename, type = "text/csv;charset=utf-8") {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
