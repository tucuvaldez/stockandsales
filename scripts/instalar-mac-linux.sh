#!/usr/bin/env sh
# Instalación en macOS / Linux (útil para pruebas del técnico).
set -e
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Falta Node.js 22.13 o superior: https://nodejs.org"; exit 1; }
[ -f backend/node_modules/express/package.json ] || (cd backend && npm ci --omit=dev --no-audit --no-fund)
[ -f frontend/dist/index.html ] || (cd frontend && npm ci --no-audit --no-fund && npm run build)
node --disable-warning=ExperimentalWarning backend/scripts/install.js
node backend/scripts/iniciar.js
