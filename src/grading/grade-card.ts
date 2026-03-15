import type { LoadedCard } from "../cards/load-card.js";
import type { GradeResult } from "../types/grade.js";
import { gradePythonAnswer } from "./runners/python.js";
import { gradeTypeScriptAnswer } from "./runners/typescript.js";

export async function gradeAnswer(card: LoadedCard, answer: string): Promise<GradeResult> {
  switch (card.definition.language) {
    case "typescript":
      return gradeTypeScriptAnswer(card, answer);
    case "python":
      return gradePythonAnswer(card, answer);
  }
}

export async function gradeSolution(card: LoadedCard): Promise<GradeResult> {
  return gradeAnswer(card, card.solution);
}
