import type { GradeFailure, GradeResult } from "../types/grade.js";

interface VitestAssertionResult {
  fullName?: string;
  title?: string;
  status?: string;
  failureMessages?: string[];
}

interface VitestSuiteResult {
  assertionResults?: VitestAssertionResult[];
  status?: string;
  message?: string;
  name?: string;
}

interface VitestJsonReport {
  success?: boolean;
  numPassedTests?: number;
  numFailedTests?: number;
  numTotalTests?: number;
  testResults?: VitestSuiteResult[];
}

export function parseVitestReport(
  reportText: string,
  stdout: string,
  stderr: string,
  fallbackError?: string,
): GradeResult {
  const parsed = JSON.parse(reportText) as VitestJsonReport;
  const passedCount = parsed.numPassedTests ?? 0;
  const failedCount = parsed.numFailedTests ?? Math.max(0, (parsed.numTotalTests ?? 0) - passedCount);
  const failures: GradeFailure[] = [];

  for (const suite of parsed.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      if (assertion.status === "failed") {
        const message = firstNonEmpty(assertion.failureMessages) ?? suite.message ?? fallbackError ?? "Test failed";
        failures.push({
          name: assertion.fullName ?? assertion.title ?? suite.name ?? "Vitest assertion",
          message: compactMessage(message),
          details: message,
        });
      }
    }

    if ((suite.assertionResults?.length ?? 0) === 0 && suite.status === "failed") {
      const message = suite.message ?? fallbackError ?? "Test suite failed";
      failures.push({
        name: suite.name ?? "Vitest suite",
        message: compactMessage(message),
        details: message,
      });
    }
  }

  if (failures.length === 0 && (fallbackError || parsed.success === false) && failedCount === 0 && passedCount === 0) {
    failures.push({
      name: "Vitest",
      message: compactMessage(fallbackError ?? "Vitest reported no passing tests"),
      details: fallbackError,
    });
  }

  return {
    passed: failedCount === 0 && passedCount > 0,
    passedCount,
    failedCount: failures.length > 0 ? Math.max(failedCount, failures.length) : failedCount,
    summary: summarizeResult(passedCount, failedCount, failures.length),
    stdout,
    stderr,
    failures,
    suggestedRating: failedCount === 0 && failures.length === 0 ? "good" : "again",
  };
}

function summarizeResult(passedCount: number, failedCount: number, parsedFailures: number): string {
  if (failedCount === 0 && parsedFailures === 0) {
    return `${passedCount} test${passedCount === 1 ? "" : "s"} passed`;
  }

  const effectiveFailed = Math.max(failedCount, parsedFailures);
  return `${passedCount} passed, ${effectiveFailed} failed`;
}

function firstNonEmpty(values: string[] | undefined): string | undefined {
  return values?.find((value) => value.trim().length > 0);
}

function compactMessage(message: string): string {
  return message.trim().split("\n")[0] ?? "Test failed";
}
