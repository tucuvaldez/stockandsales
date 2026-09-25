const test = require("node:test");
const assert = require("node:assert/strict");
const forge = require("node-forge");
const settings = require("../src/settings");
const sales = require("../src/services/sales");
const billing = require("../src/services/billing");
const afip = require("../src/services/afip");
const { letraPara } = require("../src/services/afip/constants");
const { freshDb, addProduct } = require("./helpers");

// ARCA simulado: guarda lo emitido y permite simular cortes de conexión.
function fakeArca() {
  const state = { emitted: new Map(), requests: 0, failNext: null };
  afip.withAuth = async (cfg, fn) => fn({ token: "t", sign: "s", cuit: cfg.cuit });
  afip.wsfe.lastAuthorized = async (ent, auth, pv, tipo) => Math.max(0, ...[...state.emitted.keys()].filter((k) => k.startsWith(`${tipo}-`)).map((k) => Number(k.split("-")[1])));
  afip.wsfe.consult = async (ent, auth, pv, tipo, nro) => state.emitted.get(`${tipo}-${nro}`) || null;
  afip.wsfe.requestCae = async (ent, auth, det) => {
    state.requests++;
    state.last = det;
    const fail = state.failNext;
    state.failNext = null;
    if (fail === "reject") return { aprobado: false, mensajes: "10015: Documento inválido", errores: [{ Code: 10015 }] };
    const record = { Resultado: "A", CodAutorizacion: `CAE${det.numero}`, FchVto: "20261005", ImpTotal: det.impTotal, DocNro: det.docNro, CbteFch: det.fecha };
    state.emitted.set(`${det.tipo}-${det.numero}`, record);
    if (fail === "lost-response") {
      const err = new Error("socket hang up");
      err.network = true;
      throw err;
    }
    return { aprobado: true, cae: record.CodAutorizacion, caeVto: "20261005", mensajes: "", errores: [] };
  };
  return state;
}

async function billingDb(condicion = "RI") {
  const ctx = await freshDb("facturacion");
  for (const [k, v] of Object.entries({ afip_cuit: "20123456786", afip_razon_social: "Test SA", afip_condicion: condicion, afip_pto_vta: 3, afip_entorno: "homologacion", afip_cert: "x", afip_key: "y" })) settings.set(k, v);
  return ctx;
}

const CF = { docTipo: 99, condicionIva: 5 };

test("importes: IVA discriminado cuadra al centavo con alícuotas mixtas y descuento", () => {
  const a = billing.computeAmounts([{ gross: 1210, alicuota: 21 }, { gross: 110.5, alicuota: 10.5 }, { gross: 33.33, alicuota: 21 }], "B", 1300);
  assert.equal(a.impTotal, 1300);
  assert.equal(Math.round((a.impNeto + a.impIva) * 100), 130000);
  assert.deepEqual(a.iva.map((x) => x.id).sort(), [4, 5]);
  const c = billing.computeAmounts([{ gross: 500, alicuota: 21 }], "C");
  assert.deepEqual([c.impNeto, c.impIva, c.iva.length], [500, 0, 0]);
});

test("letra del comprobante según condición de emisor y receptor", () => {
  assert.equal(letraPara("RI", 5), "B");
  assert.equal(letraPara("RI", 1), "A");
  assert.equal(letraPara("RI", 6), "A");
  assert.equal(letraPara("MONO", 1), "C");
  assert.equal(letraPara("EXENTO", 5), "C");
});

test("factura B aprobada: toma el próximo número y guarda el CAE", async () => {
  const ctx = await billingDb();
  const arca = fakeArca();
  const p = addProduct({ precio: 1210 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 1 }] }, ctx);
  const inv = await billing.invoiceSale(sale.id, CF, ctx);
  assert.equal(inv.estado, "autorizada");
  assert.equal(inv.tipo_cbte, 6);
  assert.equal(inv.numero, 1);
  assert.equal(inv.cae, "CAE1");
  assert.equal(arca.last.impNeto, 1000);
  assert.equal(arca.last.impIva, 210);
  await assert.rejects(billing.invoiceSale(sale.id, CF, ctx), /ya tiene una factura/);
});

