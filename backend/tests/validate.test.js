const test = require("node:test");
const assert = require("node:assert/strict");
const { num, isValidCuit, likeTerm, parseLocaleNumber } = require("../src/validate");
const { round2 } = require("../src/money");
const { toCsv } = require("../src/csv");

test("números en formato argentino", () => {
  assert.equal(parseLocaleNumber("1.234,56"), 1234.56);
  assert.equal(parseLocaleNumber("1234,5"), 1234.5);
  assert.equal(parseLocaleNumber("$ 1500"), 1500);
  assert.equal(num("", { fallback: 7 }), 7);
  assert.throws(() => num("abc", { name: "Precio" }), /Precio debe ser un número/);
});

test("redondeo a centavos", () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(0.1 + 0.2), 0.3);
});

test("CUIT con dígito verificador", () => {
  assert.equal(isValidCuit("20-12345678-6"), true);
  assert.equal(isValidCuit("30-71234567-2"), false);
  assert.equal(isValidCuit("123"), false);
});

test("búsquedas literales (sin comodines)", () => {
  assert.equal(likeTerm("50%_off"), "%50\\%\\_off%");
});

test("CSV para Excel en español y sin inyección de fórmulas", () => {
  const csv = toCsv([{ a: 1.5, b: "=HYPERLINK()", c: 'x;"y"' }], [{ label: "A", value: "a" }, { label: "B", value: "b" }, { label: "C", value: "c" }]);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes("1,5;'=HYPERLINK();\"x;\"\"y\"\"\""));
});
