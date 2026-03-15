import type { CardDefinition, CardSyncResult, CardValidationIssue, CardValidationResult } from "../types/card.js";
import { getCardsRoot } from "../config/paths.js";
import { discoverCardDirectories } from "./discover.js";
import { validateCardDirectory } from "./validate-card.js";

export async function syncCardDefinitions(cardsRoot = getCardsRoot()): Promise<CardSyncResult> {
  const discoveredCardDirs = await discoverCardDirectories(cardsRoot);
  const results = await Promise.all(discoveredCardDirs.map((cardDir) => validateCardDirectory(cardDir)));

  applyDuplicateIdIssues(results);

  return {
    cardsRoot,
    discoveredCardDirs,
    results,
    validCards: results.flatMap((result) => (result.card && result.issues.length === 0 ? [result.card] : [])),
  };
}

function applyDuplicateIdIssues(results: CardValidationResult[]): void {
  const resultsById = new Map<string, CardValidationResult[]>();

  for (const result of results) {
    if (!result.card?.id) {
      continue;
    }

    const matches = resultsById.get(result.card.id) ?? [];
    matches.push(result);
    resultsById.set(result.card.id, matches);
  }

  for (const [cardId, matches] of resultsById) {
    if (matches.length < 2) {
      continue;
    }

    for (const match of matches) {
      addIssue(match, {
        code: "CARD_ID_DUPLICATE",
        message: `Duplicate card id: ${cardId}`,
        field: "id",
      });
    }
  }
}

function addIssue(result: CardValidationResult, issue: CardValidationIssue): void {
  if (!result.issues.some((existing) => existing.code === issue.code && existing.message === issue.message)) {
    result.issues.push(issue);
  }
}

export function summarizeSyncResult(syncResult: CardSyncResult): string[] {
  const invalidResults = syncResult.results.filter((result) => result.issues.length > 0);

  const lines = [
    `cards root: ${syncResult.cardsRoot}`,
    `discovered: ${syncResult.discoveredCardDirs.length}`,
    `valid: ${syncResult.validCards.length}`,
    `invalid: ${invalidResults.length}`,
  ];

  if (invalidResults.length > 0) {
    lines.push("");
    lines.push("invalid cards:");
    for (const result of invalidResults) {
      lines.push(`- ${result.cardId ?? "(unknown id)"} — ${result.cardDir}`);
      for (const issue of result.issues) {
        lines.push(`  - [${issue.code}] ${issue.message}`);
      }
    }
  }

  return lines;
}
