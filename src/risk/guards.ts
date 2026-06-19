import type { Config } from "../config.js";
import type { Portfolio } from "../trading/portfolio.js";

export interface RiskDecision {
  /** Stake allowed after applying all caps (USDC). 0 = blocked. */
  allowedStake: number;
  blocked: boolean;
  reason: string;
}

/** Smallest order worth placing; below this we just skip. */
const MIN_ORDER_USDC = 1;

/**
 * Clamp a desired stake against all configured risk limits. Returns the largest
 * stake permitted (possibly reduced), or blocks entirely with a reason.
 */
export function applyRiskLimits(
  desiredStake: number,
  ctx: { cityKey: string; dateLocal: string },
  portfolio: Portfolio,
  cfg: Config,
): RiskDecision {
  // 1. Daily stop-loss — halt all new entries once breached.
  const realizedToday = portfolio.realizedToday();
  if (realizedToday <= -cfg.MAX_DAILY_LOSS) {
    return { allowedStake: 0, blocked: true, reason: `daily loss limit hit (${realizedToday.toFixed(2)})` };
  }

  let stake = Math.min(desiredStake, cfg.MAX_STAKE_PER_MARKET);

  // 2. Per-event cap.
  const eventRoom = cfg.MAX_STAKE_PER_EVENT - portfolio.eventExposure(ctx.cityKey, ctx.dateLocal);
  stake = Math.min(stake, eventRoom);

  // 3. Total exposure cap.
  const totalRoom = cfg.MAX_TOTAL_EXPOSURE - portfolio.totalExposure();
  stake = Math.min(stake, totalRoom);

  if (stake < MIN_ORDER_USDC) {
    return {
      allowedStake: 0,
      blocked: true,
      reason: `no room within limits (event=${eventRoom.toFixed(2)}, total=${totalRoom.toFixed(2)})`,
    };
  }
  return { allowedStake: Number(stake.toFixed(2)), blocked: false, reason: "ok" };
}
