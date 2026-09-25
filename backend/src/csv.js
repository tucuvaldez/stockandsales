// CSV pensado para Excel en español: separador ";", coma decimal y BOM para que respete los acentos.
function toCsv(rows, columns) {
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = String(v);
    // Evita que Excel interprete el texto como fórmula.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = columns.map((c) => cell(c.label)).join(";");
  const body = rows.map((r) => columns.map((c) => cell(typeof c.value === "function" ? c.value(r) : r[c.value])).join(";"));
  return "﻿" + [header, ...body].join("\r\n");
}

function sendCsv(res, filename, rows, columns) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(rows, columns));
}

const localDateTime = (iso) => (iso ? new Date(iso).toLocaleString("es-AR") : "");

module.exports = { toCsv, sendCsv, localDateTime };
