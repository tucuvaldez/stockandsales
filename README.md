# StockLocal

Sistema de gestión de stock, ventas y facturación configurable por modo.

## Modo local

Ideal para tiendas pequeñas, kioscos, emprendimientos y usuarios que solo necesitan:
- productos
- stock
- ventas
- historial
- movimientos
- ajustes de inventario

## Modo facturación

Ideal para clientes que necesitan:
- tipo A, B, C
- consumidor final
- comprobantes
- clientes
- emisión fiscal

## Instalación rápida

1. Instalar Node.js LTS
2. Instalar MongoDB Community
3. Abrir la carpeta del proyecto
4. Ejecutar INICIAR.bat
5. Elegir:
   - 1 = local
   - 2 = facturacion
6. El sistema abre en http://localhost:3000

## Configuración manual

En el archivo backend/.env:

```env
APP_MODE=local
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/stocklocal
```

Para facturación:

```env
APP_MODE=facturacion
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/stocklocal
```

## Seguridad

- CORS habilitado solo para la app local
- Helmet para cabeceras básicas
- rate limiting por IP
- validación del modo
- API preparada para crecer sin romper el flujo principal

## Escalabilidad

La estructura está pensada para crecer sin reescribir todo:
- backend modular
- modelos separados
- rutas por dominio
- estado central del modo de uso
- facturación como módulo adicional

## Siguiente capa recomendada

Para clientes más grandes, la siguiente etapa es:
- clientes y proveedores
- comprobantes legales
- usuarios con roles
- multi-sucursal
- exportación e importación masiva
- backup y auditoría
