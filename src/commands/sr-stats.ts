import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { refreshDeck } from "../cards/refresh.js";
import { getDatabasePath } from "../config/paths.js";
import { getDeckStats } from "../db/stats.js";

export async function runSrStats(ctx: ExtensionCommandContext): Promise<void> {
  const { persisted } = await refreshDeck();
  const stats = await getDeckStats();

  const report = [
    `db: ${getDatabasePath()}`,
    `cards root: ${persisted.cardsRoot}`,
    "",
    `discovered: ${persisted.discoveredCount}`,
    `valid: ${persisted.validCount}`,
    `invalid: ${persisted.invalidCount}`,
    `active: ${stats.activeCards}`,
    `inactive: ${stats.inactiveCards}`,
    `new: ${stats.newCards}`,
    `due: ${stats.dueCards}`,
    `learning: ${stats.learningCards}`,
    `review: ${stats.reviewCards}`,
    `reviews logged: ${stats.totalReviews}`,
  ].join("\n");

  await ctx.ui.editor("dedumbify deck stats", report);
}
