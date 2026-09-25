const { DatabaseSync } = require("node:sqlite");

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

// Cada entrada es una migración. Nunca editar una ya publicada: agregar una nueva al final.
const MIGRATIONS = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin','supervisor','vendedor')),
    activo INTEGER NOT NULL DEFAULT 1,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    categoria TEXT NOT NULL DEFAULT 'General',
    talle TEXT NOT NULL DEFAULT '',
    precio REAL NOT NULL CHECK (precio >= 0),
    precio_compra REAL NOT NULL DEFAULT 0 CHECK (precio_compra >= 0),
    alicuota_iva REAL NOT NULL DEFAULT 21,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX idx_products_nombre ON products(nombre COLLATE NOCASE);

  CREATE TABLE clients (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    doc_tipo INTEGER NOT NULL DEFAULT 99,
    doc_nro TEXT NOT NULL DEFAULT '',
    condicion_iva INTEGER NOT NULL DEFAULT 5,
    email TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT '',
    direccion TEXT NOT NULL DEFAULT '',
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX idx_clients_nombre ON clients(nombre COLLATE NOCASE);

  CREATE TABLE sales (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    usuario_nombre TEXT NOT NULL DEFAULT '',
    client_id INTEGER REFERENCES clients(id),
    metodo_pago TEXT NOT NULL,
    subtotal REAL NOT NULL,
    descuento_tipo TEXT NOT NULL DEFAULT 'pct',
    descuento_valor REAL NOT NULL DEFAULT 0,
    descuento_monto REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    total_devuelto REAL NOT NULL DEFAULT 0,
    nota TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'completada' CHECK (estado IN ('completada','anulada')),
    anulada_at TEXT,
    anulada_por TEXT,
    motivo_anulacion TEXT
  );
  CREATE INDEX idx_sales_fecha ON sales(fecha);

  CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    talle TEXT NOT NULL DEFAULT '',
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    cantidad_devuelta INTEGER NOT NULL DEFAULT 0,
    precio_unitario REAL NOT NULL,
    descuento_pct REAL NOT NULL DEFAULT 0,
    alicuota_iva REAL NOT NULL DEFAULT 21,
    subtotal REAL NOT NULL,
    CHECK (cantidad_devuelta >= 0 AND cantidad_devuelta <= cantidad)
  );
  CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

  CREATE TABLE sale_returns (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    fecha TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    usuario_nombre TEXT NOT NULL DEFAULT '',
    total REAL NOT NULL,
    motivo TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE sale_return_items (
    id INTEGER PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES sale_returns(id),
    sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    monto REAL NOT NULL
  );

  CREATE TABLE movements (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('alta','ingreso','egreso','ajuste','venta','devolucion','anulacion')),
    product_id INTEGER NOT NULL REFERENCES products(id),
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    stock_antes INTEGER NOT NULL,
    stock_despues INTEGER NOT NULL,
    motivo TEXT NOT NULL DEFAULT '',
    ref_tipo TEXT,
    ref_id INTEGER,
    user_id INTEGER REFERENCES users(id),
    usuario_nombre TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_movements_fecha ON movements(fecha);
  CREATE INDEX idx_movements_product ON movements(product_id, fecha);

  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER REFERENCES sales(id),
    return_id INTEGER REFERENCES sale_returns(id),
    asociado_id INTEGER REFERENCES invoices(id),
    entorno TEXT NOT NULL CHECK (entorno IN ('homologacion','produccion')),
    cuit_emisor TEXT NOT NULL,
    pto_vta INTEGER NOT NULL,
    tipo_cbte INTEGER NOT NULL,
    numero INTEGER,
    numero_intentado INTEGER,
    fecha TEXT NOT NULL,
    doc_tipo INTEGER NOT NULL,
    doc_nro TEXT NOT NULL,
    condicion_iva_receptor INTEGER NOT NULL,
    receptor_nombre TEXT NOT NULL DEFAULT '',
    receptor_domicilio TEXT NOT NULL DEFAULT '',
    imp_total REAL NOT NULL,
    imp_neto REAL NOT NULL,
    imp_iva REAL NOT NULL,
    iva_json TEXT NOT NULL DEFAULT '[]',
    items_json TEXT NOT NULL DEFAULT '[]',
    cae TEXT,
    cae_vto TEXT,
    estado TEXT NOT NULL CHECK (estado IN ('pendiente','autorizada','rechazada','error','cancelada')),
    mensajes TEXT NOT NULL DEFAULT '',
    intentos INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE UNIQUE INDEX ux_invoices_numero ON invoices(entorno, cuit_emisor, pto_vta, tipo_cbte, numero) WHERE numero IS NOT NULL;
  CREATE INDEX idx_invoices_sale ON invoices(sale_id);

  CREATE TABLE afip_tickets (
    entorno TEXT NOT NULL,
    cuit TEXT NOT NULL,
    service TEXT NOT NULL,
    token TEXT NOT NULL,
    sign TEXT NOT NULL,
    expira TEXT NOT NULL,
    PRIMARY KEY (entorno, cuit, service)
  );

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL DEFAULT ${NOW},
    user_id INTEGER,
    usuario_nombre TEXT NOT NULL DEFAULT '',
    accion TEXT NOT NULL,
    entidad TEXT NOT NULL DEFAULT '',
    entidad_id INTEGER,
    detalle TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_audit_fecha ON audit_log(fecha);
  `,
  // 2: caja diaria. Cada movimiento de dinero (venta, devolución, retiro...) queda en cash_entries.
  `
  CREATE TABLE cash_sessions (
    id INTEGER PRIMARY KEY,
    estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
    abierta_at TEXT NOT NULL,
    abierta_por_id INTEGER REFERENCES users(id),
    abierta_por TEXT NOT NULL,
    monto_inicial REAL NOT NULL CHECK (monto_inicial >= 0),
    nota_apertura TEXT NOT NULL DEFAULT '',
    cerrada_at TEXT,
    cerrada_por_id INTEGER REFERENCES users(id),
    cerrada_por TEXT,
    efectivo_esperado REAL,
    efectivo_contado REAL,
    diferencia REAL,
    nota_cierre TEXT NOT NULL DEFAULT ''
  );
  CREATE UNIQUE INDEX ux_cash_una_abierta ON cash_sessions(estado) WHERE estado = 'abierta';

  CREATE TABLE cash_entries (
    id INTEGER PRIMARY KEY,
    session_id INTEGER REFERENCES cash_sessions(id),
    fecha TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('venta','devolucion','anulacion','ingreso','egreso')),
    metodo_pago TEXT NOT NULL,
    monto REAL NOT NULL,
    motivo TEXT NOT NULL DEFAULT '',
    ref_tipo TEXT,
    ref_id INTEGER,
    user_id INTEGER REFERENCES users(id),
    usuario_nombre TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_cash_entries_session ON cash_entries(session_id, fecha);

  ALTER TABLE sales ADD COLUMN cash_session_id INTEGER REFERENCES cash_sessions(id);

  -- Una venta puede pagarse con varios medios (ej: parte efectivo, parte transferencia).
  CREATE TABLE sale_payments (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    metodo_pago TEXT NOT NULL,
    monto REAL NOT NULL CHECK (monto > 0)
  );
  CREATE INDEX idx_sale_payments_sale ON sale_payments(sale_id);
  INSERT INTO sale_payments (sale_id, metodo_pago, monto) SELECT id, metodo_pago, total FROM sales WHERE total > 0;
  `,
];

let db = null;
let txDepth = 0;

function initDb(file) {
  if (db) db.close();
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  migrate(db);
  return db;
}

function migrate(database) {
  const { user_version: current } = database.prepare("PRAGMA user_version").get();
  for (let v = current; v < MIGRATIONS.length; v++) {
    database.exec("BEGIN");
    try {
      database.exec(MIGRATIONS[v]);
      database.exec(`PRAGMA user_version = ${v + 1}`);
      database.exec("COMMIT");
    } catch (err) {
      database.exec("ROLLBACK");
      throw new Error(`Falló la migración ${v + 1}: ${err.message}`);
    }
  }
}

function getDb() {
  if (!db) throw new Error("Base de datos no inicializada");
  return db;
}

function closeDb() {
  if (db) db.close();
  db = null;
}

// Ejecuta fn dentro de una transacción. Las llamadas anidadas se unen a la transacción externa.
function tx(fn) {
  const d = getDb();
  if (txDepth > 0) return fn(d);
  d.exec("BEGIN IMMEDIATE");
  txDepth++;
  try {
    const result = fn(d);
    d.exec("COMMIT");
    return result;
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  } finally {
    txDepth--;
  }
}

const nowIso = () => new Date().toISOString();

module.exports = { initDb, getDb, closeDb, tx, nowIso };
