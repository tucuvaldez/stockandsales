const fs = require("fs");
const os = require("os");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const paths = require("../paths");
const settings = require("../settings");
const { round2 } = require("../money");
const C = require("./afip/constants");

const MONEY = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Las fuentes estándar de PDF no tienen el espacio fino que usa Intl: se reemplaza por uno común.
const money = (n) => MONEY.format(Number(n) || 0).replace(/\u00a0|\u202f/g, " ");
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const ymd = (s) => (s && s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : s || "-");
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const PAY = { efectivo: "Efectivo", debito: "Débito", credito: "Crédito", transferencia: "Transferencia", qr: "QR / Billetera", otro: "Otro" };
const TIPO = { venta: "Venta", devolucion: "Devolución", anulacion: "Anulación", ingreso: "Ingreso", egreso: "Egreso" };

// Carpeta por defecto: Documentos del usuario de Windows (o del sistema), subcarpeta StockLocal.
function defaultDocsDir() {
  for (const name of ["Documents", "Documentos"]) {
    const dir = path.join(os.homedir(), name);
    if (fs.existsSync(dir)) return path.join(dir, "StockLocal");
  }
  return path.join(paths.DATA_DIR, "documentos");
}

const docsDir = () => settings.get("carpeta_documentos") || defaultDocsDir();

function validateDocsDir(dir) {
  if (!path.isAbsolute(dir)) throw new Error("Indicá una ruta completa, por ejemplo C:\\Users\\Tienda\\Documents\\StockLocal");
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, ".prueba-escritura");
  fs.writeFileSync(probe, "ok");
  fs.rmSync(probe);
  return path.resolve(dir);
}

function writePdf(file, draw) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Producer: "StockLocal", Creator: "StockLocal" } });
    const tmp = `${file}.tmp`;
    const out = fs.createWriteStream(tmp);
    out.on("finish", () => {
      fs.renameSync(tmp, file);
      resolve(file);
    });
    out.on("error", reject);
    doc.pipe(out);
    Promise.resolve(draw(doc)).then(() => doc.end(), (err) => { doc.end(); reject(err); });
  });
}

// ------------------------- Cierre de caja -------------------------

function cashClosePath(s) {
  const day = localDay(new Date(s.cerrada_at || s.abierta_at));
  return path.join(docsDir(), "Cierres de caja", day.slice(0, 7), `Cierre-caja-${String(s.id).padStart(4, "0")}_${day}.pdf`);
}

function row(doc, left, right, { bold = false, size = 10 } = {}) {
  const y = doc.y;
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
  doc.text(left, 40, y, { width: 360 });
  const h = doc.y;
  doc.text(right, 400, y, { width: 155, align: "right" });
  doc.y = Math.max(h, doc.y) + 2;
}

const rule = (doc) => {
  doc.moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).lineWidth(0.5).strokeColor("#999").stroke().strokeColor("#000");
  doc.y += 8;
};
const heading = (doc, t) => { doc.moveDown(0.6); doc.font("Helvetica-Bold").fontSize(11).text(t, 40); doc.moveDown(0.2); rule(doc); };

