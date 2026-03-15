import type { GradeFailure, GradeResult } from "../types/grade.js";

export function parsePytestJunit(
  reportText: string,
  stdout: string,
  stderr: string,
  fallbackError?: string,
): GradeResult {
  const tests = Number.parseInt(readAttribute(reportText, "tests") ?? "0", 10) || 0;
  const failuresCount = Number.parseInt(readAttribute(reportText, "failures") ?? "0", 10) || 0;
  const errorsCount = Number.parseInt(readAttribute(reportText, "errors") ?? "0", 10) || 0;
  const skippedCount = Number.parseInt(readAttribute(reportText, "skipped") ?? "0", 10) || 0;
  const failedCount = failuresCount + errorsCount;
  const passedCount = Math.max(0, tests - failedCount - skippedCount);
  const failures = parseFailures(reportText);

  if (failures.length === 0 && fallbackError && failedCount === 0 && passedCount === 0) {
    failures.push({
      name: "pytest",
      message: compactMessage(fallbackError),
      details: fallbackError,
    });
  }

  return {
    passed: failedCount === 0 && passedCount > 0,
    passedCount,
    failedCount: failures.length > 0 ? Math.max(failedCount, failures.length) : failedCount,
    summary: failedCount === 0 ? `${passedCount} test${passedCount === 1 ? "" : "s"} passed` : `${passedCount} passed, ${Math.max(failedCount, failures.length)} failed`,
    stdout,
    stderr,
    failures,
    suggestedRating: failedCount === 0 && failures.length === 0 ? "good" : "again",
  };
}

function parseFailures(reportText: string): GradeFailure[] {
  const testcasePattern = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g;
  const failures: GradeFailure[] = [];

  for (const match of reportText.matchAll(testcasePattern)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    const testName = readAttribute(attributes, "name") ?? "pytest testcase";

    for (const tag of ["failure", "error"] as const) {
      const detail = readTagBody(body, tag);
      if (!detail) {
        continue;
      }

      const message = readTagAttribute(body, tag, "message") ?? compactMessage(detail);
      failures.push({
        name: decodeXml(testName),
        message: decodeXml(message),
        details: decodeXml(detail),
      });
    }
  }

  return failures;
}

function readAttribute(input: string, name: string): string | undefined {
  const match = input.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1];
}

function readTagAttribute(input: string, tag: string, name: string): string | undefined {
  const match = input.match(new RegExp(`<${tag}\\b[^>]*${name}="([^"]*)"[^>]*>`));
  return match?.[1];
}

function readTagBody(input: string, tag: string): string | undefined {
  const match = input.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1]?.trim();
}

function compactMessage(message: string): string {
  return decodeXml(message).trim().split("\n")[0] ?? "Test failed";
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
