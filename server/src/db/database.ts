import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.resolve(__dirname, '../../data');
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const PHOTOS_DIR = path.join(UPLOADS_DIR, 'photos');
const DOCS_DIR = path.join(UPLOADS_DIR, 'documents');
const GENERATED_DIR = path.join(UPLOADS_DIR, 'generated');
const BACKUPS_DIR = path.resolve(__dirname, '../../backups');

for (const dir of [DATA_DIR, UPLOADS_DIR, PHOTOS_DIR, DOCS_DIR, GENERATED_DIR, BACKUPS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'bgcyouth.db');
export const PATHS = {
  DATA_DIR,
  UPLOADS_DIR,
  PHOTOS_DIR,
  DOCS_DIR,
  GENERATED_DIR,
  BACKUPS_DIR,
  DB_PATH,
};

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA journal_mode = WAL;');
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function getDbSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}

export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  }
}

export function initDatabase(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'auditor', 'staff', 'viewer')),
      position TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT UNIQUE,
      item_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
      total_value REAL NOT NULL DEFAULT 0,
      min_stock_level REAL NOT NULL DEFAULT 5 CHECK(min_stock_level >= 0),
      supplier TEXT NOT NULL DEFAULT '',
      date_purchased TEXT NOT NULL DEFAULT '',
      condition TEXT NOT NULL CHECK(condition IN ('New', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Condemned')),
      remarks TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
      item_name TEXT NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN (
        'Initial Entry', 'Update', 'Stock In', 'Stock Out',
        'Adjustment', 'Damage Write-Off', 'Audit Reconciliation', 'Deletion'
      )),
      previous_qty REAL NOT NULL,
      change_qty REAL NOT NULL,
      new_qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_value_after REAL NOT NULL,
      reference_no TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      performed_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_ref TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      audit_date TEXT NOT NULL,
      auditor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      auditor_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'In Progress', 'Completed')),
      findings TEXT NOT NULL DEFAULT '',
      recommendations TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      approved_by TEXT NOT NULL DEFAULT '',
      reconciled_inventory INTEGER NOT NULL DEFAULT 0,
      finalized_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      finalized_by_name TEXT NOT NULL DEFAULT '',
      finalized_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS audit_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
      inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
      item_code TEXT NOT NULL DEFAULT '',
      item_name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      recorded_qty REAL NOT NULL,
      actual_qty REAL NOT NULL,
      discrepancy REAL NOT NULL,
      recorded_value REAL NOT NULL,
      actual_value REAL NOT NULL,
      financial_difference REAL NOT NULL,
      recorded_condition TEXT NOT NULL DEFAULT '',
      observed_condition TEXT NOT NULL CHECK(observed_condition IN ('New', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Condemned', 'Missing')),
      remarks TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS audit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      performed_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL CHECK(doc_type IN (
        'Audit Report', 'Financial Summary', 'Excel Export',
        'Supporting Document', 'Database Backup'
      )),
      reference_no TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      related_module TEXT NOT NULL DEFAULT '',
      related_id INTEGER,
      generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      generated_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS inventory_history_archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_ref TEXT UNIQUE NOT NULL,
      period_label TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('Print Report', 'Audit Completed', 'Weekly Sunday Reset')),
      audit_id INTEGER REFERENCES audits(id) ON DELETE SET NULL,
      audit_ref TEXT NOT NULL DEFAULT '',
      audit_details_json TEXT NOT NULL DEFAULT '{}',
      registered_item_count INTEGER NOT NULL DEFAULT 0,
      total_units REAL NOT NULL DEFAULT 0,
      total_inventory_value REAL NOT NULL DEFAULT 0,
      performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      performed_by_name TEXT NOT NULL,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS inventory_history_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_id INTEGER NOT NULL REFERENCES inventory_history_archives(id) ON DELETE CASCADE,
      original_item_id INTEGER,
      item_code TEXT NOT NULL DEFAULT '',
      item_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'General',
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      total_value REAL NOT NULL,
      min_stock_level REAL NOT NULL DEFAULT 5,
      supplier TEXT NOT NULL DEFAULT '',
      date_purchased TEXT NOT NULL DEFAULT '',
      condition TEXT NOT NULL,
      remarks TEXT NOT NULL DEFAULT '',
      original_created_at TEXT NOT NULL DEFAULT '',
      original_updated_at TEXT NOT NULL DEFAULT ''
    );
  `);

  const defaultSettings: Record<string, string> = {
    organization_name: 'Butuan Gospel Church Youth (BGCyouth)',
    barangay_location: 'Butuan City, Philippines',
    default_approving_officer: 'Church Board',
    default_min_stock_level: '5',
    report_footer_note: 'Official BGC Youth Property & Audit Record',
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }

  // Ensure legacy Barangay/SK defaults from earlier runs are migrated to Church defaults
  db.prepare("UPDATE system_settings SET value = 'Butuan Gospel Church Youth (BGCyouth)' WHERE key = 'organization_name' AND value LIKE '%Barangay%'").run();
  db.prepare("UPDATE system_settings SET value = 'Church Board' WHERE key = 'default_approving_officer' AND value IN ('SK Chairperson', 'BGC Youth President')").run();
  db.prepare("UPDATE system_settings SET value = 'Official BGC Youth Property & Audit Record' WHERE key = 'report_footer_note' AND value LIKE '%Barangay%'").run();

  // Bootstrap initial system administrator ONLY if no users exist.
  // No inventory items, audits, CVs, or fake statistics are seeded.
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync('Admin@BGCyouth2026', 12);
    db.prepare(`
      INSERT INTO users (username, full_name, email, password_hash, role, position, is_active)
      VALUES (?, ?, ?, ?, 'admin', ?, 1)
    `).run('admin', 'System Administrator', 'admin@bgcyouth.local', hash, 'BGC Youth System Administrator');
  }
}
