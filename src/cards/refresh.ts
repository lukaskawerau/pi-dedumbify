import type { CardSyncResult } from "../types/card.js";
import { syncCardsToDatabase, type PersistedSyncSummary } from "../db/cards.js";
import { syncCardDefinitions } from "./sync.js";

export interface RefreshDeckResult {
  syncResult: CardSyncResult;
  persisted: PersistedSyncSummary;
}

export async function refreshDeck(): Promise<RefreshDeckResult> {
  const syncResult = await syncCardDefinitions();
  const persisted = await syncCardsToDatabase(syncResult);
  return { syncResult, persisted };
}
