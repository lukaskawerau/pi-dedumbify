import { access } from "node:fs/promises";
import path from "node:path";

import type {
  CardDefinition,
  CardFileSet,
  CardLanguage,
  CardValidationIssue,
  CardValidationResult,
  RawCardConfig,
} from "../types/card.js";
import { hashCardFiles } from "./hash.js";
import { getCardConfigPath, readCardConfig } from "./parse-card.js";

const TS_EXTENSION = ".ts";
const PYTHON_EXTENSION = ".py";
const MARKDOWN_EXTENSION = ".md";

export async function validateCardDirectory(cardDir: string): Promise<CardValidationResult> {
  const issues: CardValidationIssue[] = [];

  let rawConfig: RawCardConfig;
  try {
    rawConfig = await readCardConfig(cardDir);
  } catch (error) {
    issues.push({
      code: "CARD_CONFIG_INVALID",
      message: getErrorMessage(error),
      field: "card.yaml",
    });
    return { cardDir, issues };
  }

  const cardId = getOptionalString(rawConfig.id);
  const title = getOptionalString(rawConfig.title);
  const language = getLanguage(rawConfig.language, issues);
  const tags = getTags(rawConfig.tags, issues);
  const timeboxSec = getTimeboxSec(rawConfig.timeboxSec, issues);
  const files = getFiles(rawConfig.files, issues);
  const runnerEntry = getRunnerEntry(rawConfig.runner, issues);

  if (!cardId) {
    issues.push({ code: "CARD_ID_INVALID", message: "id must be a non-empty string", field: "id" });
  }

  if (!title) {
    issues.push({ code: "CARD_TITLE_INVALID", message: "title must be a non-empty string", field: "title" });
  }

  if (!language || !files || !runnerEntry || issues.length > 0) {
    return { cardDir, cardId, issues };
  }

  validateFileExtensions(language, files, runnerEntry, issues);

  const resolvedFiles = {
    prompt: path.resolve(cardDir, files.prompt),
    starter: path.resolve(cardDir, files.starter),
    solution: path.resolve(cardDir, files.solution),
    tests: path.resolve(cardDir, files.tests),
  };

  await validateFileExists(resolvedFiles.prompt, "files.prompt", issues);
  await validateFileExists(resolvedFiles.starter, "files.starter", issues);
  await validateFileExists(resolvedFiles.solution, "files.solution", issues);
  await validateFileExists(resolvedFiles.tests, "files.tests", issues);
  await validateFileExists(getCardConfigPath(cardDir), "card.yaml", issues);

  if (issues.length > 0) {
    return { cardDir, cardId, issues };
  }

  const contentHash = await hashCardFiles([
    getCardConfigPath(cardDir),
    resolvedFiles.prompt,
    resolvedFiles.starter,
    resolvedFiles.solution,
    resolvedFiles.tests,
  ]);

  const resolvedCardId = cardId!;
  const resolvedTitle = title!;

  const card: CardDefinition = {
    id: resolvedCardId,
    title: resolvedTitle,
    language,
    tags,
    timeboxSec,
    path: cardDir,
    files: resolvedFiles,
    runner: {
      entry: runnerEntry,
    },
    contentHash,
  };

  return {
    cardDir,
    cardId,
    issues,
    card,
  };
}

function getLanguage(value: unknown, issues: CardValidationIssue[]): CardLanguage | undefined {
  if (value === "typescript" || value === "python") {
    return value;
  }

  issues.push({
    code: "CARD_LANGUAGE_INVALID",
    message: "language must be 'typescript' or 'python'",
    field: "language",
  });
  return undefined;
}

function getTags(value: unknown, issues: CardValidationIssue[]): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    issues.push({
      code: "CARD_TAGS_INVALID",
      message: "tags must be an array of non-empty strings",
      field: "tags",
    });
    return [];
  }

  return value.map((item) => item.trim());
}

function getTimeboxSec(value: unknown, issues: CardValidationIssue[]): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    issues.push({
      code: "CARD_TIMEBOX_INVALID",
      message: "timeboxSec must be a positive integer",
      field: "timeboxSec",
    });
    return undefined;
  }

  return value;
}

function getFiles(value: unknown, issues: CardValidationIssue[]): CardFileSet | undefined {
  if (!isPlainObject(value)) {
    issues.push({
      code: "CARD_FILES_INVALID",
      message: "files must be an object with prompt, starter, solution, and tests",
      field: "files",
    });
    return undefined;
  }

  const prompt = getRequiredString(value.prompt, "files.prompt", issues);
  const starter = getRequiredString(value.starter, "files.starter", issues);
  const solution = getRequiredString(value.solution, "files.solution", issues);
  const tests = getRequiredString(value.tests, "files.tests", issues);

  if (!prompt || !starter || !solution || !tests) {
    return undefined;
  }

  return { prompt, starter, solution, tests };
}

function getRunnerEntry(value: unknown, issues: CardValidationIssue[]): string | undefined {
  if (!isPlainObject(value)) {
    issues.push({
      code: "CARD_RUNNER_INVALID",
      message: "runner must be an object with entry",
      field: "runner",
    });
    return undefined;
  }

  return getRequiredString(value.entry, "runner.entry", issues);
}

function getRequiredString(value: unknown, field: string, issues: CardValidationIssue[]): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({
      code: "CARD_FIELD_INVALID",
      message: `${field} must be a non-empty string`,
      field,
    });
    return undefined;
  }

  return value.trim();
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function validateFileExtensions(
  language: CardLanguage,
  files: CardFileSet,
  runnerEntry: string,
  issues: CardValidationIssue[],
): void {
  const sourceExtension = language === "typescript" ? TS_EXTENSION : PYTHON_EXTENSION;

  validateExtension(files.prompt, MARKDOWN_EXTENSION, "files.prompt", issues);
  validateExtension(files.starter, sourceExtension, "files.starter", issues);
  validateExtension(files.solution, sourceExtension, "files.solution", issues);
  validateExtension(files.tests, sourceExtension, "files.tests", issues);
  validateExtension(runnerEntry, sourceExtension, "runner.entry", issues);
}

function validateExtension(
  filePath: string,
  expectedExtension: string,
  field: string,
  issues: CardValidationIssue[],
): void {
  if (path.extname(filePath) !== expectedExtension) {
    issues.push({
      code: "CARD_FILE_EXTENSION_INVALID",
      message: `${field} must end with ${expectedExtension}`,
      field,
    });
  }
}

async function validateFileExists(
  filePath: string,
  field: string,
  issues: CardValidationIssue[],
): Promise<void> {
  try {
    await access(filePath);
  } catch {
    issues.push({
      code: "CARD_FILE_MISSING",
      message: `${field} does not exist: ${filePath}`,
      field,
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