test("corte de conexión: queda pendiente, bloquea anular y al reintentar recupera el CAE sin duplicar número", async () => {
  const ctx = await billingDb();
  const arca = fakeArca();
  const p = addProduct({ precio: 100 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 1 }] }, ctx);
  arca.failNext = "lost-response";
  const inv = await billing.invoiceSale(sale.id, CF, ctx);
  assert.equal(inv.estado, "pendiente");
  assert.equal(inv.numero_intentado, 1);
  assert.throws(() => sales.annulSale(sale.id, { motivo: "x" }, ctx), /pendiente/);

  const retried = await billing.retry(inv.id, ctx);
  assert.equal(retried.estado, "autorizada");
  assert.equal(retried.numero, 1);
  assert.equal(arca.requests, 1, "no debe pedir un CAE nuevo si ARCA ya lo había otorgado");
});

test("rechazo de ARCA: queda rechazada y se puede reintentar", async () => {
  const ctx = await billingDb();
  const arca = fakeArca();
  const p = addProduct({ precio: 100 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 1 }] }, ctx);
  arca.failNext = "reject";
  const inv = await billing.invoiceSale(sale.id, CF, ctx);
  assert.equal(inv.estado, "rechazada");
  assert.match(inv.mensajes, /10015/);
  const ok = await billing.retry(inv.id, ctx);
  assert.equal(ok.estado, "autorizada");
  assert.equal(ok.numero, 1);
});

test("devolución y anulación de una venta facturada emiten notas de crédito asociadas", async () => {
  const ctx = await billingDb();
  fakeArca();
  const p = addProduct({ precio: 100, stock: 10 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 3 }] }, ctx);
  const factura = await billing.invoiceSale(sale.id, CF, ctx);

  const r = sales.returnItems(sale.id, { items: [{ saleItemId: sale.items[0].id, cantidad: 1 }] }, ctx);
  const nc1 = await billing.creditNoteForSale(sale.id, { returnId: r.returnId }, ctx);
  assert.equal(nc1.tipo_cbte, 8);
  assert.equal(nc1.imp_total, 100);
  assert.equal(nc1.asociado_id, factura.id);

  sales.annulSale(sale.id, { motivo: "x" }, ctx);
  const nc2 = await billing.creditNoteForSale(sale.id, { annul: true }, ctx);
  assert.equal(nc2.imp_total, 200);
  assert.equal(nc2.numero, 2);
});

test("monotributo emite factura C y exige identificar al comprador sobre el límite", async () => {
  const ctx = await billingDb("MONO");
  fakeArca();
  settings.set("afip_limite_cf", 1000);
  const p = addProduct({ precio: 1500 });
  assert.throws(() => billing.precheckInvoice(CF, 1500), /exige identificar/);
  assert.throws(() => billing.precheckInvoice({ docTipo: 96, docNro: "12", condicionIva: 5, nombre: "Juan" }, 1500), /DNI/);
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 1 }] }, ctx);
  const inv = await billing.invoiceSale(sale.id, { docTipo: 96, docNro: "30111222", condicionIva: 5, nombre: "Juan" }, ctx);
  assert.equal(inv.tipo_cbte, 11);
  assert.equal(inv.imp_iva, 0);
});

test("factura A requiere CUIT válido", async () => {
  await billingDb("RI");
  assert.throws(() => billing.precheckInvoice({ docTipo: 96, docNro: "30111222", condicionIva: 1, nombre: "X" }, 100), /CUIT/);
  assert.throws(() => billing.precheckInvoice({ docTipo: 80, docNro: "20123456780", condicionIva: 1, nombre: "X" }, 100), /no es válido/);
  assert.equal(billing.precheckInvoice({ docTipo: 80, docNro: "20123456786", condicionIva: 1, nombre: "X" }, 100).letra, "A");
});

test("WSAA: firma CMS válida y lectura del certificado", () => {
  const { wsaa } = afip;
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: "commonName", value: "stocklocal" }, { type: "2.5.4.5", value: "CUIT 20123456786" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  const info = wsaa.inspectCertificate(certPem, keyPem);
  assert.equal(info.cuit, "20123456786");
  assert.equal(info.alias, "stocklocal");

  const other = forge.pki.privateKeyToPem(forge.pki.rsa.generateKeyPair(1024).privateKey);
  assert.throws(() => wsaa.inspectCertificate(certPem, other), /no corresponde/);

  const tra = wsaa.buildTra("wsfe");
  const cms = wsaa.signTra(tra, certPem, keyPem);
  const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms)));
  assert.match(msg.rawCapture.content.value[0].value, /<service>wsfe<\/service>/);
});