async function saveCashClosePdf(summary) {
  const s = summary;
  const negocio = settings.get("negocio_nombre", "StockLocal");
  const file = cashClosePath(s);
  await writePdf(file, (doc) => {
    doc.font("Helvetica-Bold").fontSize(18).text(negocio, 40);
    doc.font("Helvetica").fontSize(12).text(`Cierre de caja N° ${s.id}`);
    doc.moveDown(0.5);
    row(doc, "Apertura", `${dateTime(s.abierta_at)} - ${s.abierta_por}`);
    row(doc, "Cierre", `${dateTime(s.cerrada_at)} - ${s.cerrada_por || "-"}`);

    heading(doc, "Ventas");
    row(doc, `Ventas (${s.cantidadVentas})`, money(s.porTipo.venta || 0));
    if (s.porTipo.devolucion) row(doc, "Devoluciones", money(s.porTipo.devolucion));
    if (s.porTipo.anulacion) row(doc, "Anulaciones", money(s.porTipo.anulacion));
    row(doc, "Vendido neto", money(s.totalNeto), { bold: true });

    heading(doc, "Otros movimientos de dinero");
    if (!s.porTipo.ingreso && !s.porTipo.egreso) row(doc, "Sin ingresos ni egresos", money(0));
    if (s.porTipo.ingreso) row(doc, "Ingresos (cambio, aportes, cobros)", money(s.porTipo.ingreso));
    if (s.porTipo.egreso) row(doc, "Egresos (pagos, gastos, retiros)", money(s.porTipo.egreso));

    heading(doc, "Resultado de caja");
    row(doc, "Vendido neto", money(s.totalNeto));
    row(doc, "Otros movimientos", money(s.otrosNeto));
    row(doc, "Entró a la caja en el turno", money(s.resultadoCaja), { bold: true });
    doc.font("Helvetica").fontSize(8).fillColor("#555").text("Discriminado por medio de pago:", 40).fillColor("#000");
    doc.moveDown(0.2);
    for (const [k, v] of Object.entries(s.porMedio)) row(doc, `   ${PAY[k] || k}`, money(v));

    heading(doc, "Arqueo de efectivo");
    row(doc, "Efectivo inicial", money(s.monto_inicial));
    row(doc, "Efectivo esperado", money(s.efectivo_esperado));
    row(doc, "Efectivo contado", money(s.efectivo_contado));
    const d = s.diferencia || 0;
    row(doc, Math.abs(d) < 0.01 ? "Diferencia (caja justa)" : d > 0 ? "Diferencia (sobrante)" : "Diferencia (faltante)", money(d), { bold: true, size: 12 });
    if (s.nota_cierre) { doc.moveDown(0.3); doc.font("Helvetica-Oblique").fontSize(10).text(`Observaciones: ${s.nota_cierre}`, 40); }

    heading(doc, "Detalle de movimientos");
    doc.fontSize(8.5);
    for (const e of s.entries) {
      if (doc.y > 770) doc.addPage();
      const y = doc.y;
      doc.font("Helvetica").text(dateTime(e.fecha), 40, y, { width: 90 });
      doc.text(TIPO[e.tipo] || e.tipo, 132, y, { width: 60 });
      doc.text(`${e.motivo}${e.usuario_nombre ? ` (${e.usuario_nombre})` : ""}`, 194, y, { width: 210 });
      doc.text(PAY[e.metodo_pago] || e.metodo_pago, 406, y, { width: 70 });
      doc.text(money(e.monto), 478, y, { width: 77, align: "right" });
      doc.y = Math.max(doc.y, y + 11);
    }
    if (!s.entries.length) doc.font("Helvetica").text("Sin movimientos", 40);

    doc.moveDown(3);
    doc.font("Helvetica").fontSize(10).text("Firma: ______________________________", 40);
    doc.fontSize(7).fillColor("#777").text(`Generado por StockLocal el ${dateTime(new Date().toISOString())}`, 40, 800, { width: 515, align: "right" }).fillColor("#000");
  });
  return file;
}

// ------------------------- Comprobantes ARCA -------------------------

function invoicePath(inv) {
  const t = C.CBTE_TIPOS[inv.tipo_cbte];
  const day = `${inv.fecha.slice(0, 4)}-${inv.fecha.slice(4, 6)}-${inv.fecha.slice(6, 8)}`;
  const nombre = t.nombre.replace(/ /g, "-").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nro = `${String(inv.pto_vta).padStart(5, "0")}-${String(inv.numero).padStart(8, "0")}`;
  const prueba = inv.entorno === "homologacion" ? "_PRUEBA" : "";
  return path.join(docsDir(), inv.entorno === "homologacion" ? "Facturas (pruebas)" : "Facturas", day.slice(0, 7), `${nombre}_${nro}_${day}${prueba}.pdf`);
}

