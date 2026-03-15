import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export function getSpacedRepRoot(): string {
  return path.join(homedir(), ".pi", "agent", "spaced-rep");
}

export function getCardsRoot(): string {
  return path.join(getSpacedRepRoot(), "cards");
}

export function getDatabasePath(): string {
  return path.join(getSpacedRepRoot(), "fsrs.db");
}

export async function ensureSpacedRepRoot(): Promise<void> {
  await mkdir(getSpacedRepRoot(), { recursive: true });
}
