import type Database from "better-sqlite3";

import type { CardDefinition, CardSyncResult } from "../types/card.js";
import { getDatabasePath } from "../config/paths.js";
import { withDatabase } from "./sqlite.js";

export interface PersistedSyncSummary {
  cardsRoot: string;
  discoveredCount: number;
  validCount: number;
  invalidCount: number;
  activeCount: number;
}

export async function syncCardsToDatabase(
  syncResult: CardSyncResult,
  dbPath = getDatabasePath(),
): Promise<PersistedSyncSummary> {
  return withDatabase((db) => {
    persistSyncResult(db, syncResult);

    const activeCount = getCount(db, "select count(*) as count from cards where active = 1");
    const invalidCount = syncResult.results.filter((result) => result.issues.length > 0).length;

    return {
      cardsRoot: syncResult.cardsRoot,
      discoveredCount: syncResult.discoveredCardDirs.length,
      validCount: syncResult.validCards.length,
      invalidCount,
      activeCount,
    };
  }, dbPath);
}

export function persistSyncResult(db: Database.Database, syncResult: CardSyncResult): void {
  const now = new Date().toISOString();
  const validPaths = syncResult.validCards.map((card) => card.path);

  const deactivateAll = db.prepare("update cards set active = 0");
  const deactivateMissing = db.prepare(
    `update cards set active = 0 where path not in (${validPaths.map(() => "?").join(", ")})`,
  );
  const upsertCard = db.prepare(`
    insert into cards (
      id,
      title,
      language,
      path,
      tags_json,
      timebox_sec,
      content_hash,
      active,
      updated_at
    ) values (
      @id,
      @title,
      @language,
      @path,
      @tagsJson,
      @timeboxSec,
      @contentHash,
      1,
      @updatedAt
    )
    on conflict(id) do update set
      title = excluded.title,
      language = excluded.language,
      path = excluded.path,
      tags_json = excluded.tags_json,
      timebox_sec = excluded.timebox_sec,
      content_hash = excluded.content_hash,
      active = 1,
      updated_at = excluded.updated_at
  `);
  const insertState = db.prepare(`
    insert into card_state (
      card_id,
      due_at,
      stability,
      difficulty,
      elapsed_days,
      scheduled_days,
      reps,
      lapses,
      last_review_at,
      last_rating,
      state,
      created_at,
      updated_at
    ) values (
      @cardId,
      null,
      null,
      null,
      null,
      null,
      0,
      0,
      null,
      null,
      'new',
      @createdAt,
      @updatedAt
    )
    on conflict(card_id) do nothing
  `);

  const transaction = db.transaction(() => {
    if (validPaths.length === 0) {
      deactivateAll.run();
    } else {
      deactivateMissing.run(...validPaths);
    }

    for (const card of syncResult.validCards) {
      upsertCard.run(toCardRow(card, now));
      insertState.run({
        cardId: card.id,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  transaction();
}

function toCardRow(card: CardDefinition, now: string) {
  return {
    id: card.id,
    title: card.title,
    language: card.language,
    path: card.path,
    tagsJson: JSON.stringify(card.tags),
    timeboxSec: card.timeboxSec ?? null,
    contentHash: card.contentHash,
    updatedAt: now,
  };
}

function getCount(db: Database.Database, sql: string): number {
  const row = db.prepare(sql).get() as { count: number };
  return row.count;
}
