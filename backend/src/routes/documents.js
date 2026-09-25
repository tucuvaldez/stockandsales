const fs = require("fs");
const { spawn } = require("child_process");
const express = require("express");
const { requireRole } = require("../auth");
const { forbidden, badRequest } = require("../errors");
const { id } = require("../validate");
const settings = require("../settings");
const cash = require("../services/cash");
const documents = require("../services/documents");

const router = express.Router();
const isManager = (user) => ["admin", "supervisor"].includes(user.rol);

// Genera el PDF si todavía no existe (por ejemplo, si se cambió la carpeta) y lo envía.
async function sendPdf(res, file, generate) {
  if (!fs.existsSync(file)) await generate();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(require("path").basename(file))}"`);
  fs.createReadStream(file).pipe(res);
}

router.get("/caja/:id.pdf", async (req, res) => {
  const s = cash.summary(id(req.params.id));
  if (s.estado !== "cerrada") throw badRequest("La caja todavía está abierta");
  if (!isManager(req.user) && ![s.abierta_por_id, s.cerrada_por_id].includes(req.user.id)) throw forbidden();
  await sendPdf(res, documents.cashClosePath(s), () => documents.saveCashClosePdf(s));
});

router.get("/comprobante/:id.pdf", async (req, res) => {
  if (!settings.isBilling()) throw forbidden("La facturación no está habilitada");
  const billing = require("../services/billing");
  const inv = billing.getInvoice(id(req.params.id));
  if (inv.estado !== "autorizada") throw badRequest("El comprobante no está autorizado");
  const afip = require("../services/afip");
  await sendPdf(res, documents.invoicePath(inv), () => documents.saveInvoicePdf(inv, afip.fiscalConfig()));
});

router.get("/", requireRole("admin", "supervisor"), (req, res) => {
  res.json({ carpeta: documents.docsDir(), archivos: documents.listRecent() });
});

// Abre la carpeta en el Explorador. Solo tiene sentido (y solo se permite) desde la misma PC.
router.post("/abrir-carpeta", requireRole("admin", "supervisor"), (req, res) => {
  const ip = req.socket.remoteAddress || "";
  if (!/^(::1|127\.|::ffff:127\.)/.test(ip)) throw forbidden("Solo se puede abrir la carpeta desde la PC donde está instalado el sistema");
  const dir = documents.docsDir();
  fs.mkdirSync(dir, { recursive: true });
  const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [dir], { detached: true, stdio: "ignore" }).unref();
  res.json({ ok: true, carpeta: dir });
});

module.exports = router;
