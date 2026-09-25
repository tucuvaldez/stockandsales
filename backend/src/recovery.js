const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const settings = require("./settings");

// Sin 0/O, 1/I/L para que se pueda dictar y copiar a mano sin errores. 16 caracteres ≈ 79 bits.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KINDS = ["admin", "tecnico"];

const normalize = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function newCode() {
  let s = "";
  for (let i = 0; i < 16; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s.match(/.{4}/g).join("-");
}

/**
 * Genera un código de recuperación nuevo (el anterior deja de servir).
 * Solo se guarda el hash: el código se muestra una única vez.
 */
function issue(kind) {
  if (!KINDS.includes(kind)) throw new Error("Tipo de código inválido");
  const code = newCode();
  settings.set(`recovery_${kind}_hash`, bcrypt.hashSync(normalize(code), 10));
  settings.set(`recovery_${kind}_at`, new Date().toISOString());
  return code;
}

function check(kind, code) {
  const hash = settings.get(`recovery_${kind}_hash`);
  const n = normalize(code);
  return !!hash && n.length === 16 && bcrypt.compareSync(n, hash);
}

const status = (kind) => ({ existe: !!settings.get(`recovery_${kind}_hash`), generado: settings.get(`recovery_${kind}_at`) || null });

module.exports = { issue, check, status, normalize };
