import type { City } from "./cities.js";
import type { ForecastResult, TempBucket } from "../types.js";
import { ensembleDailyHighs, deterministicDailyHigh } from "./openmeteo.js";
import { nwsDailyHigh } from "./nws.js";
import { mean, stdDev, normIntervalMass } from "../util/stats.js";
import { daysAhead } from "../util/time.js";
import { log } from "../logger.js";

/**
 * Build a probability distribution over the daily-high temperature for a city/date.
 *
 * Method — Gaussian kernel density over ensemble members:
 *   members m_1..m_N  (each member's predicted daily max, °C)
 *   P(lo ≤ X < hi) = mean_i [ Φ((hi − m_i)/h) − Φ((lo − m_i)/h) ]
 * where h (kernelSigma) inflates each member into a small bell to account for
 * (a) finite ensemble size and (b) model error not captured by member spread.
 * This naturally yields probabilities for every bucket the market exposes.
 *
 * For NWS cities we recenter the ensemble on a blend of the ensemble mean and the
 * (higher-quality) NWS deterministic max, preserving the ensemble's spread.
 */

/** Base kernel width (°C) at lead time 0; grows with forecast horizon. */
const BASE_KERNEL_SIGMA = 0.6;
/** Extra kernel width added per day of lead time, capturing growing uncertainty. */
const KERNEL_SIGMA_PER_DAY = 0.45;
/** Weight on NWS when blending its deterministic max into the ensemble center. */
const NWS_BLEND_WEIGHT = 0.6;
/** Fallback spread (°C) when only a single deterministic value is available. */
const FALLBACK_SIGMA = 2.2;

export async function buildForecast(city: City, dateLocal: string): Promise<ForecastResult> {
  const lead = Math.max(0, daysAhead(dateLocal, city.timezone));
  const kernelSigma = BASE_KERNEL_SIGMA + KERNEL_SIGMA_PER_DAY * lead;

  let members = await safe(() => ensembleDailyHighs(city, dateLocal), []);
  let source = "open-meteo:ensemble";

  // Recenter on NWS for US cities (and only if we actually have an ensemble shape).
  if (city.source === "nws" && members.length > 0) {
    const nws = await safe(() => nwsDailyHigh(city, dateLocal), null);
    if (nws !== null) {
      const emMean = mean(members);
      const target = NWS_BLEND_WEIGHT * nws + (1 - NWS_BLEND_WEIGHT) * emMean;
      const shift = target - emMean;
      members = members.map((m) => m + shift);
      source = "nws+open-meteo:ensemble";
    }
  }

  // Fallback: no ensemble → synthesize members around a deterministic point.
  if (members.length === 0) {
    const point =
      (city.source === "nws" ? await safe(() => nwsDailyHigh(city, dateLocal), null) : null) ??
      (await safe(() => deterministicDailyHigh(city, dateLocal), null));
    if (point === null) {
      throw new Error(`No weather data available for ${city.key} ${dateLocal}`);
    }
    // Single point + assumed Gaussian spread, expressed as 1 member with wide kernel.
    members = [point];
    source = city.source === "nws" ? "nws:deterministic" : "open-meteo:deterministic";
    return finalize(city, dateLocal, members, FALLBACK_SIGMA, source);
  }

  return finalize(city, dateLocal, members, kernelSigma, source);
}

function finalize(
  city: City,
  dateLocal: string,
  members: number[],
  kernelSigma: number,
  source: string,
): ForecastResult {
  const mu = mean(members);
  // Total predictive sd = member spread combined with kernel width.
  const memberSd = stdDev(members);
  const totalSd = Math.sqrt(memberSd * memberSd + kernelSigma * kernelSigma);

  const probOfBucket = (b: TempBucket): number => {
    // Average per-member interval mass under the kernel.
    let acc = 0;
    for (const m of members) acc += normIntervalMass(b.lo, b.hi, m, kernelSigma);
    return acc / members.length;
  };

  log.debug(
    `forecast ${city.key} ${dateLocal}: mu=${mu.toFixed(2)} sd=${totalSd.toFixed(2)} ` +
      `members=${members.length} h=${kernelSigma.toFixed(2)} src=${source}`,
  );

  return { cityKey: city.key, dateLocal, mean: mu, stdDev: totalSd, members, source, probOfBucket };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log.debug(`weather source error: ${(err as Error).message}`);
    return fallback;
  }
}
