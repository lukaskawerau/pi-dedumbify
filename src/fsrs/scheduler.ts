import { createHash } from "node:crypto";

import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";

import type { ReviewRating } from "../types/grade.js";
import type { PersistReviewInput } from "../types/review.js";

const scheduler = fsrs();

export interface ScheduledReview {
  dueAt: string;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  reps: number;
  lapses: number;
  state: string;
  lastReviewAt: string;
  lastRating: number;
  answerHash: string;
}

export function scheduleReview(input: PersistReviewInput): ScheduledReview {
  const reviewedAt = input.reviewedAt ?? new Date();
  const priorCard = toFsrsCard(input);
  const rating = toFsrsRating(input.rating);
  const next = scheduler.next(priorCard, reviewedAt, rating);
  const nextCard = next.card;

  return {
    dueAt: nextCard.due.toISOString(),
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    elapsedDays: nextCard.elapsed_days,
    scheduledDays: nextCard.scheduled_days,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    state: (State[nextCard.state] ?? "Review").toLowerCase(),
    lastReviewAt: reviewedAt.toISOString(),
    lastRating: rating,
    answerHash: hashAnswer(input.answer),
  };
}

function toFsrsCard(input: PersistReviewInput): Card {
  const state = input.reviewCard.state;
  const now = input.reviewedAt ?? new Date();
  const empty = createEmptyCard(now);

  empty.state = toFsrsState(state.state);
  empty.due = state.dueAt ? new Date(state.dueAt) : empty.due;
  empty.stability = state.stability ?? empty.stability;
  empty.difficulty = state.difficulty ?? empty.difficulty;
  empty.elapsed_days = state.elapsedDays ?? empty.elapsed_days;
  empty.scheduled_days = state.scheduledDays ?? empty.scheduled_days;
  empty.reps = state.reps;
  empty.lapses = state.lapses;
  empty.last_review = state.lastReviewAt ? new Date(state.lastReviewAt) : undefined;

  return empty;
}

function toFsrsRating(rating: ReviewRating): Grade {
  switch (rating) {
    case "again":
      return Rating.Again;
    case "hard":
      return Rating.Hard;
    case "good":
      return Rating.Good;
    case "easy":
      return Rating.Easy;
  }
}

function toFsrsState(state: string): State {
  switch (state.toLowerCase()) {
    case "learning":
      return State.Learning;
    case "review":
      return State.Review;
    case "relearning":
      return State.Relearning;
    default:
      return State.New;
  }
}

function hashAnswer(answer: string): string {
  return createHash("sha256").update(answer).digest("hex");
}
