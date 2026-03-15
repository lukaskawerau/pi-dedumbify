import { loadCard } from "./load-card.js";
import { gradeSolution } from "../grading/grade-card.js";
import type { CardDefinition, CardSyncResult } from "../types/card.js";
import type { GradeResult } from "../types/grade.js";

export interface SolutionValidationEntry {
  card: CardDefinition;
  grade: GradeResult;
}

export interface SolutionValidationSummary {
  checked: number;
  failed: SolutionValidationEntry[];
}

export async function validateSolutions(syncResult: CardSyncResult): Promise<SolutionValidationSummary> {
  const failed: SolutionValidationEntry[] = [];

  for (const card of syncResult.validCards) {
    const loadedCard = await loadCard(card);
    const grade = await gradeSolution(loadedCard);

    if (!grade.passed) {
      failed.push({ card, grade });
    }
  }

  return {
    checked: syncResult.validCards.length,
    failed,
  };
}

export function summarizeValidation(syncResult: CardSyncResult, solutionSummary: SolutionValidationSummary): string[] {
  const structuralInvalid = syncResult.results.filter((result) => result.issues.length > 0);
  const lines = [
    `cards root: ${syncResult.cardsRoot}`,
    `discovered: ${syncResult.discoveredCardDirs.length}`,
    `structurally valid: ${syncResult.validCards.length}`,
    `structurally invalid: ${structuralInvalid.length}`,
    `solutions checked: ${solutionSummary.checked}`,
    `solution failures: ${solutionSummary.failed.length}`,
  ];

  if (structuralInvalid.length > 0) {
    lines.push("");
    lines.push("structural issues:");
    for (const result of structuralInvalid) {
      lines.push(`- ${result.cardId ?? "(unknown id)"} — ${result.cardDir}`);
      for (const issue of result.issues) {
        lines.push(`  - [${issue.code}] ${issue.message}`);
      }
    }
  }

  if (solutionSummary.failed.length > 0) {
    lines.push("");
    lines.push("solution failures:");
    for (const entry of solutionSummary.failed) {
      lines.push(`- ${entry.card.id} — ${entry.card.path}`);
      lines.push(`  - ${entry.grade.summary}`);
      for (const failure of entry.grade.failures) {
        lines.push(`  - ${failure.name}: ${failure.message}`);
      }
    }
  }

  if (structuralInvalid.length === 0 && solutionSummary.failed.length === 0) {
    lines.push("");
    lines.push("All card packs look healthy.");
  }

  return lines;
}
