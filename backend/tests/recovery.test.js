const test = require("node:test");
const assert = require("node:assert/strict");
const { initDb, getDb } = require("../src/db");
const installer = require("../src/installer");
const recovery = require("../src/recovery");
const { checkPassword } = require("../src/auth");
const { freshDb } = require("./helpers");

test("la instalación entrega códigos de recuperación que funcionan una sola vez", async () => {
  initDb(":memory:");
  const { adminCode, techCode } = await installer.install({ mode: "local", techPin: "tecnico1", admin: { usuario: "dueno", password: "clave123" } });
  assert.match(adminCode, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  assert.notEqual(adminCode, techCode);

  // Se acepta en minúsculas y sin guiones (como lo tipea una persona).
  const r = await installer.resetWithRecoveryCode("dueno", adminCode.toLowerCase().replace(/-/g, ""), "nueva123");
  const user = getDb().prepare("SELECT * FROM users WHERE usuario = 'dueno'").get();
  assert.ok(await checkPassword("nueva123", user.password_hash));
  assert.equal(user.token_version, 1, "cierra las sesiones abiertas");
  await assert.rejects(installer.resetWithRecoveryCode("dueno", adminCode, "otra1234"), /no es correcto/);
  assert.ok(recovery.check("admin", r.newCode));

  // El técnico recupera su clave con su código y recibe uno nuevo.
  assert.throws(() => installer.changeTechPin("equivocada", "nuevopin"), /incorrect/);
  const newTech = installer.changeTechPin(techCode, "nuevopin");
  assert.ok(installer.checkTechPin("nuevopin"));
  assert.ok(!recovery.check("tecnico", techCode));
  assert.ok(recovery.check("tecnico", newTech));
});

test("el código del dueño no sirve para usuarios que no son administradores", async () => {
  await freshDb();
  const code = recovery.issue("admin");
  getDb().prepare("INSERT INTO users (nombre, usuario, password_hash, rol) VALUES ('V', 'vende', 'x', 'vendedor')").run();
  await assert.rejects(installer.resetWithRecoveryCode("vende", code, "clave123"), /administradores/);
});
