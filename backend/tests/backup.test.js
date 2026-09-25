const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { selectToKeep } = require("../src/services/backup");

const name = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `stocklocal-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-120000-auto.db.gz`;
};

test("retención escalonada: un año de copias diarias queda en ~25 archivos", () => {
  const start = new Date(2026, 8, 25, 12);
  const backups = Array.from({ length: 365 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    return { name: name(d), fecha: d.toISOString() };
  });
  const keep = selectToKeep(backups);
  assert.ok(keep.size <= 25, `quedaron ${keep.size}`);
  assert.ok(keep.has(backups[0].name), "la más nueva siempre queda");
  for (let i = 0; i < 7; i++) assert.ok(keep.has(backups[i].name), "los últimos 7 días quedan");
  assert.ok([...keep].some((n) => n.includes("20251")), "hay copias de hace casi un año");
});

test("restaurar acepta copias comprimidas y rechaza archivos que no son una base", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-restore-"));
  process.env.STOCKLOCAL_DATA = dir;
  const { DatabaseSync } = require("node:sqlite");
  const zlib = require("zlib");
  const src = path.join(dir, "src.db");
  const db = new DatabaseSync(src);
  db.exec("CREATE TABLE t (x); INSERT INTO t VALUES (42);");
  db.close();
  const gz = path.join(dir, "stocklocal-20260925-120000-auto.db.gz");
  fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(src)));
  const { restoreFile } = require("../src/services/backup");
  const target = path.join(dir, "stocklocal.db");
  restoreFile(gz, target);
  const back = new DatabaseSync(target);
  assert.equal(back.prepare("SELECT x FROM t").get().x, 42);
  back.close();
  const bad = path.join(dir, "malo.db");
  fs.writeFileSync(bad, "no soy una base");
  assert.throws(() => restoreFile(bad, target), /no es una copia válida/);
});
