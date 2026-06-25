import type { City } from "./cities.js";
import type { ForecastResult, TempBucket } from "../types.js";
import { ensembleDailyHighs, deterministicDailyHigh, observedHighSoFar } from "./openmeteo.js";
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
 *
 * Two deliberate sources of EXTRA spread, because raw daily-max ensembles are
 * famously under-dispersed and an over-confident model invents fake edges:
 *   • spread inflation — members are pushed away from their mean by a factor >1;
 *   • kernel width h — inflates each member into a bell and GROWS with lead time.
 *
 * For US cities we recenter on a blend of the ensemble mean and the (higher
 * quality) NWS deterministic max. For same-day markets we additionally clamp the
 * distribution at the temperature already OBSERVED today — a hard physical floor.
 */

/** Base kernel width (°C) at lead time 0; grows with forecast horizon. */
const BASE_KERNEL_SIGMA = 1.1;
/** Extra kernel width added per day of lead time. */
const KERNEL_SIGMA_PER_DAY = 0.6;
/** Weight on NWS when blending its deterministic max into the ensemble center. */
const NWS_BLEND_WEIGHT = 0.6;
/** Fallback spread (°C) when only a single deterministic value is available. */
const FALLBACK_SIGMA = 2.5;
/** Default ensemble spread inflation if the caller doesn't specify one. */
const DEFAULT_SPREAD_INFLATION = 1.4;

export interface ForecastOptions {
  /** Multiplier (>1) on ensemble spread; defaults to DEFAULT_SPREAD_INFLATION. */
  spreadInflation?: number;
  /** Apply the intraday observed-high floor for same-day markets (default true). */
  useIntradayFloor?: boolean;
  /** Current hour (0-23) in the city timezone, for the intraday floor. */
  nowLocalHour?: number;
}

export async function buildForecast(
  city: City,
  dateLocal: string,
  opts: ForecastOptions = {},
): Promise<ForecastResult> {
  const inflation = Math.max(1, opts.spreadInflation ?? DEFAULT_SPREAD_INFLATION);
  const lead = Math.max(0, daysAhead(dateLocal, city.timezone));
  const kernelSigma = BASE_KERNEL_SIGMA + KERNEL_SIGMA_PER_DAY * lead;

  let members = await safe(() => ensembleDailyHighs(city, dateLocal), []);
  let source = "open-meteo:ensemble";

  // Recenter on NWS for US cities (only if we actually have an ensemble shape).
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

  // Fallback: no ensemble → synthesize a single point with a wide kernel.
  if (members.length === 0) {
    const point =
      (city.source === "nws" ? await safe(() => nwsDailyHigh(city, dateLocal), null) : null) ??
      (await safe(() => deterministicDailyHigh(city, dateLocal), null));
    if (point === null) throw new Error(`No weather data available for ${city.key} ${dateLocal}`);
    const floor = await intradayFloor(city, dateLocal, lead, opts);
    return finalize(city, dateLocal, [point], FALLBACK_SIGMA, 1, floor, source + ":deterministic");
  }

  const floor = await intradayFloor(city, dateLocal, lead, opts);
  return finalize(city, dateLocal, members, kernelSigma, inflation, floor, source);
}

async function intradayFloor(
  city: City,
  dateLocal: string,
  lead: number,
  opts: ForecastOptions,
): Promise<number | null> {
  if (opts.useIntradayFloor === false) return null;
  if (lead !== 0) return null; // only meaningful for today
  const hour = opts.nowLocalHour ?? currentHour(city.timezone);
  const floor = await safe(() => observedHighSoFar(city, dateLocal, hour), null);
  if (floor !== null) log.debug(`intraday floor ${city.key} ${dateLocal}: ${floor.toFixed(1)}°C @ hour ${hour}`);
  return floor;
}

function finalize(
  city: City,
  dateLocal: string,
  rawMembers: number[],
  kernelSigma: number,
  inflation: number,
  floor: number | null,
  source: string,
): ForecastResult {
  const mu0 = mean(rawMembers);
  // 1) inflate spread around the mean; 2) clamp to the observed floor (if any).
  const members = rawMembers.map((m) => {
    const inflated = mu0 + inflation * (m - mu0);
    return floor !== null ? Math.max(inflated, floor) : inflated;
  });

  const mu = mean(members);
  const memberSd = stdDev(members);
  const totalSd = Math.sqrt(memberSd * memberSd + kernelSigma * kernelSigma);

  const probOfBucket = (b: TempBucket): number => {
    let acc = 0;
    for (const m of members) acc += normIntervalMass(b.lo, b.hi, m, kernelSigma);
    return acc / members.length;
  };

  log.debug(
    `forecast ${city.key} ${dateLocal}: mu=${mu.toFixed(2)} sd=${totalSd.toFixed(2)} ` +
      `members=${members.length} h=${kernelSigma.toFixed(2)} infl=${inflation} ` +
      `floor=${floor === null ? "-" : floor.toFixed(1)} src=${source}`,
  );

  return { cityKey: city.key, dateLocal, mean: mu, stdDev: totalSd, members, source, probOfBucket };
}

/** Current hour (0-23) in a timezone. */
function currentHour(timezone: string): number {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(
    new Date(),
  );
  const h = Number(s.slice(0, 2));
  return Number.isFinite(h) ? h % 24 : 12;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log.debug(`weather source error: ${(err as Error).message}`);
    return fallback;
  }
}
