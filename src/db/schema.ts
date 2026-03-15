import type Database from "better-sqlite3";

export function migrateSchema(db: Database.Database): void {
  db.exec(`
    pragma foreign_keys = on;

    create table if not exists cards (
      id text primary key,
      title text not null,
      language text not null check (language in ('typescript', 'python')),
      path text not null,
      tags_json text not null,
      timebox_sec integer,
      content_hash text not null,
      active integer not null default 1,
      updated_at text not null
    );

    create table if not exists card_state (
      card_id text primary key references cards(id) on delete cascade,
      due_at text,
      stability real,
      difficulty real,
      elapsed_days real,
      scheduled_days real,
      reps integer not null default 0,
      lapses integer not null default 0,
      last_review_at text,
      last_rating integer,
      state text not null default 'new',
      created_at text not null,
      updated_at text not null
    );

    create table if not exists reviews (
      id text primary key,
      card_id text not null references cards(id) on delete cascade,
      reviewed_at text not null,
      rating integer not null,
      elapsed_ms integer,
      passed integer not null,
      test_summary text,
      stdout text,
      stderr text,
      answer_hash text,
      content_hash text not null
    );

    create index if not exists idx_cards_active on cards(active);
    create index if not exists idx_card_state_due_at on card_state(due_at);
    create index if not exists idx_reviews_card_id on reviews(card_id);
  `);
}
