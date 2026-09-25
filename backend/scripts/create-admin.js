const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config({ path: require('path').join(__dirname, '..', '.env') });

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/stocklocal');

  const email = process.env.ADMIN_EMAIL || 'admin@stocklocal.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await User.findOne({ email });
  if (existing) {
    console.log('Usuario admin ya existe.');
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = new User({
    nombre: 'Administrador',
    email,
    passwordHash,
    rol: 'admin',
  });

  await user.save();
  console.log('✅ Usuario admin creado');
  console.log(`Email: ${email}`);
  console.log(`Contraseña: ${password}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
