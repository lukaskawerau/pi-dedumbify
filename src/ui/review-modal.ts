import {
  getLanguageFromPath,
  highlightCode,
  type ExtensionContext,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import {
  CURSOR_MARKER,
  type Focusable,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

import { loadCard, type LoadedCard } from "../cards/load-card.js";
import { getNextReviewCard, getSuggestedRatings, recordReview } from "../db/reviews.js";
import { gradeAnswer } from "../grading/grade-card.js";
import type { ReviewRating } from "../types/grade.js";
import type { ReviewCard } from "../types/review.js";

const PANES = ["Prompt", "Starter", "Answer", "Results"] as const;
const MAX_BODY_LINES = 18;

export async function openReviewModal(ctx: ExtensionContext): Promise<void> {
  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) => new ReviewModal(tui, theme, done),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "80%",
        minWidth: 72,
        maxHeight: "85%",
        margin: 1,
      },
    },
  );
}

class ReviewModal implements Focusable {
  focused = false;
  private selectedPane = 0;
  private revealSolution = false;
  private answer = "";
  private cursor = 0;
  private currentReviewCard?: ReviewCard;
  private currentLoadedCard?: LoadedCard;
  private currentGrade?: Awaited<ReturnType<typeof gradeAnswer>>;
  private loading = true;
  private runningTests = false;
  private savingReview = false;
  private error?: string;
  private cardStartedAt = Date.now();

  constructor(
    private readonly tui: { requestRender(): void },
    private readonly theme: Theme,
    private readonly done: () => void,
  ) {
    void this.loadNextCard();
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.done();
      return;
    }

    if (this.loading || this.runningTests || this.savingReview) {
      return;
    }

