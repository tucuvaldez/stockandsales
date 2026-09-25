const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const users = await User.find({ activo: true }).select("-passwordHash").sort({ nombre: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Nombre, email y contraseña son obligatorios" });
    }

    const exists = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (exists) return res.status(400).json({ error: "Ese email ya existe" });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = new User({ nombre, email: String(email).trim().toLowerCase(), passwordHash, rol: rol || "vendedor" });
    await user.save();

    const safeUser = user.toObject();
    delete safeUser.passwordHash;
    res.status(201).json(safeUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
