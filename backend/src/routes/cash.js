const express = require("express");
const { requireRole } = require("../auth");
const { forbidden } = require("../errors");
const { id, pagination } = require("../validate");
const cash = require("../services/cash");

const router = express.Router();
const isManager = (user) => ["admin", "supervisor"].includes(user.rol);

// El vendedor no ve el efectivo esperado antes de cerrar: así el arqueo es a ciegas.
function forUser(summary, user) {
  if (isManager(user) || summary.estado === "cerrada") return summary;
  const { efectivoEsperado, ...rest } = summary;
  return rest;
}

router.get("/actual", (req, res) => {
  const open = cash.getOpenSession();
  res.json({ obligatoria: cash.isCashRequired(), session: open ? forUser(cash.summary(open.id), req.user) : null });
});

router.post("/abrir", (req, res) => res.status(201).json(forUser(cash.openSession(req.body, req), req.user)));
router.post("/movimiento", (req, res) => res.json(forUser(cash.manualMovement(req.body, req), req.user)));
router.post("/cerrar", (req, res) => res.json(cash.closeSession(req.body, req)));

router.get("/", requireRole("admin", "supervisor"), (req, res) => {
  const { limit, page, offset } = pagination(req.query, { defaultLimit: 30 });
  const r = cash.listSessions({ limit, offset });
  res.json({ ...r, pages: Math.max(1, Math.ceil(r.total / limit)), page });
});

// El detalle de una caja cerrada lo ve quien la abrió o cerró (para reimprimir) y los encargados.
router.get("/:id", (req, res) => {
  const s = cash.summary(id(req.params.id));
  const involved = [s.abierta_por_id, s.cerrada_por_id].includes(req.user.id);
  if (!isManager(req.user) && !involved) throw forbidden();
  res.json(forUser(s, req.user));
});

module.exports = router;
