# Guía de instalación rápida — StockLocal

Esta guía está pensada para que cualquier usuario pueda instalar el sistema en una PC sin conocimiento técnico avanzado.

## Requisitos

1. Instalar Node.js LTS
   - Descargalo desde: https://nodejs.org/
   - Durante la instalación, dejá todo por defecto.

2. Instalar MongoDB Community
   - Descargalo desde: https://www.mongodb.com/try/download/community
   - Durante la instalación, dejá la opción recomendada.
   - Si te pide instalar como servicio, dejá marcada la opción que lo deja corriendo automáticamente.

3. Tener acceso a una carpeta del proyecto
   - Podés recibirlo por Drive, ZIP o Git.
   - Lo ideal es dejarlo en una carpeta fácil como: `C:\StockLocal`

---

## 1) Descomprimir el proyecto

1. Extraer la carpeta del ZIP.
2. Entrar a la carpeta principal del proyecto.
3. Verás carpetas como:
   - `backend`
   - `frontend`
   - `LEEME.md`
   - `INICIAR.bat`

---

## 2) Iniciar MongoDB

### Opción A: si MongoDB se instaló como servicio
- La base se levanta sola al iniciar Windows.
- Si no está corriendo:
  - Abrí "Servicios"
  - Busca "MongoDB Server"
  - Haz click derecho → Iniciar

### Opción B: iniciar manualmente
- Abrí la terminal de MongoDB o el CMD desde la carpeta de instalación.
- Si no sabes cómo, lo más simple es dejarlo como servicio.

---

## 3) Instalar dependencias

### En Windows
1. Abrí una terminal en la carpeta del proyecto.
2. Ejecutá:

```bash
cd backend
npm install
cd ..
cd frontend
npm install
```

Si preferís, también podés usar el archivo `INICIAR.bat`, que lo hace automáticamente.

---

## 4) Levantar el sistema

### Opción rápida
Doble clic en `INICIAR.bat`

Esto va a:
- revisar si Node.js está instalado
- instalar dependencias si faltan
- iniciar backend
- iniciar frontend
- abrir el navegador

---

## 5) Abrir la aplicación

Se abre normalmente en:

```text
http://localhost:3000
```

---

## 6) Modo local vs futuro facturación

El sistema trae un modo configurable en el backend.

### Modo local (recomendado para empezar)
Archivo `.env` del backend:

```env
APP_MODE=local
MONGO_URI=mongodb://127.0.0.1:27017/stocklocal
PORT=5000
```

Esto habilita:
- carga manual de productos
- carga desde Excel
- ventas
- movimientos de stock
- historial
- devoluciones
- sin facturación legal

### Modo facturación real (futuro)
Cuando se lo necesite a un cliente real:

```env
APP_MODE=facturacion
MONGO_URI=mongodb://127.0.0.1:27017/stocklocal
PORT=5000
```

Esto deja preparado el sistema para agregar:
- clientes
- comprobantes
- tipo A/B/C
- CUIT/IVA
- facturación legal

> El cambio lo hace quien instala el sistema, no el usuario final.

---

## 7) Cómo cargar productos

### Carga manual
- Ir a Productos
- Hacer click en “Nuevo producto”
- Completar:
  - código
  - nombre
  - categoría
  - talle
  - precio
  - stock
  - stock mínimo

### Carga desde Excel
Próximamente se puede agregar una importación masiva con una plantilla simple.
El formato recomendado es:

| codigo | nombre | talle | categoria | precio | precioCompra | stock | stockMinimo |
|--------|--------|-------|-----------|--------|--------------|-------|-------------|

---

## 8) Cómo registrar ventas

1. Ir a “Nueva Venta”
2. Buscar producto
3. Agregar al carrito
4. Ajustar cantidades y descuentos
5. Elegir método de pago
6. Confirmar venta

El sistema actualiza automáticamente el stock.

---

## 9) Como usar movimientos

En el sistema, toda venta, ajuste o devolución queda registrada como movimiento.
Esto permite ver:
- qué se vendió
- cuándo
- cuánto stock había antes
- cuánto quedó después

Esto es muy útil para controlar inventario y evitar errores.

---

## 10) Problemas comunes

### Error de conexión a MongoDB
Verificá que MongoDB esté corriendo.

### Error al abrir la app
Verificá que Node.js esté instalado.

### Puerto ocupado
Si el puerto 3000 o 5000 está ocupado, cerrá la aplicación que lo usa o cambiá los puertos en `.env`.

---

## 11) Recomendación de entrega al cliente

Para enviar el sistema por Drive o ZIP:

1. Incluir la carpeta completa del proyecto
2. Incluir esta guía
3. Incluir una carta breve con:
   - “Para usarlo, instalar Node.js y MongoDB”
   - “Ejecutar INICIAR.bat”
   - “Si se quiere usar en modo local, dejar APP_MODE=local”

---

## 12) Mantenimiento futuro

Cuando el cliente quiera facturación legal real, solo se activa el modo de facturación y se agregan:
- clientes
- comprobantes
- tipo de IVA
- emisión fiscal

El resto del sistema de stock y ventas se mantiene igual.

---

## Resumen

La forma más sencilla para instalarlo es:

1. Instalar Node.js
2. Instalar MongoDB
3. Abrir la carpeta del proyecto
4. Ejecutar `INICIAR.bat`
5. Listo

Y va a quedar preparado para crecer a facturación real sin volver a arrancar desde cero.
