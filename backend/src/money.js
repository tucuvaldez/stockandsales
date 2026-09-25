// Redondeo a centavos evitando errores de coma flotante (1.005 -> 1.01).
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

module.exports = { round2 };
