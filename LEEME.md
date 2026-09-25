# StockLocal — Sistema de control de stock y ventas

## Requisitos

1. **Node.js LTS** → https://nodejs.org/
2. **MongoDB Community** → https://www.mongodb.com/try/download/community
3. **Proyecto descargado en la PC**

## Instalación rápida

1. Instalar Node.js y MongoDB
2. Descomprimir la carpeta del proyecto
3. Abrir la carpeta principal
4. Ejecutar `INICIAR.bat`
5. La app se abre en http://localhost:3000

## Modo operativo

### Modo local (recomendado)
El sistema funciona como control de stock, ventas y movimientos sin facturación legal.

### Modo facturación
Cuando haga falta para un cliente real, se activa en el backend con:

```env
APP_MODE=facturacion
```

Esto permite incorporar más adelante clientes, comprobantes y facturación real sin tocar la base del sistema.

## Incluye

- Dashboard
- Productos
- Ventas
- Historial
- Devoluciones
- Ajustes de stock
- Registro de movimientos
- Carga manual y futura importación desde Excel

## Documentación

- [INSTALL_GUIDE.md](INSTALL_GUIDE.md)

## Problemas comunes

**No abre / error de conexión:**
- Verificar que MongoDB esté corriendo.

**No instala dependencias:**
- Ejecutar `npm install` dentro de `backend` y `frontend`.

**Puerto ocupado:**
- Cerrar la app y volver a iniciar.

