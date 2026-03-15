import type Database from "better-sqlite3";

import { getDatabasePath } from "../config/paths.js";
import { withDatabase } from "./sqlite.js";

export interface DeckStats {
  activeCards: number;
  inactiveCards: number;
  newCards: number;
  dueCards: number;
  reviewCards: number;
  learningCards: number;
  totalReviews: number;
}

export async function getDeckStats(dbPath = getDatabasePath()): Promise<DeckStats> {
  return withDatabase((db) => ({
    activeCards: count(db, "select count(*) as count from cards where active = 1"),
    inactiveCards: count(db, "select count(*) as count from cards where active = 0"),
    newCards: count(db, `
      select count(*) as count
      from card_state s
      join cards c on c.id = s.card_id
      where c.active = 1 and lower(s.state) = 'new'
    `),
    dueCards: count(db, `
      select count(*) as count
      from card_state s
      join cards c on c.id = s.card_id
      where c.active = 1 and s.due_at is not null and julianday(s.due_at) <= julianday('now')
    `),
    reviewCards: count(db, `
      select count(*) as count
      from card_state s
      join cards c on c.id = s.card_id
      where c.active = 1 and lower(s.state) = 'review'
    `),
    learningCards: count(db, `
      select count(*) as count
      from card_state s
      join cards c on c.id = s.card_id
      where c.active = 1 and lower(s.state) in ('learning', 'relearning')
    `),
    totalReviews: count(db, "select count(*) as count from reviews"),
  }), dbPath);
}

function count(db: Database.Database, sql: string): number {
  const row = db.prepare(sql).get() as { count: number };
  return row.count;
}