    if (matchesKey(data, "tab")) {
      this.selectedPane = (this.selectedPane + 1) % PANES.length;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "shift+tab")) {
      this.selectedPane = (this.selectedPane - 1 + PANES.length) % PANES.length;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "ctrl+r")) {
      void this.runTests();
      return;
    }

    if (matchesKey(data, "ctrl+s")) {
      this.revealSolution = !this.revealSolution;
      this.selectedPane = 1;
      this.requestRender();
      return;
    }

    if (this.currentGrade) {
      const rating = this.getRatingKey(data);
      if (rating) {
        void this.saveReview(rating);
        return;
      }
    }

    if (PANES[this.selectedPane] === "Answer") {
      if (this.handleAnswerInput(data)) {
        this.requestRender();
        return;
      }
    }

    if (matchesKey(data, "left")) {
      this.selectedPane = (this.selectedPane - 1 + PANES.length) % PANES.length;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "right")) {
      this.selectedPane = (this.selectedPane + 1) % PANES.length;
      this.requestRender();
    }
  }

  render(width: number): string[] {
    const innerWidth = Math.max(20, width - 2);
    const contentWidth = Math.max(20, innerWidth - 2);
    const lines: string[] = [];

    lines.push(this.borderTop(innerWidth));
    lines.push(this.row(` ${this.renderHeader(contentWidth)}`, innerWidth));
    lines.push(this.row(` ${this.renderMeta(contentWidth)}`, innerWidth));
    lines.push(this.row("", innerWidth));
    lines.push(this.row(` ${this.renderTabs(contentWidth)}`, innerWidth));
    lines.push(this.row("", innerWidth));

    for (const line of this.getBodyLines(contentWidth).slice(0, MAX_BODY_LINES)) {
      lines.push(this.row(` ${line}`, innerWidth));
    }

    while (lines.length < 6 + MAX_BODY_LINES) {
      lines.push(this.row("", innerWidth));
    }

    lines.push(this.row("", innerWidth));
    lines.push(this.row(` ${this.renderFooter(contentWidth)}`, innerWidth));
    lines.push(this.borderBottom(innerWidth));

    return lines;
  }

  invalidate(): void {}

  private renderHeader(width: number): string {
    if (this.loading) {
      return truncateToWidth(this.theme.fg("accent", this.theme.bold("dedumbify")) + " loading card...", width, "...", true);
    }

    if (this.error) {
      return truncateToWidth(this.theme.fg("error", this.theme.bold("dedumbify")) + ` ${this.error}`, width, "...", true);
    }

    if (!this.currentReviewCard) {
      return truncateToWidth(this.theme.fg("accent", this.theme.bold("dedumbify")) + " no cards due", width, "...", true);
    }

    return truncateToWidth(
      `${this.theme.fg("accent", this.theme.bold(this.currentReviewCard.definition.title))} ${this.theme.fg("dim", `(${this.currentReviewCard.definition.language})`)}`,
      width,
      "...",
      true,
    );
  }

  private renderMeta(width: number): string {
    if (!this.currentReviewCard) {
      return truncateToWidth(this.theme.fg("dim", "Esc closes the modal."), width, "...", true);
    }

    const state = this.theme.fg("muted", `state=${this.currentReviewCard.state.state}`);
    const reps = this.theme.fg("muted", `reps=${this.currentReviewCard.state.reps}`);
    const timebox = this.currentReviewCard.definition.timeboxSec
      ? this.theme.fg("muted", `timebox=${this.currentReviewCard.definition.timeboxSec}s`)
      : this.theme.fg("muted", "timebox=—");
    const due = this.currentReviewCard.state.dueAt
      ? this.theme.fg("muted", `due=${formatDue(this.currentReviewCard.state.dueAt)}`)
      : this.theme.fg("muted", "due=new");
    const tags = this.currentReviewCard.definition.tags.length > 0
      ? this.currentReviewCard.definition.tags.join(", ")
      : "no-tags";

    return truncateToWidth(`${state} • ${reps} • ${timebox} • ${due} • ${tags}`, width, "...", true);
  }

  private renderTabs(width: number): string {
    const chunks = PANES.map((pane, index) => {
      const activeLabel = pane === "Starter" && this.revealSolution ? " Solution " : ` ${pane} `;
      return index === this.selectedPane
        ? this.theme.bg("selectedBg", this.theme.fg("accent", activeLabel))
        : this.theme.fg("muted", activeLabel);
    });

    return truncateToWidth(chunks.join(" "), width, "...", true);
  }

  private renderFooter(width: number): string {
    const suggested = this.currentGrade
      ? ` • rate: ${getSuggestedRatings(this.currentGrade.passed)
          .map((rating) => `${this.theme.fg("accent", ratingKey(rating))}=${rating}`)
          .join(" ")}`
      : "";

    const base = this.currentReviewCard
      ? "tab panes • ctrl+r run tests • ctrl+s toggle solution • esc close"
      : "esc close";

    return truncateToWidth(this.theme.fg("dim", base + suggested), width, "...", true);
  }

  private getBodyLines(width: number): string[] {
    if (this.loading) {
      return [this.theme.fg("accent", "Loading next card...")];
    }

    if (this.error) {
      return [
        this.theme.fg("error", this.error),
        "",
        this.theme.fg("dim", "Fix the card pack or run /sr-validate for details."),
      ];
    }

    if (!this.currentLoadedCard || !this.currentReviewCard) {
      return [
        this.theme.fg("accent", "No due or new cards right now."),
        "",
        this.theme.fg("dim", "Add cards under ~/.pi/agent/spaced-rep/cards/ or wait until cards become due."),
      ];
    }

    switch (PANES[this.selectedPane]) {
      case "Prompt":
        return renderWrappedText(this.currentLoadedCard.prompt, width);
      case "Starter":
        return renderCodeBlock(
          this.revealSolution ? this.currentLoadedCard.solution : this.currentLoadedCard.starter,
          this.revealSolution ? this.currentReviewCard.definition.files.solution : this.currentReviewCard.definition.files.starter,
          width,
        );
      case "Answer":
        return this.renderAnswer(width);
      case "Results":
        return this.renderResults(width);
    }
  }

  private renderAnswer(width: number): string[] {
    const before = this.answer.slice(0, this.cursor);
    const cursorChar = this.cursor < this.answer.length ? this.answer[this.cursor] : " ";
    const after = this.answer.slice(this.cursor + 1);
    const marker = this.focused ? CURSOR_MARKER : "";
    const text = `${before}${marker}\x1b[7m${cursorChar}\x1b[27m${after}`;
    const lines = wrapTextWithAnsi(text.length === 0 ? `${marker}\x1b[7m \x1b[27m` : text, width);

    if (lines.length === 0) {
      return [this.theme.fg("dim", "(empty)")];
    }

    return lines;
  }

  private renderResults(width: number): string[] {
    if (this.runningTests) {
      return [this.theme.fg("accent", "Running tests..."), "", this.theme.fg("dim", "Temp workspace + isolated execution.")];
    }

    if (!this.currentGrade) {
      return [
        this.theme.fg("accent", "No test run yet."),
        "",
        this.theme.fg("dim", "Press ctrl+r to grade the current answer."),
      ];
    }

    const lines = [
      this.currentGrade.passed ? this.theme.fg("success", `✓ ${this.currentGrade.summary}`) : this.theme.fg("error", `✗ ${this.currentGrade.summary}`),
      this.theme.fg("muted", `suggested: ${this.currentGrade.suggestedRating}`),
    ];

    for (const failure of this.currentGrade.failures.slice(0, 4)) {
      lines.push("");
      lines.push(this.theme.fg("warning", failure.name));
      lines.push(...renderWrappedText(failure.message, width));
    }

    if (this.currentGrade.stdout.trim().length > 0) {
      lines.push("");
      lines.push(this.theme.fg("dim", `stdout: ${compactSingleLine(this.currentGrade.stdout)}`));
    }

    if (this.currentGrade.stderr.trim().length > 0) {
      lines.push(this.theme.fg("dim", `stderr: ${compactSingleLine(this.currentGrade.stderr)}`));
    }

    return lines;
  }

  private handleAnswerInput(data: string): boolean {
    if (matchesKey(data, "left")) {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }

    if (matchesKey(data, "right")) {
      this.cursor = Math.min(this.answer.length, this.cursor + 1);
      return true;
    }

    if (matchesKey(data, "home") || matchesKey(data, "ctrl+a")) {
      this.cursor = lineStart(this.answer, this.cursor);
      return true;
    }

    if (matchesKey(data, "end") || matchesKey(data, "ctrl+e")) {
      this.cursor = lineEnd(this.answer, this.cursor);
      return true;
    }

    if (matchesKey(data, "backspace")) {
      if (this.cursor === 0) {
        return true;
      }
      this.answer = this.answer.slice(0, this.cursor - 1) + this.answer.slice(this.cursor);
      this.cursor -= 1;
      return true;
    }

    if (matchesKey(data, "delete") || matchesKey(data, "ctrl+d")) {
      if (this.cursor >= this.answer.length) {
        return true;
      }
      this.answer = this.answer.slice(0, this.cursor) + this.answer.slice(this.cursor + 1);
      return true;
    }

    if (matchesKey(data, "enter") || matchesKey(data, "shift+enter") || data === "\r") {
      this.insertText("\n");
      return true;
    }

    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.insertText(data);
      return true;
    }

    return false;
  }

  private insertText(text: string): void {
    this.answer = this.answer.slice(0, this.cursor) + text + this.answer.slice(this.cursor);
    this.cursor += text.length;
    this.currentGrade = undefined;
  }

  private getRatingKey(data: string): ReviewRating | undefined {
    if (data === "1") return "again";
    if (data === "2") return "hard";
    if (data === "3") return "good";
    if (data === "4") return "easy";
    return undefined;
  }

  private async runTests(): Promise<void> {
    if (!this.currentLoadedCard) {
      return;
    }

    this.runningTests = true;
    this.selectedPane = 3;
    this.error = undefined;
    this.requestRender();

    try {
      this.currentGrade = await gradeAnswer(this.currentLoadedCard, this.answer);
    } catch (error) {
      this.currentGrade = {
        passed: false,
        passedCount: 0,
        failedCount: 1,
        summary: "Runner crashed",
        stdout: "",
        stderr: error instanceof Error ? error.stack ?? error.message : String(error),
        failures: [
          {
            name: "Runner",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
        suggestedRating: "again",
      };
    } finally {
      this.runningTests = false;
      this.requestRender();
    }
  }

  private async saveReview(rating: ReviewRating): Promise<void> {
    if (!this.currentReviewCard || !this.currentGrade) {
      return;
    }

    this.savingReview = true;
    this.error = undefined;
    this.requestRender();

    try {
      await recordReview({
        reviewCard: this.currentReviewCard,
        rating,
        gradeResult: this.currentGrade,
        answer: this.answer,
        elapsedMs: Date.now() - this.cardStartedAt,
      });
      await this.loadNextCard();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.savingReview = false;
      this.requestRender();
    }
  }

  private async loadNextCard(): Promise<void> {
    this.loading = true;
    this.error = undefined;
    this.currentGrade = undefined;
    this.requestRender();

    try {
      const reviewCard = await getNextReviewCard();
      this.currentReviewCard = reviewCard;

      if (!reviewCard) {
        this.currentLoadedCard = undefined;
        this.answer = "";
        this.cursor = 0;
        return;
      }

      this.currentLoadedCard = await loadCard(reviewCard.definition);
      this.answer = this.currentLoadedCard.starter;
      this.cursor = this.answer.length;
      this.selectedPane = 0;
      this.revealSolution = false;
      this.cardStartedAt = Date.now();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.currentReviewCard = undefined;
      this.currentLoadedCard = undefined;
      this.answer = "";
      this.cursor = 0;
    } finally {
      this.loading = false;
      this.requestRender();
    }
  }

  private requestRender(): void {
    this.tui.requestRender();
  }

  private row(content: string, innerWidth: number): string {
    const visible = visibleWidth(content);
    const padded = visible > innerWidth
      ? truncateToWidth(content, innerWidth, "...", true)
      : content + " ".repeat(innerWidth - visible);
    return this.theme.fg("border", "│") + padded + this.theme.fg("border", "│");
  }

  private borderTop(innerWidth: number): string {
    return this.theme.fg("border", `╭${"─".repeat(innerWidth)}╮`);
  }

  private borderBottom(innerWidth: number): string {
    return this.theme.fg("border", `╰${"─".repeat(innerWidth)}╯`);
  }
}

function renderWrappedText(text: string, width: number): string[] {
  return wrapTextWithAnsi(text.length > 0 ? text : " ", width);
}

function renderCodeBlock(code: string, filePath: string, width: number): string[] {
  const highlighted = highlightCode(code, getLanguageFromPath(filePath));
  return highlighted.flatMap((line) => wrapTextWithAnsi(line.length > 0 ? line : " ", width));
}

function compactSingleLine(text: string): string {
  return text.trim().replaceAll(/\s+/g, " ").slice(0, 120);
}

function formatDue(dueAt: string): string {
  const date = new Date(dueAt);
  return Number.isNaN(date.getTime()) ? dueAt : date.toLocaleString();
}

function ratingKey(rating: ReviewRating): string {
  switch (rating) {
    case "again":
      return "1";
    case "hard":
      return "2";
    case "good":
      return "3";
    case "easy":
      return "4";
  }
}

function lineStart(text: string, cursor: number): number {
  const index = text.lastIndexOf("\n", Math.max(0, cursor - 1));
  return index === -1 ? 0 : index + 1;
}

function lineEnd(text: string, cursor: number): number {
  const index = text.indexOf("\n", cursor);
  return index === -1 ? text.length : index;
}
