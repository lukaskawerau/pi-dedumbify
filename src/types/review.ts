import type { CardDefinition } from "./card.js";
import type { GradeResult, ReviewRating } from "./grade.js";

export interface CardStateRecord {
  cardId: string;
  dueAt?: string;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  reps: number;
  lapses: number;
  lastReviewAt?: string;
  lastRating?: number;
  state: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCard {
  definition: CardDefinition;
  state: CardStateRecord;
}

export interface PersistReviewInput {
  reviewCard: ReviewCard;
  rating: ReviewRating;
  gradeResult: GradeResult;
  answer: string;
  reviewedAt?: Date;
  elapsedMs?: number;
}
