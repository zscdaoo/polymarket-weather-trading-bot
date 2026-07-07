/**
 * Position sizing via fractional Kelly.
 *
 * Buying a YES share at price p costs p and pays 1 if it resolves YES — a binary
 * bet whose net payoff ratio is `b = (1 − p) / p` (win 1 − p per p staked). The
 * Kelly math itself lives in the shared kelly-stake library:
 *
 *     f* = q − (1 − q) / b        (equivalently (q − p) / (1 − p) here)
 *
 * We bet `fraction · f*` of bankroll — quarter-Kelly by default (KELLY_FRACTION)
 * — because the model probability is itself uncertain and full-Kelly is famously
 * over-aggressive under parameter error.
 */
import { kellyFraction as libKellyFraction, kellyStake as libKellyStake } from "kelly-stake";

/** Net payoff ratio `b` for buying a YES share at `price`: win 1 − p per p staked. */
function payoffRatio(price: number): number {
  return (1 - price) / price;
}

export function kellyFraction(modelProb: number, price: number): number {
  // Prices outside (0, 1) aren't tradeable and would make the payoff ratio
  // degenerate, so short-circuit before handing off to the library.
  if (price <= 0 || price >= 1) return 0;
  return libKellyFraction(modelProb, payoffRatio(price));
}

export function kellyStake(
  modelProb: number,
  price: number,
  bankroll: number,
  fraction: number,
): number {
  if (price <= 0 || price >= 1) return 0;
  return libKellyStake(
    { winProbability: modelProb, payoffRatio: payoffRatio(price) },
    { bankroll, fraction },
  );
}
