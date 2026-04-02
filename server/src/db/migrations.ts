import type { Database as DatabaseType } from 'better-sqlite3';

interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseType) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'add pnl tracking columns',
    up: (db) => {
      const columns: Array<{ name: string }> = db.prepare("PRAGMA table_info('pnl_records')").all() as Array<{ name: string }>;
      const existing = new Set(columns.map((column) => column.name));
      const ensureColumn = (name: string, sql: string) => {
        if (!existing.has(name)) db.exec(sql);
      };

      ensureColumn('status', "ALTER TABLE pnl_records ADD COLUMN status TEXT NOT NULL DEFAULT 'settled'");
      ensureColumn('auto_accumulate', 'ALTER TABLE pnl_records ADD COLUMN auto_accumulate INTEGER NOT NULL DEFAULT 0');
      ensureColumn('editable', 'ALTER TABLE pnl_records ADD COLUMN editable INTEGER NOT NULL DEFAULT 0');
      ensureColumn('income_uniswap', 'ALTER TABLE pnl_records ADD COLUMN income_uniswap REAL NOT NULL DEFAULT 0');
      ensureColumn('income_morpho', 'ALTER TABLE pnl_records ADD COLUMN income_morpho REAL NOT NULL DEFAULT 0');
      ensureColumn('income_hlp', 'ALTER TABLE pnl_records ADD COLUMN income_hlp REAL NOT NULL DEFAULT 0');
      ensureColumn('income_total', 'ALTER TABLE pnl_records ADD COLUMN income_total REAL NOT NULL DEFAULT 0');
      ensureColumn('last_uniswap_value', 'ALTER TABLE pnl_records ADD COLUMN last_uniswap_value REAL NOT NULL DEFAULT 0');
      ensureColumn('last_morpho_value', 'ALTER TABLE pnl_records ADD COLUMN last_morpho_value REAL NOT NULL DEFAULT 0');
      ensureColumn('last_hlp_value', 'ALTER TABLE pnl_records ADD COLUMN last_hlp_value REAL NOT NULL DEFAULT 0');
      ensureColumn('last_auto_update_at', 'ALTER TABLE pnl_records ADD COLUMN last_auto_update_at TEXT');
      ensureColumn('base_pnl', 'ALTER TABLE pnl_records ADD COLUMN base_pnl REAL NOT NULL DEFAULT 0');

      db.exec("UPDATE pnl_records SET status = 'settled' WHERE status IS NULL OR status = ''");
    },
  },
];

export function runMigrations(db: DatabaseType) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>).map((row) => row.version)
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const applyMigration = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
    });
    applyMigration();
  }
}
