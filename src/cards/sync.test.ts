import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverCardDirectories } from "./discover.js";
import { syncCardDefinitions } from "./sync.js";
import { validateCardDirectory } from "./validate-card.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("card discovery", () => {
  it("finds direct child card directories with card.yaml", async () => {
    const cardsRoot = await createTempCardsRoot();

    await createCardDir(cardsRoot, "valid-ts", {
      config: validTypeScriptConfig("valid-ts"),
      files: {
        "prompt.md": "# Prompt",
        "starter.ts": "export function solve() {}",
        "solution.ts": "export function solve() { return 1; }",
        "tests.ts": "expect(1).toBe(1);",
      },
    });

    await mkdir(path.join(cardsRoot, "empty-dir"), { recursive: true });
    await mkdir(path.join(cardsRoot, "nested", "not-a-card"), { recursive: true });

    const discovered = await discoverCardDirectories(cardsRoot);

    expect(discovered).toHaveLength(1);
    expect(discovered[0]).toBe(path.join(cardsRoot, "valid-ts"));
  });
});

describe("card validation", () => {
  it("accepts a valid TypeScript card", async () => {
    const cardsRoot = await createTempCardsRoot();
    const cardDir = await createCardDir(cardsRoot, "valid-ts", {
      config: validTypeScriptConfig("valid-ts"),
      files: {
        "prompt.md": "# Prompt",
        "starter.ts": "export function solve() { return 0; }",
        "solution.ts": "export function solve() { return 42; }",
        "tests.ts": "import { solve } from './answer';\nif (solve() !== 42) throw new Error('bad');",
      },
    });

    const result = await validateCardDirectory(cardDir);

    expect(result.issues).toEqual([]);
    expect(result.card).toMatchObject({
      id: "valid-ts",
      title: "Valid TS",
      language: "typescript",
      tags: ["arrays", "hashmap"],
      timeboxSec: 600,
      path: cardDir,
      runner: { entry: "answer.ts" },
    });
    expect(result.card?.files.prompt).toBe(path.join(cardDir, "prompt.md"));
    expect(result.card?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reports extension and missing-file errors", async () => {
    const cardsRoot = await createTempCardsRoot();
    const cardDir = await createCardDir(cardsRoot, "broken-py", {
      config: {
        id: "broken-py",
        title: "Broken PY",
        language: "python",
        files: {
          prompt: "prompt.txt",
          starter: "starter.py",
          solution: "solution.py",
          tests: "tests.py",
        },
        runner: {
          entry: "answer.ts",
        },
      },
      files: {
        "starter.py": "def solve():\n    return 0\n",
        "solution.py": "def solve():\n    return 1\n",
        "tests.py": "def test_solve():\n    assert True\n",
      },
    });

    const result = await validateCardDirectory(cardDir);

    expect(result.card).toBeUndefined();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CARD_FILE_EXTENSION_INVALID", field: "files.prompt" }),
        expect.objectContaining({ code: "CARD_FILE_EXTENSION_INVALID", field: "runner.entry" }),
        expect.objectContaining({ code: "CARD_FILE_MISSING", field: "files.prompt" }),
      ]),
    );
  });
});

describe("card sync", () => {
  it("marks duplicate ids invalid", async () => {
    const cardsRoot = await createTempCardsRoot();

    await createCardDir(cardsRoot, "dup-a", {
      config: validTypeScriptConfig("duplicate-id"),
      files: {
        "prompt.md": "# Prompt A",
        "starter.ts": "export function solve() { return 0; }",
        "solution.ts": "export function solve() { return 1; }",
        "tests.ts": "expect(true).toBe(true);",
      },
    });

    await createCardDir(cardsRoot, "dup-b", {
      config: validTypeScriptConfig("duplicate-id"),
      files: {
        "prompt.md": "# Prompt B",
        "starter.ts": "export function solve() { return 0; }",
        "solution.ts": "export function solve() { return 2; }",
        "tests.ts": "expect(true).toBe(true);",
      },
    });

    const result = await syncCardDefinitions(cardsRoot);

    expect(result.validCards).toEqual([]);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((entry) => entry.issues.some((issue) => issue.code === "CARD_ID_DUPLICATE"))).toBe(true);
  });
});

async function createTempCardsRoot(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "dedumbify-"));
  const cardsRoot = path.join(tempDir, "cards");
  tempDirs.push(tempDir);
  await mkdir(cardsRoot, { recursive: true });
  return cardsRoot;
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

function validTypeScriptConfig(id: string): Record<string, unknown> {
  return {
    id,
    title: "Valid TS",
    language: "typescript",
    tags: ["arrays", "hashmap"],
    timeboxSec: 600,
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
