import db from '../db/index.js';

export interface WalletRow {
  id: string;
  label: string;
  address: string;
  chains_json: string;
}

export function listWalletRows() {
  return db.prepare('SELECT * FROM wallets ORDER BY label, address').all() as WalletRow[];
}

export function insertWallet(id: string, label: string, address: string, chains: string[]) {
  db.prepare('INSERT INTO wallets (id, label, address, chains_json) VALUES (?, ?, ?, ?)')
    .run(id, label, address, JSON.stringify(chains));
}

export function updateWalletLabel(id: string, label: string) {
  return db.prepare('UPDATE wallets SET label = ? WHERE id = ?').run(label, id);
}

export function deleteWallet(id: string) {
  return db.prepare('DELETE FROM wallets WHERE id = ?').run(id);
}
