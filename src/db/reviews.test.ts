import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadCard } from "../cards/load-card.js";
import { validateCardDirectory } from "../cards/validate-card.js";
import { gradeSolution } from "../grading/grade-card.js";
import { getDeckStats } from "./stats.js";
import { syncCardDefinitions } from "../cards/sync.js";
import { syncCardsToDatabase } from "./cards.js";
import { getNextReviewCard, recordReview } from "./reviews.js";
import { withDatabase } from "./sqlite.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("review persistence", () => {
  it("loads next review card and records reviews automatically", async () => {
    const { cardsRoot, dbPath } = await createTempWorkspace();
    const cardDir = await createCardDir(cardsRoot, "ts-card", {
      config: validCardConfig("ts-card"),
      files: {
        "prompt.md": "# Prompt",
        "starter.ts": "export function solve() { return 0; }",
        "solution.ts": "export function solve() { return 42; }",
        "tests.ts": [
          "import { describe, expect, it } from 'vitest'",
          "import { solve } from './answer'",
          "describe('solve', () => {",
          "  it('returns 42', () => {",
          "    expect(solve()).toBe(42)",
          "  })",
          "})",
        ].join("\n"),
      },
    });

    await syncCardsToDatabase(await syncCardDefinitions(cardsRoot), dbPath);

    const reviewCard = await getNextReviewCard(dbPath);
    expect(reviewCard?.definition.id).toBe("ts-card");

    const validation = await validateCardDirectory(cardDir);
    if (!validation.card || validation.issues.length > 0 || !reviewCard) {
      throw new Error("Failed to set up review card");
    }

    const loaded = await loadCard(validation.card);
    const grade = await gradeSolution(loaded);

    await recordReview(
      {
        reviewCard,
        rating: "good",
        gradeResult: grade,
        answer: loaded.solution,
        reviewedAt: new Date("2026-03-15T12:00:00.000Z"),
        elapsedMs: 12_345,
      },
      dbPath,
    );

    const stats = await getDeckStats(dbPath);
    expect(stats.totalReviews).toBe(1);
    expect(stats.newCards).toBe(0);

    const stateRow = await withDatabase((db) => {
      return db.prepare(`
        select state, last_rating, reps, due_at, last_review_at
        from card_state
        where card_id = ?
      `).get("ts-card") as {
        state: string;
        last_rating: number;
        reps: number;
        due_at: string | null;
        last_review_at: string | null;
      };
    }, dbPath);

    expect(stateRow.state).not.toBe("new");
    expect(stateRow.last_rating).toBe(3);
    expect(stateRow.reps).toBeGreaterThan(0);
    expect(stateRow.due_at).toBeTruthy();
    expect(stateRow.last_review_at).toBe("2026-03-15T12:00:00.000Z");

    const reviewRow = await withDatabase((db) => {
      return db.prepare(`
        select passed, test_summary, elapsed_ms
        from reviews
        where card_id = ?
      `).get("ts-card") as {
        passed: number;
        test_summary: string;
        elapsed_ms: number;
      };
    }, dbPath);

    expect(reviewRow.passed).toBe(1);
    expect(reviewRow.test_summary).toContain("passed");
    expect(reviewRow.elapsed_ms).toBe(12_345);
  });
});

async function createTempWorkspace(): Promise<{ cardsRoot: string; dbPath: string }> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "dedumbify-review-"));
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
