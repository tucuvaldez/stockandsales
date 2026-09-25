// Tablas de ARCA (ex AFIP) para WSFEv1.

const CBTE_TIPOS = {
  1: { letra: "A", nombre: "Factura A", nc: false },
  3: { letra: "A", nombre: "Nota de Crédito A", nc: true },
  6: { letra: "B", nombre: "Factura B", nc: false },
  8: { letra: "B", nombre: "Nota de Crédito B", nc: true },
  11: { letra: "C", nombre: "Factura C", nc: false },
  13: { letra: "C", nombre: "Nota de Crédito C", nc: true },
};
const FACTURA_POR_LETRA = { A: 1, B: 6, C: 11 };
const NC_POR_LETRA = { A: 3, B: 8, C: 13 };

const DOC_TIPOS = { 80: "CUIT", 86: "CUIL", 96: "DNI", 99: "Consumidor Final (sin identificar)" };

// Condición frente al IVA del receptor (campo CondicionIVAReceptorId, obligatorio desde RG 5616).
const CONDICIONES_IVA = {
  1: "IVA Responsable Inscripto",
  4: "IVA Sujeto Exento",
  5: "Consumidor Final",
  6: "Responsable Monotributo",
  7: "Sujeto No Categorizado",
  8: "Proveedor del Exterior",
  9: "Cliente del Exterior",
  10: "IVA Liberado - Ley N° 19.640",
  13: "Monotributista Social",
  15: "IVA No Alcanzado",
  16: "Monotributo Trabajador Independiente Promovido",
};
const CONDICIONES_MONOTRIBUTO = [6, 13, 16];

// Condición del emisor (el comercio).
const CONDICIONES_EMISOR = {
  RI: "IVA Responsable Inscripto",
  MONO: "Responsable Monotributo",
  EXENTO: "IVA Sujeto Exento",
};

// Id de alícuota de IVA en ARCA.
const ALICUOTAS_IVA = { 0: 3, 2.5: 9, 5: 8, 10.5: 4, 21: 5, 27: 6 };

function letraPara(condicionEmisor, condicionReceptor) {
  if (condicionEmisor !== "RI") return "C";
  if (condicionReceptor === 1 || CONDICIONES_MONOTRIBUTO.includes(condicionReceptor)) return "A";
  return "B";
}

module.exports = {
  CBTE_TIPOS, FACTURA_POR_LETRA, NC_POR_LETRA, DOC_TIPOS, CONDICIONES_IVA,
  CONDICIONES_MONOTRIBUTO, CONDICIONES_EMISOR, ALICUOTAS_IVA, letraPara,
};
