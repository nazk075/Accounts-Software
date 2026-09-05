import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
const DB_FILE = path.join(process.cwd(), 'database.sqlite');
let inTransaction = false;

export function beginTx() {
  if (!db) throw new Error('Database not initialized');
  db.run('BEGIN TRANSACTION;');
  inTransaction = true;
}

export function commitTx() {
  if (!db) throw new Error('Database not initialized');
  db.run('COMMIT;');
  inTransaction = false;
  saveDb();
}

export function rollbackTx() {
  if (!db) return;
  try {
    db.run('ROLLBACK;');
  } catch (_e) {}
  inTransaction = false;
}

export function saveDb() {
  if (!db || inTransaction) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

export async function getDb(): Promise<Database> {
  if (db) return db;

  if (!SQL) {
    SQL = await initSqlJs();
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const filebuffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(filebuffer);
    } catch (err) {
      console.error('Error reading existing database file, creating fresh DB:', err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  initTables(db);
  seedInitialDataIfEmpty(db);
  saveDb();
  return db;
}

export function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function runQuery(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  const rowid = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
  if (!inTransaction) {
    saveDb();
  }
  return {
    lastInsertRowid: rowid?.id ?? 0,
    changes: db.getRowsModified(),
  };
}

function initTables(database: Database) {
  database.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      batch_number TEXT NOT NULL UNIQUE,
      quantity REAL NOT NULL,
      unit_purchase_price REAL NOT NULL,
      total_amount REAL NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_number TEXT NOT NULL UNIQUE,
      purchase_date TEXT NOT NULL,
      original_quantity REAL NOT NULL,
      remaining_quantity REAL NOT NULL,
      unit_cost REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      quantity REAL NOT NULL,
      selling_price REAL NOT NULL,
      total_sales REAL NOT NULL,
      total_cost REAL NOT NULL,
      profit REAL NOT NULL,
      amount_paid REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'UNPAID',
      delivered_quantity REAL DEFAULT 0,
      delivery_status TEXT DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS sale_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      date TEXT NOT NULL,
      quantity REAL NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_batch_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      batch_id INTEGER NOT NULL REFERENCES stock_batches(id),
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      date TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      reference TEXT,
      quantity REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      delivered_quantity REAL DEFAULT 0,
      pending_units REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS item_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      reference TEXT,
      batch_id INTEGER REFERENCES stock_batches(id),
      stock_in REAL DEFAULT 0,
      stock_out REAL DEFAULT 0,
      running_balance REAL DEFAULT 0
    );
  `);

  // Safe runtime migrations for existing databases
  try {
    database.run('ALTER TABLE sales ADD COLUMN amount_paid REAL DEFAULT 0;');
  } catch (_e) {}
  try {
    database.run("ALTER TABLE sales ADD COLUMN payment_status TEXT DEFAULT 'UNPAID';");
  } catch (_e) {}
  try {
    database.run('ALTER TABLE sales ADD COLUMN delivered_quantity REAL DEFAULT 0;');
  } catch (_e) {}
  try {
    database.run("ALTER TABLE sales ADD COLUMN delivery_status TEXT DEFAULT 'PENDING';");
  } catch (_e) {}
  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS sale_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL REFERENCES sales(id),
        date TEXT NOT NULL,
        quantity REAL NOT NULL,
        notes TEXT
      );
    `);
  } catch (_e) {}

  try {
    database.run('ALTER TABLE customer_ledger ADD COLUMN delivered_quantity REAL DEFAULT 0;');
  } catch (_e) {}
  try {
    database.run('ALTER TABLE customer_ledger ADD COLUMN pending_units REAL DEFAULT 0;');
  } catch (_e) {}

  // Synchronize payment_status and delivery_status for existing sales if needed
  try {
    database.run(`
      UPDATE sales 
      SET payment_status = CASE 
        WHEN amount_paid >= total_sales THEN 'PAID'
        WHEN amount_paid > 0 THEN 'PARTIAL'
        ELSE 'UNPAID'
      END
      WHERE payment_status IS NULL OR payment_status = '';
    `);
    database.run(`
      UPDATE sales 
      SET delivery_status = CASE 
        WHEN delivered_quantity >= quantity THEN 'DELIVERED'
        WHEN delivered_quantity > 0 THEN 'PARTIAL'
        ELSE 'PENDING'
      END
      WHERE delivery_status IS NULL OR delivery_status = '';
    `);
  } catch (_e) {}
}

