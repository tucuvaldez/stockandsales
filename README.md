# StockLocal

Stock, ventas y facturación electrónica ARCA (ex AFIP) para comercios. Se instala en la PC del cliente en uno de dos modos, que elige el técnico:

- **Local**: productos, stock, ventas, devoluciones, anulaciones y registro completo de movimientos. Sin facturación.
- **Facturación**: lo anterior + Factura A/B/C y Notas de Crédito electrónicas reales vía WSAA/WSFEv1.

Guía de instalación: [INSTALL_GUIDE.md](INSTALL_GUIDE.md) · Manual del cliente: [LEEME.md](LEEME.md)

## Arquitectura

| Capa | Tecnología |
|------|-----------|
| Base de datos | SQLite embebido (`node:sqlite`, sin dependencias nativas) con migraciones versionadas |
| Backend | Node 22.13+, Express 5 · sirve también la interfaz compilada (un solo proceso y un solo puerto) |
| Frontend | React 18 + Vite |
| ARCA | Cliente propio de WSAA (firma CMS con node-forge) y WSFEv1 (SOAP) |

```
backend/
  server.js              arranque (127.0.0.1:3000 por defecto)
  src/db.js              esquema + migraciones + transacciones
  src/services/sales.js  ventas, devoluciones y anulaciones (atómicas)
  src/services/stock.js  único punto que modifica stock (siempre deja un movimiento)
  src/services/billing.js facturas, notas de crédito, cola y conciliación con ARCA
  src/services/afip/     WSAA, WSFEv1, tablas de ARCA
  scripts/install.js     asistente de instalación (INSTALAR.bat)
  scripts/tecnico.js     cambiar modo, restablecer clave, restaurar copia
frontend/src/pages/      pantallas
```

### Garantías

- Precios y totales se calculan en el servidor; lo que manda el navegador se ignora.
- Venta + items + stock + movimientos en una sola transacción. El stock no puede quedar negativo (restricción en la base).
- Las ventas no se borran: se anulan y quedan en el historial. No se puede devolver más de lo vendido.
- Toda acción queda en el registro de actividad (quién, qué, cuándo).
- Factura: si se corta la conexión, al reintentar se consulta a ARCA antes de pedir un número nuevo.
- Sesiones JWT con secreto aleatorio por instalación; se invalidan al cambiar la contraseña, el rol o al desactivar al usuario. Login con límite de intentos.

## Desarrollo

```bash
npm run setup                          # instala dependencias
node backend/scripts/install.js        # crea data/ con un modo y un admin
npm run dev:api                        # API en :3000 (se reinicia al guardar)
npm run dev:web                        # interfaz en :5173 con proxy a la API
npm test                               # tests (ventas, facturación con ARCA simulado, WSAA)
npm run release                        # zip para instalar en clientes
```

`STOCKLOCAL_DATA=/otra/carpeta` usa otra carpeta de datos (útil para tener varias instalaciones de prueba).
