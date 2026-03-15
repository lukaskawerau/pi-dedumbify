export type CardLanguage = "typescript" | "python";

export interface CardFileSet {
  prompt: string;
  starter: string;
  solution: string;
  tests: string;
}

export interface RawCardConfig {
  id?: unknown;
  title?: unknown;
  language?: unknown;
  tags?: unknown;
  timeboxSec?: unknown;
  files?: unknown;
  runner?: unknown;
}

export interface CardDefinition {
  id: string;
  title: string;
  language: CardLanguage;
  tags: string[];
  timeboxSec?: number;
  path: string;
  files: CardFileSet;
  runner: {
    entry: string;
  };
  contentHash: string;
}

export interface CardValidationIssue {
  code: string;
  message: string;
  field?: string;
}

export interface CardValidationResult {
  cardDir: string;
  cardId?: string;
  card?: CardDefinition;
  issues: CardValidationIssue[];
}

export interface CardSyncResult {
  cardsRoot: string;
  discoveredCardDirs: string[];
  results: CardValidationResult[];
  validCards: CardDefinition[];
}
