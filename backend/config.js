const VALID_MODES = new Set(["local", "facturacion", "billing"]);

const resolveAppMode = (value) => {
  const normalized = String(value || "local").trim().toLowerCase();
  return VALID_MODES.has(normalized) ? normalized : "local";
};

const buildFeatureFlags = (mode) => {
  const currentMode = resolveAppMode(mode);
  const isBilling = currentMode === "facturacion" || currentMode === "billing";

  return {
    inventory: true,
    sales: true,
    stock: true,
    reports: true,
    billing: isBilling,
    invoiceA: isBilling,
    invoiceB: isBilling,
    invoiceC: isBilling,
    consumerFinal: isBilling,
    cashRegister: isBilling,
    clients: isBilling,
    taxes: isBilling,
  };
};

const APP_MODE = resolveAppMode(process.env.APP_MODE);
const featureFlags = buildFeatureFlags(APP_MODE);

const config = {
  APP_MODE,
  isLocal: APP_MODE === "local",
  isBilling: APP_MODE === "facturacion" || APP_MODE === "billing",
  PORT: Number(process.env.PORT || 5000),
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/stocklocal",
  featureFlags,
};

module.exports = config;
module.exports.resolveAppMode = resolveAppMode;
module.exports.buildFeatureFlags = buildFeatureFlags;
