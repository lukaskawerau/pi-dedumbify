import { readFile } from "node:fs/promises";

import type { CardDefinition } from "../types/card.js";

export interface LoadedCard {
  definition: CardDefinition;
  prompt: string;
  starter: string;
  solution: string;
  tests: string;
}

export async function loadCard(card: CardDefinition): Promise<LoadedCard> {
  const [prompt, starter, solution, tests] = await Promise.all([
    readFile(card.files.prompt, "utf8"),
    readFile(card.files.starter, "utf8"),
    readFile(card.files.solution, "utf8"),
    readFile(card.files.tests, "utf8"),
  ]);

  return {
    definition: card,
    prompt,
    starter,
    solution,
    tests,
  };
}