export function seedInitialDataIfEmpty(database: Database) {
  // Check if customers or batches exist
  const res = database.exec('SELECT COUNT(*) as cnt FROM customers');
  const customerCount = res.length > 0 && res[0].values.length > 0 ? (res[0].values[0][0] as number) : 0;
  if (customerCount > 0) return;

  console.log('Seeding initial business data...');

  // Set default settings
  database.run(`
    INSERT OR REPLACE INTO settings (key, value) VALUES 
      ('product_name', 'Commercial Grade Coffee Beans (1kg Bag)'),
      ('currency_symbol', '$'),
      ('unit_name', 'Bags')
  `);

  const today = new Date().toISOString().split('T')[0];
  const dateAgo3 = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
  const dateAgo2 = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
  const dateAgo1 = new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0];

  // Customers
  database.run(`
    INSERT INTO customers (id, name, phone, address, created_at) VALUES
      (1, 'Metro Cafe & Roastery', '+1 (555) 234-5678', '452 Downtown Ave, Suite 100', '${dateAgo3}'),
      (2, 'Sunrise Espresso Bar', '+1 (555) 345-6789', '120 Ocean View Blvd', '${dateAgo3}'),
      (3, 'Blue Sky Bistro & Bakery', '+1 (555) 456-7890', '88 Main Street', '${dateAgo2}'),
      (4, 'Summit Coffee Corner', '+1 (555) 567-8901', '304 Highland Rd', '${dateAgo1}')
  `);

  // Batch 001 Purchase
  // Quantity: 75 units, Purchase price: 26.50
  database.run(`
    INSERT INTO purchases (id, date, batch_number, quantity, unit_purchase_price, total_amount, notes)
    VALUES (1, '${dateAgo3}', 'BATCH-001', 75, 26.50, 1987.50, 'Initial wholesale shipment from Origin Imports');

    INSERT INTO stock_batches (id, batch_number, purchase_date, original_quantity, remaining_quantity, unit_cost)
    VALUES (1, 'BATCH-001', '${dateAgo3}', 75, 75, 26.50);

    INSERT INTO item_ledger (date, transaction_type, reference, batch_id, stock_in, stock_out, running_balance)
    VALUES ('${dateAgo3}', 'PURCHASE', 'Purchase BATCH-001', 1, 75, 0, 75);
  `);

  // Batch 002 Purchase
  // Quantity: 63 units, Purchase price: 26.20
  database.run(`
    INSERT INTO purchases (id, date, batch_number, quantity, unit_purchase_price, total_amount, notes)
    VALUES (2, '${dateAgo2}', 'BATCH-002', 63, 26.20, 1650.60, 'Bulk discount supplier delivery');

    INSERT INTO stock_batches (id, batch_number, purchase_date, original_quantity, remaining_quantity, unit_cost)
    VALUES (2, 'BATCH-002', '${dateAgo2}', 63, 63, 26.20);

    INSERT INTO item_ledger (date, transaction_type, reference, batch_id, stock_in, stock_out, running_balance)
    VALUES ('${dateAgo2}', 'PURCHASE', 'Purchase BATCH-002', 2, 63, 0, 138);
  `);

  // Sale 1: Metro Cafe, 20 units from Batch 001 at $32.00
  // Cost: 20 * 26.50 = 530. Total: 640. Profit: 110.
  database.run(`
    UPDATE stock_batches SET remaining_quantity = remaining_quantity - 20 WHERE id = 1;

    INSERT INTO sales (id, date, customer_id, quantity, selling_price, total_sales, total_cost, profit, amount_paid, payment_status, delivered_quantity, delivery_status)
    VALUES (1, '${dateAgo2}', 1, 20, 32.00, 640.00, 530.00, 110.00, 400.00, 'PARTIAL', 20, 'DELIVERED');

    INSERT INTO sale_deliveries (sale_id, date, quantity, notes)
    VALUES (1, '${dateAgo2}', 20, 'Delivered full batch shipment to store');

    INSERT INTO sale_batch_details (sale_id, batch_id, quantity, unit_cost, total_cost)
    VALUES (1, 1, 20, 26.50, 530.00);

    INSERT INTO item_ledger (date, transaction_type, reference, batch_id, stock_in, stock_out, running_balance)
    VALUES ('${dateAgo2}', 'SALE', 'Sale #1 (Metro Cafe & Roastery)', 1, 0, 20, 118);

    INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units)
    VALUES (1, '${dateAgo2}', 'SALE', 'Sale #1 (20 Bags @ $32.00)', 20, 32.00, 640.00, 0, 640.00, 0, 20);

    INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units)
    VALUES (1, '${dateAgo2}', 'DELIVERY', 'Dispatch for Sale #1 (20 bags delivered)', 0, 32.00, 0, 0, 640.00, 20, 0);
  `);

  // Sale 2: Sunrise Espresso Bar, 15 units from Batch 002 at $31.50
  // Cost: 15 * 26.20 = 393. Total: 472.50. Profit: 79.50.
  database.run(`
    UPDATE stock_batches SET remaining_quantity = remaining_quantity - 15 WHERE id = 2;

    INSERT INTO sales (id, date, customer_id, quantity, selling_price, total_sales, total_cost, profit, amount_paid, payment_status, delivered_quantity, delivery_status)
    VALUES (2, '${dateAgo1}', 2, 15, 31.50, 472.50, 393.00, 79.50, 200.00, 'PARTIAL', 10, 'PARTIAL');

    INSERT INTO sale_deliveries (sale_id, date, quantity, notes)
    VALUES (2, '${dateAgo1}', 10, 'Dispatched 10 bags initially; 5 bags pending delivery');

    INSERT INTO sale_batch_details (sale_id, batch_id, quantity, unit_cost, total_cost)
    VALUES (2, 2, 15, 26.20, 393.00);

    INSERT INTO item_ledger (date, transaction_type, reference, batch_id, stock_in, stock_out, running_balance)
    VALUES ('${dateAgo1}', 'SALE', 'Sale #2 (Sunrise Espresso Bar)', 2, 0, 15, 103);

    INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units)
    VALUES (2, '${dateAgo1}', 'SALE', 'Sale #2 (15 Bags @ $31.50)', 15, 31.50, 472.50, 0, 472.50, 0, 15);

    INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units)
    VALUES (2, '${dateAgo1}', 'DELIVERY', 'Dispatch for Sale #2 (10 bags delivered, 5 bags pending)', 0, 31.50, 0, 0, 472.50, 10, 5);
  `);

  // Collection 1: Metro Cafe pays $400 via Bank Transfer yesterday
  database.run(`
    INSERT INTO collections (id, customer_id, date, amount, payment_method, notes)
    VALUES (1, 1, '${dateAgo1}', 400.00, 'Bank Transfer', 'Partial payment for invoice #1');

    INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units)
    VALUES (1, '${dateAgo1}', 'COLLECTION', 'Collection #1 (Bank Transfer)', 0, 0, 0, 400.00, 240.00, 0, 0);
  `);

  // Collection 2: Sunrise Espresso Bar pays $200 via Cash today
  database.run(`
    INSERT INTO collections (id, customer_id, date, amount, payment_method, notes)
    VALUES (2, 2, '${today}', 200.00, 'Cash', 'Counter collection');

    INSERT INTO customer_ledger (customer_id, date, transaction_type, reference, quantity, rate, debit, credit, balance, delivered_quantity, pending_units)
    VALUES (2, '${today}', 'COLLECTION', 'Collection #2 (Cash)', 0, 0, 0, 200.00, 272.50, 0, 5);
  `);
}

