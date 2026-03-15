import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { loadCard } from "../cards/load-card.js";
import { validateCardDirectory } from "../cards/validate-card.js";
import { gradeAnswer, gradeSolution } from "./grade-card.js";

const tempDirs: string[] = [];

const hasUv = await commandExists("uv");

afterAll(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("gradeAnswer", () => {
  it("grades a passing TypeScript answer", async () => {
    const card = await createLoadedCard({
      language: "typescript",
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

    const result = await gradeAnswer(card, "export function solve() { return 42; }");

    expect(result.passed).toBe(true);
    expect(result.passedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.suggestedRating).toBe("good");
  });

  it("grades a failing TypeScript answer", async () => {
    const card = await createLoadedCard({
      language: "typescript",
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

    const result = await gradeAnswer(card, "export function solve() { return 7; }");

    expect(result.passed).toBe(false);
    expect(result.failedCount).toBeGreaterThan(0);
    expect(result.failures[0]?.message).toContain("expected");
    expect(result.suggestedRating).toBe("again");
  });

  it.skipIf(!hasUv)("grades a passing Python answer", async () => {
    const card = await createLoadedCard({
      language: "python",
      files: {
        "prompt.md": "# Prompt",
        "starter.py": "def solve():\n    return 0\n",
        "solution.py": "def solve():\n    return 42\n",
        "tests.py": [
          "from answer import solve",
          "",
          "def test_solve():",
          "    assert solve() == 42",
        ].join("\n"),
      },
    });

    const result = await gradeSolution(card);

    expect(result.passed).toBe(true);
    expect(result.passedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.suggestedRating).toBe("good");
  });

  it.skipIf(!hasUv)("grades a failing Python answer", async () => {
    const card = await createLoadedCard({
      language: "python",
      files: {
        "prompt.md": "# Prompt",
        "starter.py": "def solve():\n    return 0\n",
        "solution.py": "def solve():\n    return 42\n",
        "tests.py": [
          "from answer import solve",
          "",
          "def test_solve():",
          "    assert solve() == 42",
        ].join("\n"),
      },
    });

    const result = await gradeAnswer(card, "def solve():\n    return 1\n");

    expect(result.passed).toBe(false);
    expect(result.failedCount).toBeGreaterThan(0);
    expect(result.failures[0]?.message.toLowerCase()).toContain("assert");
    expect(result.suggestedRating).toBe("again");
  });
});

async function createLoadedCard(input: {
  language: "typescript" | "python";
  files: Record<string, string>;
}) {
  const cardDir = await mkdtemp(path.join(tmpdir(), "dedumbify-grade-"));
  tempDirs.push(cardDir);

  await mkdir(cardDir, { recursive: true });
  await writeFile(path.join(cardDir, "card.yaml"), toYaml(makeCardConfig(input.language)));

  for (const [fileName, content] of Object.entries(input.files)) {
    await writeFile(path.join(cardDir, fileName), content, "utf8");
  }

  const validation = await validateCardDirectory(cardDir);
  if (!validation.card || validation.issues.length > 0) {
    throw new Error(`Failed to build test card: ${JSON.stringify(validation.issues)}`);
  }

  return loadCard(validation.card);
}

function makeCardConfig(language: "typescript" | "python"): Record<string, unknown> {
  if (language === "typescript") {
    return {
      id: `ts-${Math.random().toString(36).slice(2)}`,
      title: "TS Card",
      language,
      tags: ["ts"],
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

  return {
    id: `py-${Math.random().toString(36).slice(2)}`,
    title: "PY Card",
    language,
    tags: ["py"],
    files: {
      prompt: "prompt.md",
      starter: "starter.py",
      solution: "solution.py",
      tests: "tests.py",
    },
    runner: {
      entry: "answer.py",
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

async function commandExists(command: string): Promise<boolean> {
  for (const segment of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!segment) {
      continue;
    }

    try {
      await access(path.join(segment, command));
      return true;
    } catch {
      // keep going
    }
  }

  return false;
}
