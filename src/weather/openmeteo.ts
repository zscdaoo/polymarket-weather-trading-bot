import type { City } from "./cities.js";
import { getJson } from "./http.js";
import { log } from "../logger.js";

/**
 * Open-Meteo access. Two products:
 *   1. ENSEMBLE — many model members. We pull hourly 2m temperature for every
 *      member, group by local calendar day, and take each member's daily max.
 *      The set of per-member maxima is an empirical sample of the daily high,
 *      which is exactly what we want to turn into bucket probabilities.
 *   2. DETERMINISTIC — a single high-res daily max, used as a sanity anchor and
 *      as a fallback when the ensemble API is unavailable.
 *   3. ARCHIVE — historical daily max, used for bias calibration / backtests.
 *
 * Free, no API key, global coverage.
 */

const ENSEMBLE_HOST = "https://ensemble-api.open-meteo.com/v1/ensemble";
const FORECAST_HOST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_HOST = "https://archive-api.open-meteo.com/v1/archive";

// Multiple ensemble systems → more members → smoother distribution.
const ENSEMBLE_MODELS = ["gfs_seamless", "icon_seamless", "ecmwf_ifs025", "gem_global"];

interface EnsembleResp {
  hourly: Record<string, (number | null)[]> & { time: string[] };
}
interface DailyResp {
  daily: { time: string[]; temperature_2m_max: (number | null)[] };
}

/**
 * Returns one daily-max value (°C) per ensemble member for `dateLocal` (YYYY-MM-DD),
 * already bias-adjusted for the city. Empty array if the date isn't covered.
 */
export async function ensembleDailyHighs(city: City, dateLocal: string): Promise<number[]> {
  const params = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    hourly: "temperature_2m",
    models: ENSEMBLE_MODELS.join(","),
    timezone: city.timezone,
    start_date: dateLocal,
    end_date: dateLocal,
  });
  const url = `${ENSEMBLE_HOST}?${params}`;
  const data = await getJson<EnsembleResp>(url);
  const { time } = data.hourly;
  const memberKeys = Object.keys(data.hourly).filter((k) => k.startsWith("temperature_2m"));

  const highs: number[] = [];
  for (const key of memberKeys) {
    const series = data.hourly[key];
    if (!series) continue;
    let max = -Infinity;
    for (let i = 0; i < time.length; i++) {
      const t = time[i];
      const v = series[i];
      if (t === undefined || v === null || v === undefined) continue;
      if (t.slice(0, 10) !== dateLocal) continue; // local-day filter
      if (v > max) max = v;
    }
    if (Number.isFinite(max)) highs.push(max + city.biasC);
  }
  log.debug(`open-meteo ensemble ${city.key} ${dateLocal}: ${highs.length} members`);
  return highs;
}

/** Single deterministic daily-max (°C) for the date, bias-adjusted, or null. */
export async function deterministicDailyHigh(city: City, dateLocal: string): Promise<number | null> {
  const params = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    daily: "temperature_2m_max",
    timezone: city.timezone,
    start_date: dateLocal,
    end_date: dateLocal,
  });
  const data = await getJson<DailyResp>(`${FORECAST_HOST}?${params}`);
  const idx = data.daily.time.indexOf(dateLocal);
  const v = idx >= 0 ? data.daily.temperature_2m_max[idx] : null;
  return v === null || v === undefined ? null : v + city.biasC;
}

interface HourlyResp {
  hourly: { time: string[]; temperature_2m: (number | null)[] };
}

/**
 * The highest temperature OBSERVED so far today (°C, bias-adjusted), or null if
 * the date isn't today / no data. For a same-day market this is a hard floor on
 * the outcome — the daily high cannot end up below what's already been recorded —
 * and is the single most valuable signal as the day progresses.
 *
 * `nowLocalHour` is the current hour (0-23) in the city's timezone; we only count
 * hours at or before it.
 */
export async function observedHighSoFar(
  city: City,
  dateLocal: string,
  nowLocalHour: number,
): Promise<number | null> {
  const params = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    hourly: "temperature_2m",
    timezone: city.timezone,
    start_date: dateLocal,
    end_date: dateLocal,
  });
  const data = await getJson<HourlyResp>(`${FORECAST_HOST}?${params}`);
  const { time, temperature_2m } = data.hourly;
  let max = -Infinity;
  for (let i = 0; i < time.length; i++) {
    const t = time[i];
    const v = temperature_2m[i];
    if (t === undefined || v === null || v === undefined) continue;
    if (t.slice(0, 10) !== dateLocal) continue;
    const hour = Number(t.slice(11, 13));
    if (hour > nowLocalHour) continue; // future hours aren't observed yet
    if (v > max) max = v;
  }
  return Number.isFinite(max) ? max + city.biasC : null;
}

/** Historical observed daily max (°C) for [start,end], for calibration/backtests. */
export async function archiveDailyHighs(
  city: City,
  startDate: string,
  endDate: string,
): Promise<{ date: string; high: number }[]> {
  const params = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    daily: "temperature_2m_max",
    timezone: city.timezone,
    start_date: startDate,
    end_date: endDate,
  });
  const data = await getJson<DailyResp>(`${ARCHIVE_HOST}?${params}`);
  const out: { date: string; high: number }[] = [];
  data.daily.time.forEach((d, i) => {
    const v = data.daily.temperature_2m_max[i];
    if (v !== null && v !== undefined) out.push({ date: d, high: v });
  });
  return out;
}
