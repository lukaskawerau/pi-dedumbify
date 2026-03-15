import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { validateCardDirectory } from "../cards/validate-card.js";
import { getDatabasePath } from "../config/paths.js";
import { scheduleReview } from "../fsrs/scheduler.js";
import type { PersistReviewInput, ReviewCard } from "../types/review.js";
import { withDatabase } from "./sqlite.js";

export async function recordReview(input: PersistReviewInput, dbPath = getDatabasePath()): Promise<void> {
  return withDatabase((db) => {
    persistReview(db, input);
  }, dbPath);
}

export function persistReview(db: Database.Database, input: PersistReviewInput): void {
  const reviewedAt = input.reviewedAt ?? new Date();
  const scheduled = scheduleReview({ ...input, reviewedAt });

  const insertReview = db.prepare(`
    insert into reviews (
      id,
      card_id,
      reviewed_at,
      rating,
      elapsed_ms,
      passed,
      test_summary,
      stdout,
      stderr,
      answer_hash,
      content_hash
    ) values (
      @id,
      @cardId,
      @reviewedAt,
      @rating,
      @elapsedMs,
      @passed,
      @testSummary,
      @stdout,
      @stderr,
      @answerHash,
      @contentHash
    )
  `);

  const updateState = db.prepare(`
    update card_state
    set due_at = @dueAt,
        stability = @stability,
        difficulty = @difficulty,
        elapsed_days = @elapsedDays,
        scheduled_days = @scheduledDays,
        reps = @reps,
        lapses = @lapses,
        last_review_at = @lastReviewAt,
        last_rating = @lastRating,
        state = @state,
        updated_at = @updatedAt
    where card_id = @cardId
  `);

  const transaction = db.transaction(() => {
    insertReview.run({
      id: randomUUID(),
      cardId: input.reviewCard.definition.id,
      reviewedAt: reviewedAt.toISOString(),
      rating: scheduled.lastRating,
      elapsedMs: input.elapsedMs ?? null,
      passed: input.gradeResult.passed ? 1 : 0,
      testSummary: input.gradeResult.summary,
      stdout: input.gradeResult.stdout,
      stderr: input.gradeResult.stderr,
      answerHash: scheduled.answerHash,
      contentHash: input.reviewCard.definition.contentHash,
    });

    updateState.run({
      cardId: input.reviewCard.definition.id,
      dueAt: scheduled.dueAt,
      stability: scheduled.stability ?? null,
      difficulty: scheduled.difficulty ?? null,
      elapsedDays: scheduled.elapsedDays ?? null,
      scheduledDays: scheduled.scheduledDays ?? null,
      reps: scheduled.reps,
      lapses: scheduled.lapses,
      lastReviewAt: scheduled.lastReviewAt,
      lastRating: scheduled.lastRating,
      state: scheduled.state,
      updatedAt: reviewedAt.toISOString(),
    });
  });

  transaction();
}

export function getSuggestedRatings(gradePassed: boolean) {
  return gradePassed ? ["good", "easy", "hard", "again"] as const : ["again", "hard", "good", "easy"] as const;
}

export async function getNextReviewCard(dbPath = getDatabasePath()): Promise<ReviewCard | undefined> {
  const row = await withDatabase((db) => {
    return db.prepare(`
      select
        c.id,
        c.title,
        c.language,
        c.path,
        c.content_hash,
        s.card_id,
        s.due_at,
        s.stability,
        s.difficulty,
        s.elapsed_days,
        s.scheduled_days,
        s.reps,
        s.lapses,
        s.last_review_at,
        s.last_rating,
        s.state,
        s.created_at,
        s.updated_at
      from cards c
      join card_state s on s.card_id = c.id
      where c.active = 1
        and (lower(s.state) = 'new' or (s.due_at is not null and julianday(s.due_at) <= julianday('now')))
      order by
        case when s.due_at is not null and julianday(s.due_at) <= julianday('now') then 0 else 1 end,
        julianday(s.due_at) asc,
        s.created_at asc
      limit 1
    `).get() as DatabaseRow | undefined;
  }, dbPath);

  if (!row) {
    return undefined;
  }

  const validation = await validateCardDirectory(row.path);
  if (!validation.card || validation.issues.length > 0) {
    throw new Error(`Card at ${row.path} is no longer valid`);
  }

  validation.card.contentHash = row.content_hash;

  return {
    definition: validation.card,
    state: {
      cardId: row.card_id,
      dueAt: row.due_at ?? undefined,
      stability: row.stability ?? undefined,
      difficulty: row.difficulty ?? undefined,
      elapsedDays: row.elapsed_days ?? undefined,
      scheduledDays: row.scheduled_days ?? undefined,
      reps: row.reps,
      lapses: row.lapses,
      lastReviewAt: row.last_review_at ?? undefined,
      lastRating: row.last_rating ?? undefined,
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}

interface DatabaseRow {
  id: string;
  title: string;
  language: "typescript" | "python";
  path: string;
  content_hash: string;
  card_id: string;
  due_at: string | null;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  scheduled_days: number | null;
  reps: number;
  lapses: number;
  last_review_at: string | null;
  last_rating: number | null;
  state: string;
  created_at: string;
  updated_at: string;
}
