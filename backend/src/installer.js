const bcrypt = require("bcryptjs");
const { getDb, tx } = require("./db");
const settings = require("./settings");
const { hashPassword } = require("./auth");
const { audit } = require("./audit");
const recovery = require("./recovery");

const isInstalled = () => !!settings.getMode();

function validatePin(pin) {
  if (!/^\S{6,}$/.test(pin || "")) throw new Error("La clave de técnico debe tener al menos 6 caracteres, sin espacios");
}

async function install({ mode, negocio, techPin, admin, rubro = "otro" }) {
  if (isInstalled()) throw new Error("El sistema ya está instalado");
  if (!settings.MODES.includes(mode)) throw new Error("Modo inválido");
  validatePin(techPin);
  if (!admin?.usuario || !/^[a-z0-9._-]{3,40}$/.test(admin.usuario)) throw new Error("Usuario de administrador inválido");
  if (!admin.password || admin.password.length < 6) throw new Error("La contraseña del administrador debe tener al menos 6 caracteres");

  const pinHash = bcrypt.hashSync(techPin, 10);
  const passHash = await hashPassword(admin.password);
  tx((db) => {
    settings.set("app_mode", mode);
    settings.set("installed_at", new Date().toISOString());
    settings.set("tech_pin_hash", pinHash);
    settings.set("negocio_nombre", negocio || "Mi negocio");
    const { RUBROS, rubroOrDefault } = require("./rubros");
    settings.set("rubro", rubroOrDefault(rubro));
    for (const c of RUBROS[rubroOrDefault(rubro)].categorias) db.prepare("INSERT OR IGNORE INTO categories (nombre) VALUES (?)").run(c);
    settings.getJwtSecret();
    db.prepare("INSERT INTO users (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, 'admin')").run(admin.nombre || "Administrador", admin.usuario, passHash);
    audit(null, "sistema.instalar", { detalle: { mode } });
  });
  // Códigos para no quedar bloqueados: uno para el dueño y otro para el técnico.
  return { adminCode: recovery.issue("admin"), techCode: recovery.issue("tecnico") };
}

function checkTechPin(pin) {
  const hash = settings.get("tech_pin_hash");
  return !!hash && bcrypt.compareSync(String(pin || ""), hash);
}

function setMode(mode, pin) {
  if (!checkTechPin(pin)) throw new Error("Clave de técnico incorrecta");
  if (!settings.MODES.includes(mode)) throw new Error("Modo inválido");
  const antes = settings.getMode();
  settings.set("app_mode", mode);
  audit(null, "sistema.cambiar_modo", { detalle: { antes, despues: mode } });
}

async function resetPassword(usuario, newPassword, pin) {
  if (!checkTechPin(pin)) throw new Error("Clave de técnico incorrecta");
  if (!newPassword || newPassword.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
  const user = getDb().prepare("SELECT * FROM users WHERE usuario = ?").get(usuario);
  if (!user) throw new Error("Ese usuario no existe");
  getDb()
    .prepare("UPDATE users SET password_hash = ?, activo = 1, token_version = token_version + 1, updated_at = ? WHERE id = ?")
    .run(await hashPassword(newPassword), new Date().toISOString(), user.id);
  audit(null, "sistema.restablecer_clave", { entidad: "usuario", entidadId: user.id });
}

// Acepta la clave actual o el código de recuperación del técnico. Devuelve un código de recuperación nuevo.
function changeTechPin(oldPinOrCode, newPin) {
  const viaCode = !checkTechPin(oldPinOrCode) && recovery.check("tecnico", oldPinOrCode);
  if (!viaCode && !checkTechPin(oldPinOrCode)) throw new Error("Clave de técnico o código de recuperación incorrecto");
  validatePin(newPin);
  settings.set("tech_pin_hash", bcrypt.hashSync(newPin, 10));
  audit(null, "sistema.cambiar_clave_tecnico", { detalle: { conCodigoDeRecuperacion: viaCode } });
  return recovery.issue("tecnico");
}

const checkTechPinOrCode = (v) => checkTechPin(v) || recovery.check("tecnico", v);

/** El dueño recupera el acceso con su código, sin depender del técnico. Devuelve el código nuevo. */
async function resetWithRecoveryCode(usuario, code, newPassword) {
  if (!recovery.check("admin", code)) throw new Error("El código de recuperación no es correcto");
  if (!newPassword || newPassword.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
  const user = getDb().prepare("SELECT * FROM users WHERE usuario = ?").get(String(usuario || "").trim().toLowerCase());
  if (!user || user.rol !== "admin") throw new Error("El código de recuperación solo sirve para usuarios administradores");
  getDb()
    .prepare("UPDATE users SET password_hash = ?, activo = 1, token_version = token_version + 1, updated_at = ? WHERE id = ?")
    .run(await hashPassword(newPassword), new Date().toISOString(), user.id);
  audit({ user }, "usuario.recuperar_clave", { entidad: "usuario", entidadId: user.id });
  return { user: getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id), newCode: recovery.issue("admin") };
}

module.exports = { isInstalled, install, checkTechPin, checkTechPinOrCode, setMode, resetPassword, changeTechPin, resetWithRecoveryCode };
