/** Minimal stats helpers — no deps. */

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs: number[], ddof = 1): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - ddof);
  return Math.sqrt(Math.max(v, 0));
}

/** Abramowitz & Stegun 7.1.26 error-function approximation (|err| < 1.5e-7). */
export function erf(x: number): number {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF Φ. */
export function normCdf(x: number, mu = 0, sigma = 1): number {
  if (sigma <= 0) return x >= mu ? 1 : 0;
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}

/** Probability mass in [lo, hi) under N(mu, sigma); handles ±Infinity ends. */
export function normIntervalMass(lo: number, hi: number, mu: number, sigma: number): number {
  const lower = lo === -Infinity ? 0 : normCdf(lo, mu, sigma);
  const upper = hi === Infinity ? 1 : normCdf(hi, mu, sigma);
  return Math.max(0, upper - lower);
}
