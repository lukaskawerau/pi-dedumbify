import { readdir } from "node:fs/promises";
import path from "node:path";

import { getCardsRoot } from "../config/paths.js";
import { CARD_CONFIG_FILE } from "./parse-card.js";

export async function discoverCardDirectories(cardsRoot = getCardsRoot()): Promise<string[]> {
  const entries = await safeReadDir(cardsRoot);
  const cardDirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const cardDir = path.join(cardsRoot, entry.name);
    const children = await safeReadDir(cardDir);
    if (children.some((child) => child.isFile() && child.name === CARD_CONFIG_FILE)) {
      cardDirs.push(cardDir);
    }
  }

  return cardDirs.sort((left, right) => left.localeCompare(right));
}

async function safeReadDir(targetPath: string) {
  try {
    return await readdir(targetPath, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
