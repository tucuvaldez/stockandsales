const test = require("node:test");
const assert = require("node:assert/strict");
const { getDb } = require("../src/db");
const sales = require("../src/services/sales");
const { freshDb, addProduct, stockOf } = require("./helpers");

test("la venta usa precios de la base y descuenta stock", async () => {
  const ctx = await freshDb();
  const p = addProduct({ precio: 1000, stock: 5 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 2, descuentoPct: 10 }], descuento: { tipo: "pct", valor: 5 }, totalFinal: 1 }, ctx);
  assert.equal(sale.subtotal, 1800);
  assert.equal(sale.descuento_monto, 90);
  assert.equal(sale.total, 1710);
  assert.equal(stockOf(p), 3);
  const mov = getDb().prepare("SELECT * FROM movements WHERE product_id = ? AND tipo = 'venta'").get(p);
  assert.deepEqual([mov.cantidad, mov.stock_antes, mov.stock_despues], [-2, 5, 3]);
});

test("si falta stock no se guarda nada (transacción)", async () => {
  const ctx = await freshDb();
  const a = addProduct({ codigo: "A", stock: 5 });
  const b = addProduct({ codigo: "B", stock: 1 });
  assert.throws(() => sales.createSale({ items: [{ productId: a, cantidad: 2 }, { productId: b, cantidad: 3 }] }, ctx), /Stock insuficiente/);
  assert.equal(stockOf(a), 5);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM sales").get().n, 0);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM movements").get().n, 0);
});

test("el mismo producto cargado dos veces se unifica", async () => {
  const ctx = await freshDb();
  const p = addProduct({ stock: 3 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 2 }, { productId: p, cantidad: 1 }] }, ctx);
  assert.equal(sale.items.length, 1);
  assert.equal(sale.items[0].cantidad, 3);
  assert.equal(stockOf(p), 0);
});

test("validaciones de entrada", async () => {
  const ctx = await freshDb();
  const p = addProduct();
  assert.throws(() => sales.createSale({ items: [] }, ctx), /al menos un producto/);
  assert.throws(() => sales.createSale({ items: [{ productId: p, cantidad: -1 }] }, ctx), /Cantidad/);
  assert.throws(() => sales.createSale({ items: [{ productId: p, cantidad: 1.5 }] }, ctx), /entero/);
  assert.throws(() => sales.createSale({ items: [{ productId: p, cantidad: 1, descuentoPct: 150 }] }, ctx), /Descuento/);
  assert.throws(() => sales.createSale({ items: [{ productId: p, cantidad: 1 }], metodoPago: "bitcoin" }, ctx), /Método de pago/);
});

test("devolución parcial prorratea el descuento general y no permite devolver de más", async () => {
  const ctx = await freshDb();
  const p = addProduct({ precio: 100, stock: 10 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 4 }], descuento: { tipo: "monto", valor: 40 } }, ctx);
  assert.equal(sale.total, 360);

  const r = sales.returnItems(sale.id, { items: [{ saleItemId: sale.items[0].id, cantidad: 1 }] }, ctx);
  assert.equal(r.total, 90);
  assert.equal(stockOf(p), 7);
  assert.throws(() => sales.returnItems(sale.id, { items: [{ saleItemId: sale.items[0].id, cantidad: 4 }] }, ctx), /solo quedan 3/);

  const after = sales.getSale(sale.id);
  assert.equal(after.total_devuelto, 90);
  assert.equal(after.items[0].cantidad_devuelta, 1);
});

test("anular conserva la venta, repone solo lo no devuelto y no se puede anular dos veces", async () => {
  const ctx = await freshDb();
  const p = addProduct({ stock: 10 });
  const sale = sales.createSale({ items: [{ productId: p, cantidad: 4 }] }, ctx);
  sales.returnItems(sale.id, { items: [{ saleItemId: sale.items[0].id, cantidad: 1 }] }, ctx);
  assert.throws(() => sales.annulSale(sale.id, {}, ctx), /Motivo/);
  sales.annulSale(sale.id, { motivo: "Error" }, ctx);
  assert.equal(stockOf(p), 10);
  assert.equal(sales.getSale(sale.id).estado, "anulada");
  assert.throws(() => sales.annulSale(sale.id, { motivo: "x" }, ctx), /ya estaba anulada/);
  assert.throws(() => sales.returnItems(sale.id, { items: [{ saleItemId: sale.items[0].id, cantidad: 1 }] }, ctx), /anulada/);
});

test("el stock nunca queda negativo", async () => {
  await freshDb();
  const p = addProduct({ stock: 1 });
  assert.throws(() => getDb().prepare("UPDATE products SET stock = -1 WHERE id = ?").run(p), /CHECK/);
});
