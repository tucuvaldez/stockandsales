const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const examplePath = path.join(__dirname, '..', '.env.example');

const normalizeMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === '1' || normalized === 'local') return 'local';
  if (normalized === '2' || normalized === 'facturacion' || normalized === 'billing') return 'facturacion';
  return null;
};

function writeEnv(mode) {
  const example = fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '';
  const base = example || ['APP_MODE=local', 'PORT=5000', 'MONGO_URI=mongodb://127.0.0.1:27017/stocklocal', ''].join('\n');
  const nextContent = base
    .replace(/APP_MODE=.*/g, `APP_MODE=${mode}`)
    .replace(/PORT=.*/g, 'PORT=5000')
    .replace(/MONGO_URI=.*/g, 'MONGO_URI=mongodb://127.0.0.1:27017/stocklocal');

  fs.writeFileSync(envPath, nextContent, 'utf8');
  console.log(`\n✅ Configuración guardada. Modo seleccionado: ${mode}`);
  console.log('Reiniciá el backend para aplicar los cambios.');
}

const prompt = 'Elegí el modo para este equipo: [1] local  [2] facturacion\nOpción: ';
process.stdout.write(prompt);

process.stdin.once('data', (data) => {
  const mode = normalizeMode(data.toString());

  if (!mode) {
    process.stdout.write('Opción inválida. Debe ser 1 (local) o 2 (facturacion).\n');
    process.exit(1);
  }

  writeEnv(mode);
  process.exit(0);
});
