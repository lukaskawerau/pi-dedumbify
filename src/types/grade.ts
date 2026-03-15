export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface GradeFailure {
  name: string;
  message: string;
  details?: string;
}

export interface GradeResult {
  passed: boolean;
  passedCount: number;
  failedCount: number;
  summary: string;
  stdout: string;
  stderr: string;
  failures: GradeFailure[];
  suggestedRating: ReviewRating;
}
