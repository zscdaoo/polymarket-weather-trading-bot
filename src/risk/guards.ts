import type { Config } from "../config.js";
import type { Portfolio } from "../trading/portfolio.js";

export interface RiskDecision {
  /** Stake allowed after applying all caps (USDC). 0 = blocked. */
  allowedStake: number;
  blocked: boolean;
  reason: string;
}

/** Stakes already committed earlier in THIS pass but not yet booked to the store. */
export interface PendingExposure {
  market: number;
  event: number;
  total: number;
}

export const NO_PENDING: PendingExposure = { market: 0, event: 0, total: 0 };

/** Smallest order worth placing; below this we just skip. */
const MIN_ORDER_USDC = 1;

/**
 * Clamp a desired stake against all configured risk limits. Caps account for
 * BOTH already-booked positions and stakes committed earlier in the same pass,
 * so repeated passes (watch mode) and multiple candidates in one event can never
 * push cumulative exposure past the configured ceilings.
 */
export function applyRiskLimits(
  desiredStake: number,
  ctx: { cityKey: string; dateLocal: string; tokenId: string },
  portfolio: Portfolio,
  cfg: Config,
  pending: PendingExposure = NO_PENDING,
): RiskDecision {
  // 1. Daily stop-loss — halt all new entries once breached.
  const realizedToday = portfolio.realizedToday();
  if (realizedToday <= -cfg.MAX_DAILY_LOSS) {
    return { allowedStake: 0, blocked: true, reason: `daily loss limit hit (${realizedToday.toFixed(2)})` };
  }

  // 2. Per-market cap (existing position + pending this pass).
  const marketRoom = cfg.MAX_STAKE_PER_MARKET - portfolio.marketExposure(ctx.tokenId) - pending.market;
  // 3. Per-event cap.
  const eventRoom =
    cfg.MAX_STAKE_PER_EVENT - portfolio.eventExposure(ctx.cityKey, ctx.dateLocal) - pending.event;
  // 4. Total exposure cap.
  const totalRoom = cfg.MAX_TOTAL_EXPOSURE - portfolio.totalExposure() - pending.total;

  const stake = Math.min(desiredStake, marketRoom, eventRoom, totalRoom);

  if (stake < MIN_ORDER_USDC) {
    return {
      allowedStake: 0,
      blocked: true,
      reason: `no room within limits (market=${marketRoom.toFixed(2)}, event=${eventRoom.toFixed(
        2,
      )}, total=${totalRoom.toFixed(2)})`,
    };
  }
  return { allowedStake: Number(stake.toFixed(2)), blocked: false, reason: "ok" };
}
