# Guía del técnico — StockLocal 2

Esta guía es para quien instala el sistema. El cliente usa `LEEME.md`.

## 1. Preparar el paquete (en tu PC)

```bash
npm run setup      # solo la primera vez
npm run release    # corre los tests y genera release/StockLocal-<versión>.zip
```

El zip trae la interfaz compilada y todos los componentes: en la PC del cliente **no hace falta internet** para instalar (salvo para facturar).

## 2. Instalar en la PC del cliente

1. Instalar **Node.js LTS** (22.13 o superior) desde https://nodejs.org, con las opciones por defecto.
2. Descomprimir el zip en una carpeta fija, por ejemplo `C:\StockLocal`. **No** en Descargas ni en el Escritorio.
3. Doble clic en **`INSTALAR.bat`** y responder:
   - **Modo**: `1` = Local (solo registro, sin facturación) · `2` = Facturación electrónica ARCA.
   - Nombre del negocio.
   - **Clave de técnico**: guardala vos, no se la des al cliente (ver punto 4).
   - Usuario y contraseña del **administrador** (el dueño).
   - Si arranca solo al prender la PC.
4. Se crea un acceso directo **StockLocal** en el escritorio y se abre el sistema.

No hace falta MongoDB ni ninguna otra base de datos: todo queda en `data\stocklocal.db`.

## 3. Modo facturación: configurar ARCA

1. Ingresar como administrador → **Configuración → Facturación ARCA**.
2. Cargar CUIT, razón social, condición frente al IVA y punto de venta. Guardar.
3. Tocar **Generar solicitud (.csr)**. La clave privada queda guardada en el sistema: no hace falta OpenSSL.
4. **Homologación (pruebas)** — recomendado primero:
   - En ARCA con clave fiscal, adherir **WSASS - Autogestión Certificados Homologación**.
   - En WSASS: *Nuevo certificado* pegando el .csr → guardar el certificado como `.crt`.
   - En WSASS: *Crear autorización a servicio* → servicio **wsfe**.
5. Subir el `.crt` y tocar **Probar conexión**. Hacer una venta de prueba con factura.
6. **Producción**:
   - En ARCA: *Administración de Certificados Digitales* → nuevo alias → subir **el mismo .csr** → descargar el `.crt`.
   - *Administrador de Relaciones de Clave Fiscal* → nueva relación → ARCA → WebServices → **Facturación Electrónica**, con el alias como representante.
   - *Administración de puntos de venta y domicilios* → crear un punto de venta del tipo **Web Services** y cargar ese número.
   - En StockLocal: elegir **Producción**, guardar, subir el `.crt` de producción y **Probar conexión**.

### Qué hace el sistema con las facturas

- La letra se elige sola: Responsable Inscripto → **A** a inscriptos y monotributistas, **B** al resto. Monotributo/Exento → **C**.
- Valida el CUIT (dígito verificador), el DNI y el monto a partir del cual ARCA exige identificar al consumidor final (el monto se puede cambiar en Configuración).
- Si ARCA no responde, **la venta se guarda igual** y la factura queda *pendiente*. Al reintentar, primero consulta a ARCA si ese número ya se autorizó: **nunca duplica ni saltea números**.
- Devoluciones y anulaciones de ventas facturadas emiten la **Nota de Crédito** asociada automáticamente.
- Impresión A4 con QR (RG 4892) y leyenda de IVA contenido en Factura B (Ley 27.743).
- **Comprobantes ARCA → Libro para el contador** exporta un CSV con todas las autorizadas.

## 4. Herramientas del técnico (carpeta `tecnico\`)

Todas piden la **clave de técnico**:

| Archivo | Para qué |
|---------|----------|
| `CAMBIAR_MODO.bat` | Pasar de local a facturación, o al revés. Reinicia el sistema solo |
| `RESTABLECER_CLAVE.bat` | El cliente se olvidó la contraseña del administrador |
| `RESTAURAR_COPIA.bat` | Volver a una copia de seguridad (antes guarda una de los datos actuales) |
| `CAMBIAR_CLAVE_TECNICO.bat` | Cambiar tu clave de técnico |

El modo **no** está en ningún archivo editable: queda guardado en la base y solo se cambia con tu clave.

## 5. Actualizar a una versión nueva

1. `DETENER.bat`.
2. Copiar los archivos del zip nuevo **encima** de la carpeta actual. La carpeta `data` no viene en el zip, así que no se toca.
3. `INSTALAR.bat`: detecta que ya está instalado, conserva los datos y aplica las migraciones de la base al iniciar.

## 6. Usar desde varias PCs de la red (opcional)

En `backend\.env` cambiar `HOST=0.0.0.0`, reiniciar y abrir `http://IP-DE-ESTA-PC:3000` desde las otras PCs. Permitir el puerto en el firewall de Windows. Cada persona entra con su usuario.

## 7. Dónde está cada cosa

| Ruta | Contenido |
|------|-----------|
| `data\stocklocal.db` | Toda la información (incluido el certificado de ARCA) |
| `data\backups\` | Copias automáticas diarias (últimas 30) |
| `data\logs\servidor.log` | Registro de errores del servidor |
| `backend\.env` | Puerto y red |