// URL del código QR obligatorio (RG 4892).
function qrUrl(inv) {
  const data = {
    ver: 1, fecha: `${inv.fecha.slice(0, 4)}-${inv.fecha.slice(4, 6)}-${inv.fecha.slice(6, 8)}`, cuit: Number(inv.cuit_emisor), ptoVta: inv.pto_vta,
    tipoCmp: inv.tipo_cbte, nroCmp: inv.numero, importe: inv.imp_total, moneda: "PES", ctz: 1, tipoDocRec: inv.doc_tipo,
    nroDocRec: Number(inv.doc_nro) || 0, tipoCodAut: "E", codAut: Number(inv.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(data)).toString("base64")}`;
}

async function saveInvoicePdf(inv, fiscal) {
  if (inv.estado !== "autorizada") throw new Error("Solo se guardan comprobantes autorizados");
  const t = C.CBTE_TIPOS[inv.tipo_cbte];
  const letra = t.letra;
  const discrimina = letra === "A";
  const neto = (gross, alic) => round2(gross / (1 + alic / 100));
  const qr = await QRCode.toBuffer(qrUrl(inv), { margin: 0, width: 240 });
  const file = invoicePath(inv);

  await writePdf(file, (doc) => {
    const L = 40, R = 555, W = R - L;
    if (inv.entorno === "homologacion") {
      doc.save().rotate(-30, { origin: [300, 420] }).font("Helvetica-Bold").fontSize(40).fillColor("#e8b4b4")
        .text("PRUEBA - SIN VALIDEZ FISCAL", 40, 400, { width: 520, align: "center" }).restore().fillColor("#000");
    }
    // Encabezado
    doc.rect(L, 40, W, 16).stroke();
    doc.font("Helvetica-Bold").fontSize(9).text("ORIGINAL", L, 44, { width: W, align: "center", characterSpacing: 2 });
    const top = 56, h = 118, mid = L + W / 2;
    doc.rect(L, top, W, h).stroke();
    doc.rect(mid - 25, top, 50, 46).fillAndStroke("#fff", "#000");
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(28).text(letra, mid - 25, top + 4, { width: 50, align: "center" });
    doc.fontSize(6.5).text(`COD. ${String(inv.tipo_cbte).padStart(2, "0")}`, mid - 25, top + 34, { width: 50, align: "center" });
    doc.moveTo(mid, top + 46).lineTo(mid, top + h).stroke();

    doc.font("Helvetica-Bold").fontSize(14).text(fiscal.razonSocial || "", L + 10, top + 10, { width: W / 2 - 45 });
    doc.font("Helvetica").fontSize(8.5).moveDown(0.4);
    if (fiscal.domicilio) doc.text(`Domicilio: ${fiscal.domicilio}`, { width: W / 2 - 20 });
    doc.text(`Condición frente al IVA: ${C.CONDICIONES_EMISOR[fiscal.condicion] || ""}`, { width: W / 2 - 20 });

    const dx = mid + 32;
    doc.font("Helvetica-Bold").fontSize(14).text(t.nombre.replace(/ [ABC]$/, "").toUpperCase(), dx, top + 10, { width: W / 2 - 40 });
    doc.font("Helvetica").fontSize(8.5).moveDown(0.3);
    doc.text(`Punto de venta: ${String(inv.pto_vta).padStart(5, "0")}   Comp. Nro: ${String(inv.numero).padStart(8, "0")}`, dx);
    doc.text(`Fecha de emisión: ${ymd(inv.fecha)}`, dx);
    doc.text(`CUIT: ${inv.cuit_emisor}`, dx);
    if (fiscal.iibb) doc.text(`Ingresos Brutos: ${fiscal.iibb}`, dx);
    if (fiscal.inicioActividades) doc.text(`Inicio de actividades: ${fiscal.inicioActividades.split("-").reverse().join("/")}`, dx);

    // Receptor
    const ry = top + h;
    doc.rect(L, ry, W, 58).stroke();
    doc.fontSize(8.5).text(`${C.DOC_TIPOS[inv.doc_tipo]?.split(" ")[0] || "Doc"}: ${inv.doc_tipo === 99 ? "-" : inv.doc_nro}`, L + 10, ry + 8);
    doc.text(`Condición frente al IVA: ${C.CONDICIONES_IVA[inv.condicion_iva_receptor] || ""}`, L + 10, ry + 21);
    doc.text("Condición de venta: Contado", L + 10, ry + 34);
    doc.text(`Apellido y nombre / Razón social: ${inv.receptor_nombre}`, mid, ry + 8, { width: W / 2 - 10 });
    if (inv.receptor_domicilio) doc.text(`Domicilio: ${inv.receptor_domicilio}`, mid, ry + 21, { width: W / 2 - 10 });
    if (inv.asociado) {
      doc.text(`Comprobante asociado: ${C.CBTE_TIPOS[inv.asociado.tipo_cbte].nombre} ${String(inv.asociado.pto_vta).padStart(5, "0")}-${String(inv.asociado.numero).padStart(8, "0")} (${ymd(inv.asociado.fecha)})`, mid, ry + 34, { width: W / 2 - 10 });
    }

    // Items
    let y = ry + 68;
    const cols = discrimina
      ? [["Código", L + 4, 70], ["Producto", L + 76, 200], ["Cant.", L + 278, 40, "right"], ["Precio unit.", L + 320, 70, "right"], ["IVA", L + 392, 40, "right"], ["Subtotal", L + 434, 77, "right"]]
      : [["Código", L + 4, 80], ["Producto", L + 86, 250], ["Cant.", L + 338, 40, "right"], ["Precio unit.", L + 380, 60, "right"], ["Subtotal", L + 442, 69, "right"]];
    doc.rect(L, y, W, 16).fillAndStroke("#e6e6e6", "#000").fillColor("#000");
    doc.font("Helvetica-Bold").fontSize(8);
    for (const [label, x, w, align] of cols) doc.text(label, x, y + 4, { width: w, align: align || "left" });
    y += 20;
    doc.font("Helvetica").fontSize(8.5);
    for (const it of inv.items) {
      if (y > 640) { doc.addPage(); y = 50; }
      const unit = discrimina ? neto(it.precioUnitario, it.alicuota) : it.precioUnitario;
      const sub = discrimina ? neto(it.precioUnitario * it.cantidad, it.alicuota) : round2(it.precioUnitario * it.cantidad);
      const vals = discrimina
        ? [it.codigo, it.nombre, String(it.cantidad), money(unit), `${it.alicuota}%`, money(sub)]
        : [it.codigo, it.nombre, String(it.cantidad), money(unit), money(sub)];
      let rowH = 12;
      cols.forEach(([, x, w, align], i) => {
        doc.text(vals[i], x, y, { width: w, align: align || "left" });
        rowH = Math.max(rowH, doc.y - y);
      });
      y += rowH + 3;
    }

    // Totales
    y = Math.max(y + 10, doc.y + 10);
    const tx = L + W * 0.45, tw = W * 0.55;
    const lines = [];
    if (discrimina) {
      lines.push(["Importe neto gravado", money(inv.imp_neto)]);
      for (const a of inv.iva) lines.push([`IVA ${a.alicuota}%`, money(a.importe)]);
    }
    const boxH = 14 * lines.length + 30 + (letra === "B" ? 14 : 0);
    doc.rect(tx, y, tw, boxH).stroke();
    let ty = y + 6;
    doc.font("Helvetica").fontSize(9);
    for (const [a, b] of lines) { doc.text(a, tx + 8, ty); doc.text(b, tx + 8, ty, { width: tw - 16, align: "right" }); ty += 14; }
    doc.font("Helvetica-Bold").fontSize(12).text("Importe total", tx + 8, ty + 2);
    doc.text(money(inv.imp_total), tx + 8, ty + 2, { width: tw - 16, align: "right" });
    if (letra === "B") doc.font("Helvetica").fontSize(7).text(`Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) - IVA contenido: ${money(inv.imp_iva)}`, tx + 8, ty + 20, { width: tw - 16 });

    // Pie con QR y CAE
    const fy = y + boxH + 20;
    doc.moveTo(L, fy).lineTo(R, fy).stroke();
    doc.image(qr, L, fy + 10, { width: 90 });
    doc.font("Helvetica-Bold").fontSize(11).text("Comprobante autorizado por ARCA", L + 105, fy + 20);
    doc.font("Helvetica").fontSize(9).text(`CAE N°: ${inv.cae}`, L + 105, fy + 38);
    doc.text(`Fecha de vto. de CAE: ${ymd(inv.cae_vto)}`, L + 105, fy + 52);
  });
  return file;
}

// Documentos generados recientemente, para listarlos en la pantalla.
function listRecent(limit = 60) {
  const root = docsDir();
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".pdf")) out.push({ nombre: e.name, carpeta: path.relative(root, dir), fecha: fs.statSync(p).mtime.toISOString() });
    }
  };
  walk(root);
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, limit);
}

module.exports = { docsDir, defaultDocsDir, validateDocsDir, saveCashClosePdf, saveInvoicePdf, cashClosePath, invoicePath, listRecent, qrUrl };