export async function resetDatabase() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      fs.unlinkSync(DB_FILE);
    } catch (e) {
      console.error(e);
    }
  }
  db = new SQL.Database();
  initTables(db);
  seedInitialDataIfEmpty(db);
  saveDb();
}

export async function wipeDatabase(keepCustomers = false) {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  if (!db) {
    await getDb();
  }
  if (db) {
    db.run('PRAGMA foreign_keys = OFF;');
    db.run(`
      DELETE FROM sale_batch_details;
      DELETE FROM sale_deliveries;
      DELETE FROM sales;
      DELETE FROM collections;
      DELETE FROM customer_ledger;
      DELETE FROM item_ledger;
      DELETE FROM stock_batches;
      DELETE FROM purchases;
    `);
    if (!keepCustomers) {
      db.run('DELETE FROM customers;');
      try {
        db.run("DELETE FROM sqlite_sequence WHERE name IN ('sale_batch_details', 'sale_deliveries', 'sales', 'collections', 'customer_ledger', 'item_ledger', 'stock_batches', 'purchases', 'customers');");
      } catch (_e) {}
    } else {
      try {
        db.run("DELETE FROM sqlite_sequence WHERE name IN ('sale_batch_details', 'sale_deliveries', 'sales', 'collections', 'customer_ledger', 'item_ledger', 'stock_batches', 'purchases');");
      } catch (_e) {}
    }
    saveDb();
  }
}

