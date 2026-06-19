/**
 * Position sizing via fractional Kelly.
 *
 * Buying a YES share at price p costs p and pays 1 if it resolves YES. With true
 * win probability q this is a binary bet whose full-Kelly bankroll fraction is:
 *
 *     f* = (q − p) / (1 − p)        for 0 < p < 1
 *
 * (edge divided by net odds). We bet `kellyFraction · f*` of bankroll — quarter-
 * Kelly by default — because the model probability is itself uncertain and
 * full-Kelly is famously over-aggressive under parameter error.
 */
export function kellyFraction(modelProb: number, price: number): number {
  if (price <= 0 || price >= 1) return 0;
  const f = (modelProb - price) / (1 - price);
  return Math.max(0, f);
}

export function kellyStake(
  modelProb: number,
  price: number,
  bankroll: number,
  fraction: number,
): number {
  const f = kellyFraction(modelProb, price) * fraction;
  return Math.max(0, f * bankroll);
}
