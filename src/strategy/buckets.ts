import type { City } from "../weather/cities.js";
import type { TempBucket } from "../types.js";

/**
 * Parse a Polymarket temperature question into a TempBucket and compute the
 * half-open real-temperature interval [lo, hi) that resolves it YES, given the
 * city's rounding rule.
 *
 * Recognised question shapes (°C):
 *   "...be 24°C or below on June 18?"   -> at_or_below, value 24
 *   "...be 26°C on June 18?"            -> exact,       value 26
 *   "...be 11°C or higher on Feb 14?"   -> at_or_above, value 11
 */

const RE_BELOW = /be\s+(-?\d+(?:\.\d+)?)\s*°?\s*c?\s+or\s+(?:below|lower|less)/i;
const RE_ABOVE = /be\s+(-?\d+(?:\.\d+)?)\s*°?\s*c?\s+or\s+(?:above|higher|more)/i;
const RE_EXACT = /be\s+(-?\d+(?:\.\d+)?)\s*°?\s*c\b/i;

export function parseBucket(question: string, city: City): TempBucket | null {
  let kind: TempBucket["kind"];
  let value: number;

  const below = RE_BELOW.exec(question);
  const above = RE_ABOVE.exec(question);
  if (below) {
    kind = "at_or_below";
    value = Number(below[1]);
  } else if (above) {
    kind = "at_or_above";
    value = Number(above[1]);
  } else {
    const exact = RE_EXACT.exec(question);
    if (!exact) return null;
    kind = "exact";
    value = Number(exact[1]);
  }
  if (!Number.isFinite(value)) return null;

  const { lo, hi } = interval(kind, value, city.rounding);
  return { kind, value, lo, hi };
}

/**
 * Map a bucket to the real-temperature interval that rounds/floors into it.
 *  round: integer T means actual ∈ [T-0.5, T+0.5)
 *  floor: integer T means actual ∈ [T,     T+1)
 */
function interval(
  kind: TempBucket["kind"],
  v: number,
  rounding: City["rounding"],
): { lo: number; hi: number } {
  const lowEdge = rounding === "round" ? v - 0.5 : v; // edge below the exact bucket
  const highEdge = rounding === "round" ? v + 0.5 : v + 1; // edge above the exact bucket
  switch (kind) {
    case "at_or_below":
      return { lo: -Infinity, hi: highEdge };
    case "at_or_above":
      return { lo: lowEdge, hi: Infinity };
    case "exact":
      return { lo: lowEdge, hi: highEdge };
  }
}
