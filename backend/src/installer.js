const bcrypt = require("bcryptjs");
const { getDb, tx } = require("./db");
const settings = require("./settings");
const { hashPassword } = require("./auth");
const { audit } = require("./audit");

const isInstalled = () => !!settings.getMode();

function validatePin(pin) {
  if (!/^\S{6,}$/.test(pin || "")) throw new Error("La clave de técnico debe tener al menos 6 caracteres, sin espacios");
}

async function install({ mode, negocio, techPin, admin }) {
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
    settings.getJwtSecret();
    db.prepare("INSERT INTO users (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, 'admin')").run(admin.nombre || "Administrador", admin.usuario, passHash);
    audit(null, "sistema.instalar", { detalle: { mode } });
  });
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

function changeTechPin(oldPin, newPin) {
  if (!checkTechPin(oldPin)) throw new Error("Clave de técnico incorrecta");
  validatePin(newPin);
  settings.set("tech_pin_hash", bcrypt.hashSync(newPin, 10));
  audit(null, "sistema.cambiar_clave_tecnico");
}

module.exports = { isInstalled, install, checkTechPin, setMode, resetPassword, changeTechPin };
