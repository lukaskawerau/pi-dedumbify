import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import type { LoadedCard } from "../../cards/load-card.js";
import type { GradeResult } from "../../types/grade.js";
import { parseVitestReport } from "../parse-vitest.js";
import { runCommand } from "../run-command.js";
import { withTempWorkspace } from "../temp-workspace.js";

const RUNNER_TIMEOUT_MS = 15_000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const VITEST_BIN = resolve(__dirname, "../../../node_modules/vitest/vitest.mjs");

export async function gradeTypeScriptAnswer(card: LoadedCard, answer: string): Promise<GradeResult> {
  return withTempWorkspace("dedumbify-ts-", async (workspaceDir) => {
    const answerPath = resolve(workspaceDir, card.definition.runner.entry);
    const testsPath = resolve(workspaceDir, "tests.test.ts");
    const packageJsonPath = resolve(workspaceDir, "package.json");
    const reportPath = resolve(workspaceDir, "report.json");

    await writeFile(answerPath, answer, "utf8");
    await writeFile(testsPath, card.tests, "utf8");
    await writeFile(packageJsonPath, JSON.stringify({ type: "module" }, null, 2) + "\n", "utf8");

    const result = await runCommand(
      process.execPath,
      [VITEST_BIN, "run", "--root", workspaceDir, "--reporter=json", "--outputFile", reportPath],
      {
        cwd: workspaceDir,
        timeoutMs: RUNNER_TIMEOUT_MS,
      },
    );

    const fallbackError = result.timedOut
      ? `Vitest timed out after ${RUNNER_TIMEOUT_MS}ms`
      : result.code !== 0
        ? `Vitest exited with code ${result.code}`
        : undefined;

    const reportText = await safeReadReport(reportPath);
    if (!reportText) {
      return {
        passed: false,
        passedCount: 0,
        failedCount: 1,
        summary: fallbackError ?? "Vitest did not produce a report",
        stdout: result.stdout,
        stderr: result.stderr,
        failures: [{
          name: "Vitest",
          message: fallbackError ?? "Vitest did not produce a report",
          details: result.stderr || result.stdout,
        }],
        suggestedRating: "again",
      };
    }

    return parseVitestReport(reportText, result.stdout, result.stderr, fallbackError);
  });
}

async function safeReadReport(reportPath: string): Promise<string | undefined> {
  try {
    return await readFile(reportPath, "utf8");
  } catch {
    return undefined;
  }
}
