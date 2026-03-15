import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import type { RawCardConfig } from "../types/card.js";

export const CARD_CONFIG_FILE = "card.yaml";

export async function readCardConfig(cardDir: string): Promise<RawCardConfig> {
  const filePath = getCardConfigPath(cardDir);
  const source = await readFile(filePath, "utf8");
  const parsed = parse(source);

  if (!isPlainObject(parsed)) {
    throw new Error(`Expected ${CARD_CONFIG_FILE} to contain a YAML object`);
  }

  return parsed as RawCardConfig;
}

export function getCardConfigPath(cardDir: string): string {
  return path.join(cardDir, CARD_CONFIG_FILE);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
