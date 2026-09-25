const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");
const { signToken } = require("../src/auth");
const { getDb } = require("../src/db");
const { freshDb } = require("./helpers");

async function withApi(fn) {
  const ctx = await freshDb();
  const user = getDb().prepare("SELECT * FROM users WHERE id = ?").get(ctx.user.id);
  const server = createApp({ logger: { error() {} } }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", Authorization: `Bearer ${signToken(user)}` }, body: body && JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  try { await fn(call); } finally { server.close(); }
}

test("categorías: crear, usar en productos, renombrar, unificar y eliminar", async () => {
  await withApi(async (call) => {
    assert.equal((await call("POST", "/categories", { nombre: "Juguetería" })).status, 201);
    assert.equal((await call("POST", "/categories", { nombre: "juguetería" })).status, 400, "no se duplica sin importar mayúsculas");

    await call("POST", "/products", { codigo: "J1", nombre: "Pelota", precio: 100, categoria: "juguetería" });
    await call("POST", "/products", { codigo: "J2", nombre: "Yoyo", precio: 50, categoria: "Juguetes" }); // se crea sola
    let cats = (await call("GET", "/categories")).data;
    assert.equal(cats.find((c) => c.nombre === "Juguetería").productos, 1, "usa el nombre ya existente");
    assert.ok(cats.some((c) => c.nombre === "Juguetes"));

    const juguetes = cats.find((c) => c.nombre === "Juguetes");
    const r = await call("PUT", `/categories/${juguetes.id}`, { nombre: "Juguetería" });
    assert.equal(r.data.unificada, true);
    assert.equal(r.data.categorias.find((c) => c.nombre === "Juguetería").productos, 2);

    const jug = r.data.categorias.find((c) => c.nombre === "Juguetería");
    const del = await call("DELETE", `/categories/${jug.id}`);
    assert.equal(del.data.movidos, 2);
    assert.equal((await call("GET", "/products?q=Pelota")).data[0].categoria, "General");
    const general = del.data.categorias.find((c) => c.nombre === "General");
    assert.equal((await call("DELETE", `/categories/${general.id}`)).status, 400);
  });
});

test("tipo de negocio: cambia el nombre del campo variante y sugiere categorías", async () => {
  await withApi(async (call) => {
    await call("PUT", "/settings/negocio", { nombre: "Kiosco", rubro: "almacen" });
    let n = (await call("GET", "/settings/negocio")).data;
    assert.equal(n.producto.varianteLabel, "Presentación");
    await call("PUT", "/settings/negocio", { nombre: "Kiosco", varianteLabel: "Sabor", usarVariante: false });
    n = (await call("GET", "/settings/negocio")).data;
    assert.equal(n.producto.varianteLabel, "Sabor");
    assert.equal(n.producto.usarVariante, false);
    const cats = (await call("POST", "/categories/sugeridas", { rubro: "almacen" })).data;
    assert.ok(cats.some((c) => c.nombre === "Bebidas"));
  });
});
