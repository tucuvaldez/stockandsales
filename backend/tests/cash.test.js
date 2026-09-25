const test = require("node:test");
const assert = require("node:assert/strict");
const settings = require("../src/settings");
const sales = require("../src/services/sales");
const cash = require("../src/services/cash");
const { freshDb, addProduct } = require("./helpers");

test("sin caja abierta no se puede vender (si es obligatoria)", async () => {
  const ctx = await freshDb("local", { cajaAbierta: false });
  const p = addProduct({ precio: 100 });
  assert.throws(() => sales.createSale({ items: [{ productId: p, cantidad: 1 }] }, ctx), /caja está cerrada/);
  settings.set("caja_obligatoria", "0");
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 1 }] }, ctx);
  assert.equal(sale.cash_session_id, null);
});

test("pago dividido: cada medio entra a la caja y solo el efectivo suma al arqueo", async () => {
  const ctx = await freshDb();
  const p = addProduct({ precio: 1000, stock: 10 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 3 }], pagos: [{ metodoPago: "efectivo", monto: 1000 }, { metodoPago: "transferencia", monto: 2000 }] }, ctx);
  assert.equal(sale.metodo_pago, "mixto");
  assert.equal(sale.payments.length, 2);
  const s = cash.summary(cash.getOpenSession().id);
  assert.equal(s.porMedio.efectivo, 1000);
  assert.equal(s.porMedio.transferencia, 2000);
  assert.equal(s.efectivoEsperado, 2000); // 1000 inicial + 1000 cobrados
  assert.equal(s.cantidadVentas, 1);
  assert.throws(() => sales.createSale({ items: [{ productId: p, cantidad: 1 }], pagos: [{ metodoPago: "efectivo", monto: 10 }] }, ctx), /Los pagos suman/);
});

test("devolución y anulación descuentan de la caja por el medio correcto", async () => {
  const ctx = await freshDb();
  const p = addProduct({ precio: 100, stock: 10 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 4 }], pagos: [{ metodoPago: "efectivo", monto: 100 }, { metodoPago: "debito", monto: 300 }] }, ctx);
  sales.returnItems(sale.id, { items: [{ saleItemId: sale.items[0].id, cantidad: 1 }] }, ctx);
  let s = cash.summary(cash.getOpenSession().id);
  assert.equal(s.porMedio.efectivo, 0, "la devolución sale en efectivo por defecto");
  sales.annulSale(sale.id, { motivo: "x" }, ctx);
  s = cash.summary(cash.getOpenSession().id);
  assert.equal(s.totalNeto, 0);
  assert.equal(s.porMedio.efectivo + s.porMedio.debito, 0);
});

test("gastos en efectivo o transferencia y cierre con arqueo", async () => {
  const ctx = await freshDb();
  const p = addProduct({ precio: 500 });
  sales.createSale({ items: [{ productId: p, cantidad: 1 }] }, ctx);
  cash.manualMovement({ tipo: "egreso", monto: 300, motivo: "Pago proveedor", metodoPago: "efectivo" }, ctx);
  cash.manualMovement({ tipo: "egreso", monto: 5000, motivo: "Proveedor por transferencia", metodoPago: "transferencia" }, ctx);
  assert.throws(() => cash.manualMovement({ tipo: "egreso", monto: 99999, motivo: "x" }, ctx), /No hay tanto efectivo/);
  assert.throws(() => cash.manualMovement({ tipo: "egreso", monto: 10 }, ctx), /Motivo/);

  const closed = cash.closeSession({ efectivoContado: 1150 }, ctx);
  assert.equal(closed.efectivoEsperado, 1200); // 1000 + 500 - 300
  assert.equal(closed.diferencia, -50);
  assert.equal(closed.estado, "cerrada");
  assert.throws(() => cash.closeSession({ efectivoContado: 0 }, ctx), /No hay ninguna caja abierta/);
  cash.openSession({ montoInicial: 1150 }, ctx);
  assert.throws(() => cash.openSession({ montoInicial: 0 }, ctx), /Ya hay una caja abierta/);
});
