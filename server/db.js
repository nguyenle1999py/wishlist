import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

export const DATA_DIR = process.env.DATA_DIR || path.join(root, "data");
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(root, "uploads");
export const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "wishlist.db");

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function openDb() {
  ensureDirs();
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      image_path TEXT,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wishes_sort ON wishes(sort_order);
  `);
}
