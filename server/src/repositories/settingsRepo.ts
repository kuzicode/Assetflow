import db from '../db/index.js';

export function getSettingsMap() {
  const rows: Array<{ key: string; value: string }> = db.prepare('SELECT * FROM settings').all() as Array<{ key: string; value: string }>;
  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

export function getSetting(key: string) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function upsertSettings(updates: Record<string, string>) {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  const transaction = db.transaction((entries: Array<[string, string]>) => {
    for (const [key, value] of entries) {
      upsert.run(key, value);
    }
  });

  transaction(Object.entries(updates));
}
