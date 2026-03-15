import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import type { LoadedCard } from "../../cards/load-card.js";
import type { GradeResult } from "../../types/grade.js";
import { parsePytestJunit } from "../parse-pytest.js";
import { runCommand } from "../run-command.js";
import { withTempWorkspace } from "../temp-workspace.js";

const RUNNER_TIMEOUT_MS = 15_000;

export async function gradePythonAnswer(card: LoadedCard, answer: string): Promise<GradeResult> {
  return withTempWorkspace("dedumbify-py-", async (workspaceDir) => {
    const answerPath = resolve(workspaceDir, card.definition.runner.entry);
    const testsPath = resolve(workspaceDir, "tests.py");
    const reportPath = resolve(workspaceDir, "report.xml");

    await writeFile(answerPath, answer, "utf8");
    await writeFile(testsPath, card.tests, "utf8");

    const result = await runCommand(
      "uv",
      ["run", "--with", "pytest", "pytest", "tests.py", "-q", `--junitxml=${reportPath}`],
      {
        cwd: workspaceDir,
        timeoutMs: RUNNER_TIMEOUT_MS,
      },
    );

    const fallbackError = result.timedOut
      ? `pytest timed out after ${RUNNER_TIMEOUT_MS}ms`
      : result.code !== 0
        ? `pytest exited with code ${result.code}`
        : undefined;

    const reportText = await safeReadReport(reportPath);
    if (!reportText) {
      return {
        passed: false,
        passedCount: 0,
        failedCount: 1,
        summary: fallbackError ?? "pytest did not produce a report",
        stdout: result.stdout,
        stderr: result.stderr,
        failures: [{
          name: "pytest",
          message: fallbackError ?? "pytest did not produce a report",
          details: result.stderr || result.stdout,
        }],
        suggestedRating: "again",
      };
    }

    return parsePytestJunit(reportText, result.stdout, result.stderr, fallbackError);
  });
}

async function safeReadReport(reportPath: string): Promise<string | undefined> {
  try {
    return await readFile(reportPath, "utf8");
  } catch {
    return undefined;
  }
}
