import { mkdir } from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

import { getDatabasePath } from "../config/paths.js";
import { migrateSchema } from "./schema.js";

export async function withDatabase<T>(
  callback: (db: Database.Database) => T,
  dbPath = getDatabasePath(),
): Promise<T> {
  await mkdir(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrateSchema(db);
    return callback(db);
  } finally {
    db.close();
  }
}
