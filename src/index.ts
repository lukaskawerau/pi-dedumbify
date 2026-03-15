import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { refreshDeck } from "./cards/refresh.js";
import { runSrStats } from "./commands/sr-stats.js";
import { runSrSync } from "./commands/sr-sync.js";
import { runSrValidate } from "./commands/sr-validate.js";
import { openReviewModal } from "./ui/review-modal.js";

async function runSr(ctx: ExtensionContext): Promise<void> {
  const { persisted } = await refreshDeck();
  if (persisted.invalidCount > 0) {
    ctx.ui.notify("Some card packs are invalid. Run /sr-validate for details.", "warning");
  }
  await openReviewModal(ctx);
}

export default function dedumbify(pi: ExtensionAPI): void {
  pi.registerCommand("sr", {
    description: "Open the spaced repetition review modal",
    handler: async (_args, ctx) => {
      await runSr(ctx);
    },
  });

  pi.registerCommand("sr-sync", {
    description: "Sync user-authored cards into SQLite",
    handler: async (_args, ctx) => {
      await runSrSync(ctx);
    },
  });

  pi.registerCommand("sr-stats", {
    description: "Show spaced repetition review stats",
    handler: async (_args, ctx) => {
      await runSrStats(ctx);
    },
  });

  pi.registerCommand("sr-validate", {
    description: "Validate user-authored card packs",
    handler: async (_args, ctx) => {
      await runSrValidate(ctx);
    },
  });

  pi.registerShortcut("ctrl+shift+r", {
    description: "Open spaced repetition review modal",
    handler: async (ctx) => {
      await runSr(ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("dedumbify", ctx.ui.theme.fg("accent", "SR ready"));
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus("dedumbify", undefined);
  });
}
