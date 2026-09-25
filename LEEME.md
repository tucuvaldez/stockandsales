# StockLocal

Sistema de stock y ventas para tu negocio.

## Uso diario

- **Abrir:** doble clic en el ícono **StockLocal** del escritorio (o en `INICIAR.bat`).
  Se abre en el navegador. Si ya estaba abierto, solo abre una pestaña nueva.
- **Cerrar:** podés cerrar el navegador tranquilo; el sistema sigue guardando todo.
  Si necesitás apagarlo del todo: `DETENER.bat`.

## Caja

1. **Al empezar el día:** en **Caja**, contá el cambio y tocá **Abrir caja**. Sin caja abierta no se puede vender (se puede desactivar en Configuración).
2. **Durante el día:**
   - Si pagás algo (proveedor, flete, compras) o sacás plata, usá **Pago / gasto / retiro** e indicá si fue en **efectivo** o por **transferencia**. Solo lo que sale en efectivo se descuenta de la caja.
   - Si un cliente paga una parte en efectivo y otra por transferencia, en la venta tocá **Dividir pago**.
3. **Al cerrar:** si sacaste plata (por ejemplo, para un familiar), registrala antes como **retiro** así la caja cierra justa. Contá todo el efectivo y tocá **Cerrar caja**. El sistema te dice si sobra o falta.
   - **Vendido neto** = ventas menos devoluciones. **Entró a la caja** = vendido neto menos pagos, gastos y retiros.
   El cierre se **guarda solo en PDF** en `Documentos\StockLocal\Cierres de caja\` (no hace falta imprimirlo).

## Documentos PDF e impresión

- Los cierres de caja (y las facturas, si facturás) se guardan solos en PDF, ordenados por mes, en `Documentos\StockLocal`.
- En **Configuración → Impresión y PDF** elegís qué se imprime: nada, sólo lo que pidas o todo automáticamente.
- Si activás **imprimir directo**, al abrir StockLocal desde el ícono las impresiones salen por la impresora sin preguntar.

## Atajos en "Nueva venta"

| Tecla | Acción |
|-------|--------|
| Escanear código + `Enter` | Agrega el producto |
| `F2` | Cobrar |
| `Esc` | Cerrar ventana |

## Tus datos

- Se guardan en esta PC, en la carpeta `data`.
- Se hace una **copia de seguridad automática por día** (quedan las últimas 30).
- Recomendado: una vez por semana, en **Configuración → Copias de seguridad**, descargá una copia a un pendrive o a la nube.

## Problemas comunes

| Qué pasa | Qué hacer |
|----------|-----------|
| "No se pudo conectar con StockLocal" | Abrí `INICIAR.bat` |
| Me olvidé la contraseña (vendedor) | Pedile al administrador que la cambie en **Usuarios** |
| Me olvidé la contraseña (dueño/administrador) | En el ingreso tocá **¿Olvidaste tu contraseña?** y usá tu **código de recuperación** (el papel que te dio el técnico). Si lo perdiste, llamá al técnico |
| Una factura quedó "pendiente" o con "error" | Andá a **Comprobantes ARCA** y tocá **Reintentar** (suele pasar si se cortó internet) |

Soporte técnico: _(completar con tu contacto)_
