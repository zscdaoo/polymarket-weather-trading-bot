import type { FillRecord, Position } from "../types.js";
import type { Store } from "../store/db.js";
import { todayLocal } from "../util/time.js";

/**
 * Tracks open positions and realized PnL on top of the Store. Exposure is
 * measured as capital at risk = sum of open-position cost bases (the most you can
 * lose if everything resolves NO).
 */
export class Portfolio {
  constructor(private readonly store: Store) {}

  /** Total capital at risk across all open positions (USDC). */
  totalExposure(): number {
    return this.store.data.positions.reduce((s, p) => s + p.costBasis, 0);
  }

  /** Capital at risk in a single event (identified by city + date). */
  eventExposure(cityKey: string, dateLocal: string): number {
    return this.store.data.positions
      .filter((p) => p.cityKey === cityKey && p.dateLocal === dateLocal)
      .reduce((s, p) => s + p.costBasis, 0);
  }

  /** Realized PnL booked today, in the UTC calendar day (simple, monotonic). */
  realizedToday(): number {
    const today = todayLocal("UTC");
    return this.store.data.realizedByDate[today] ?? 0;
  }

  openPositions(): Position[] {
    return this.store.data.positions;
  }

  /** Apply a BUY fill: merge into the position (weighted-average price) and log it. */
  applyBuy(fill: FillRecord, ctx: { cityKey: string; dateLocal: string; modelProb: number }): void {
    const existing = this.store.positionByToken(fill.tokenId);
    const addedShares = fill.size;
    const addedCost = fill.stake;
    if (existing) {
      const shares = existing.shares + addedShares;
      const costBasis = existing.costBasis + addedCost;
      this.store.upsertPosition({
        ...existing,
        shares,
        costBasis,
        avgPrice: shares > 0 ? costBasis / shares : 0,
      });
    } else {
      this.store.upsertPosition({
        marketId: fill.marketId,
        tokenId: fill.tokenId,
        question: fill.question,
        cityKey: ctx.cityKey,
        dateLocal: ctx.dateLocal,
        shares: addedShares,
        avgPrice: fill.price,
        costBasis: addedCost,
        modelProbAtEntry: ctx.modelProb,
        openedAt: fill.ts,
      });
    }
    this.store.recordFill(fill);
    this.store.save();
  }
}
