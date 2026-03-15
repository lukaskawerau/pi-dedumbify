import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { refreshDeck } from "../cards/refresh.js";

export async function runSrSync(ctx: ExtensionCommandContext): Promise<void> {
  const { persisted } = await refreshDeck();

  const message = `cards: ${persisted.validCount} valid / ${persisted.discoveredCount} discovered / ${persisted.activeCount} active in db`;
  ctx.ui.notify(message, persisted.invalidCount > 0 ? "warning" : "info");

  if (persisted.invalidCount > 0) {
    ctx.ui.notify("Invalid card packs found. Run /sr-validate for details.", "warning");
  }
}
