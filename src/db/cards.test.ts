import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { syncCardDefinitions } from "../cards/sync.js";
import { getDeckStats } from "./stats.js";
import { syncCardsToDatabase } from "./cards.js";
import { withDatabase } from "./sqlite.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("db sync", () => {
  it("persists valid cards and initializes card_state rows", async () => {
    const { cardsRoot, dbPath } = await createTempWorkspace();

    await createCardDir(cardsRoot, "ts-card", {
      config: validCardConfig("ts-card"),
      files: {
        "prompt.md": "# Prompt",
        "starter.ts": "export function solve() { return 0; }",
        "solution.ts": "export function solve() { return 1; }",
        "tests.ts": "expect(true).toBe(true);",
      },
    });

    const syncResult = await syncCardDefinitions(cardsRoot);
    const persisted = await syncCardsToDatabase(syncResult, dbPath);
    const stats = await getDeckStats(dbPath);

    expect(persisted.validCount).toBe(1);
    expect(persisted.invalidCount).toBe(0);
    expect(stats.activeCards).toBe(1);
    expect(stats.newCards).toBe(1);
    expect(stats.totalReviews).toBe(0);

    const row = await withDatabase((db) => {
      return db.prepare("select id, active from cards where id = ?").get("ts-card") as { id: string; active: number };
    }, dbPath);

    expect(row).toEqual({ id: "ts-card", active: 1 });
  });

  it("deactivates cards removed from disk on resync", async () => {
    const { cardsRoot, dbPath } = await createTempWorkspace();

    await createCardDir(cardsRoot, "ts-card", {
      config: validCardConfig("ts-card"),
      files: {
        "prompt.md": "# Prompt",
        "starter.ts": "export function solve() { return 0; }",
        "solution.ts": "export function solve() { return 1; }",
        "tests.ts": "expect(true).toBe(true);",
      },
    });

    await syncCardsToDatabase(await syncCardDefinitions(cardsRoot), dbPath);
    await rm(path.join(cardsRoot, "ts-card"), { recursive: true, force: true });

    await syncCardsToDatabase(await syncCardDefinitions(cardsRoot), dbPath);
    const stats = await getDeckStats(dbPath);

    expect(stats.activeCards).toBe(0);
    expect(stats.inactiveCards).toBe(1);
  });
});

async function createTempWorkspace(): Promise<{ cardsRoot: string; dbPath: string }> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "dedumbify-db-"));
  tempDirs.push(tempDir);

  const cardsRoot = path.join(tempDir, "cards");
  const dbPath = path.join(tempDir, "fsrs.db");
  await mkdir(cardsRoot, { recursive: true });

  return { cardsRoot, dbPath };
}

async function createCardDir(
  cardsRoot: string,
  dirName: string,
  input: {
    config: Record<string, unknown>;
    files: Record<string, string>;
  },
): Promise<string> {
  const cardDir = path.join(cardsRoot, dirName);
  await mkdir(cardDir, { recursive: true });
  await writeFile(path.join(cardDir, "card.yaml"), toYaml(input.config));

  for (const [fileName, content] of Object.entries(input.files)) {
    await writeFile(path.join(cardDir, fileName), content);
  }

  return cardDir;
}

function validCardConfig(id: string): Record<string, unknown> {
  return {
    id,
    title: "Valid TS",
    language: "typescript",
    tags: ["arrays"],
    timeboxSec: 300,
    files: {
      prompt: "prompt.md",
      starter: "starter.ts",
      solution: "solution.ts",
      tests: "tests.ts",
    },
    runner: {
      entry: "answer.ts",
    },
  };
}

function toYaml(value: Record<string, unknown>, indent = 0): string {
  const pad = " ".repeat(indent);
  const lines: string[] = [];

  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry)) {
      lines.push(`${pad}${key}:`);
      for (const item of entry) {
        lines.push(`${pad}  - ${String(item)}`);
      }
      continue;
    }

    if (isPlainObject(entry)) {
      lines.push(`${pad}${key}:`);
      lines.push(toYaml(entry, indent + 2));
      continue;
    }

    lines.push(`${pad}${key}: ${String(entry)}`);
  }

  return lines.join("\n") + "\n";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
