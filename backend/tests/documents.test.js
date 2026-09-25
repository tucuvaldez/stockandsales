const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const cash = require("../src/services/cash");
const sales = require("../src/services/sales");
const documents = require("../src/services/documents");
const billing = require("../src/services/billing");
const { freshDb, addProduct, TMP_DOCS } = require("./helpers");

const isPdf = (file) => fs.readFileSync(file).subarray(0, 5).toString() === "%PDF-";

test("el cierre de caja se guarda como PDF en la carpeta configurada", async () => {
  const ctx = await freshDb();
  const p = addProduct({ precio: 1234.5 });
  sales.createSale({ items: [{ productId: p, cantidad: 2 }], pagos: [{ metodoPago: "efectivo", monto: 469 }, { metodoPago: "transferencia", monto: 2000 }] }, ctx);
  cash.manualMovement({ tipo: "egreso", monto: 100, motivo: "Pago a proveedor ñandú", metodoPago: "efectivo" }, ctx);
  const s = cash.closeSession({ efectivoContado: 1369, nota: "Todo ok" }, ctx);
  const file = await documents.saveCashClosePdf(s);
  assert.ok(file.startsWith(TMP_DOCS));
  assert.match(file, /Cierres de caja.+Cierre-caja-0001_\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.ok(isPdf(file));
});

test("la factura autorizada se guarda como PDF con QR", async () => {
  await freshDb("facturacion");
  const inv = {
    estado: "autorizada", tipo_cbte: 1, pto_vta: 3, numero: 42, fecha: "20260925", entorno: "produccion", cuit_emisor: "20123456786",
    doc_tipo: 80, doc_nro: "20123456786", condicion_iva_receptor: 1, receptor_nombre: "Cliente SA", receptor_domicilio: "Calle 1",
    imp_total: 1210, imp_neto: 1000, imp_iva: 210, iva: [{ id: 5, alicuota: 21, base: 1000, importe: 210 }],
    items: [{ codigo: "A1", nombre: "Producto con ñ y acentos", cantidad: 1, precioUnitario: 1210, alicuota: 21 }],
    cae: "76391234567890", cae_vto: "20261005", asociado: null,
  };
  const file = await documents.saveInvoicePdf(inv, { razonSocial: "Test SA", condicion: "RI", domicilio: "Av 1", iibb: "123", inicioActividades: "2020-01-01" });
  assert.match(file, /Facturas.+Factura-A_00003-00000042_2026-09-25\.pdf$/);
  assert.ok(isPdf(file));
  const qr = new URL(documents.qrUrl(inv));
  const data = JSON.parse(Buffer.from(qr.searchParams.get("p"), "base64").toString());
  assert.deepEqual([data.cuit, data.nroCmp, data.codAut, data.tipoCodAut], [20123456786, 42, 76391234567890, "E"]);
  assert.ok(billing);
});

test("la carpeta de documentos se valida", () => {
  assert.throws(() => documents.validateDocsDir("relativa/carpeta"), /ruta completa/);
});
