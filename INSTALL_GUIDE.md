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
   - **Tipo de negocio** (ropa, almacén/kiosco, juguetería, regalería, ferretería, librería u otro): adapta ejemplos, el nombre del campo variable (Talle, Presentación, Medida…) y sugiere categorías. Se cambia después en *Configuración → Negocio*.
   - **Clave de técnico**: guardala vos, no se la des al cliente (ver punto 4).
   - Usuario y contraseña del **administrador** (el dueño).
   - Si arranca solo al prender la PC.
   - Al final se muestran **dos códigos de recuperación** (una sola vez):
     - **Del dueño**: anotáselo o imprimilo y dáselo. Con él recupera su contraseña desde "¿Olvidaste tu contraseña?" sin llamarte. Si lo pierde, puede generar otro en *Configuración → Negocio* (estando logueado).
     - **Del técnico**: guardalo vos. Si te olvidás la clave de técnico, `tecnico\CAMBIAR_CLAVE_TECNICO.bat` lo acepta en lugar de la clave.
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

## 3b. Impresión y PDF

En **Configuración → Impresión y PDF**:

| Opción | Recomendado |
|--------|-------------|
| Cierre de caja | *Solo guardar PDF* si atiende una sola persona; *PDF e imprimir* si hay empleados que rinden caja |
| Ticket de venta | *Botón para imprimir* |
| Factura electrónica | *Imprimir siempre*, formato **Ticket 80 mm** si hay impresora térmica o **A4** si es una impresora común |
| Imprimir directo | Activarlo en Windows cuando la impresora predeterminada ya es la del mostrador |

Con *imprimir directo*, `INICIAR.bat` abre StockLocal en una ventana propia de Edge (o Chrome) con `--kiosk-printing`: todo lo que se imprime sale por la **impresora predeterminada de Windows** sin mostrar el diálogo. Configurá antes esa impresora como predeterminada y usá **Imprimir página de prueba**.

Los PDF se guardan en `Documentos\StockLocal` del usuario de Windows (se puede cambiar). Las facturas de homologación van a `Facturas (pruebas)`, separadas de las reales.

> **Controlador fiscal**: StockLocal emite **factura electrónica** (CAE de ARCA), que se imprime en cualquier impresora común o térmica. No maneja controladores fiscales (Hasar/Epson con memoria fiscal). Si un cliente tiene uno, conviene que pase a factura electrónica.

## 4. Herramientas del técnico (carpeta `tecnico\`)

Todas piden la **clave de técnico**:

| Archivo | Para qué |
|---------|----------|
| `CAMBIAR_MODO.bat` | Pasar de local a facturación, o al revés. Reinicia el sistema solo |
| `RESTABLECER_CLAVE.bat` | El cliente se olvidó la contraseña del administrador |
| `RESTAURAR_COPIA.bat` | Volver a una copia de seguridad (antes guarda una de los datos actuales) |
| `CAMBIAR_CLAVE_TECNICO.bat` | Cambiar tu clave de técnico. Acepta el **código de recuperación del técnico** si te la olvidaste, y te da uno nuevo |

El modo **no** está en ningún archivo editable: queda guardado en la base y solo se cambia con tu clave. Podés dejar la carpeta `tecnico` en la PC del cliente: sin tu clave no hace nada. Si preferís, borrala después de instalar y llevala en un pendrive.

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
| `data\backups\` | Copias automáticas comprimidas (.db.gz): 7 diarias, 4 semanales y 12 mensuales. Para restaurar una copia traída de un pendrive, copiala acá y usá `RESTAURAR_COPIA.bat` |
| `data\logs\servidor.log` | Registro de errores del servidor (se rota solo al pasar los 5 MB) |
| `backend\.env` | Puerto y red |
