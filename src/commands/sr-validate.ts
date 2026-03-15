import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { syncCardDefinitions } from "../cards/sync.js";
import { summarizeValidation, validateSolutions } from "../cards/validate-solutions.js";

export async function runSrValidate(ctx: ExtensionCommandContext): Promise<void> {
  const syncResult = await syncCardDefinitions();
  const solutionSummary = await validateSolutions(syncResult);
  const report = summarizeValidation(syncResult, solutionSummary).join("\n");

  await ctx.ui.editor("dedumbify card validation", report);
}
