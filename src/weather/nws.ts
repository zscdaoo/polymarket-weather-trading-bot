import type { City } from "./cities.js";
import { getJson } from "./http.js";
import { localDate } from "../util/time.js";
import { log } from "../logger.js";

/**
 * US National Weather Service gridpoint forecast. NWS publishes a high-quality
 * deterministic daily max temperature (°C) per forecast period but no ensemble,
 * so we use it as the central anchor and borrow spread from the Open-Meteo
 * ensemble in forecast.ts. Requires a descriptive User-Agent per NWS policy.
 */

const NWS_HOST = "https://api.weather.gov";
const UA = "polymarket-weather-bot/0.1 (contact: set-your-email)";

interface PointsResp {
  properties: { forecastGridData: string; gridId: string; gridX: number; gridY: number };
}
interface GridResp {
  properties: {
    maxTemperature: { uom: string; values: { validTime: string; value: number | null }[] };
  };
}

// Cache the gridpoint URL per city — it never changes.
const gridUrlCache = new Map<string, string>();

async function gridUrl(city: City): Promise<string> {
  const cached = gridUrlCache.get(city.key);
  if (cached) return cached;
  const pts = await getJson<PointsResp>(`${NWS_HOST}/points/${city.lat},${city.lon}`, {
    headers: { "User-Agent": UA },
  });
  const url = pts.properties.forecastGridData;
  gridUrlCache.set(city.key, url);
  return url;
}

/** NWS deterministic daily-max (°C) for the local date, bias-adjusted, or null. */
export async function nwsDailyHigh(city: City, dateLocal: string): Promise<number | null> {
  try {
    const url = await gridUrl(city);
    const grid = await getJson<GridResp>(url, { headers: { "User-Agent": UA } });
    const vals = grid.properties.maxTemperature.values;
    for (const { validTime, value } of vals) {
      if (value === null) continue;
      const startIso = validTime.split("/")[0]!; // "2026-06-18T12:00:00+00:00"
      const start = new Date(startIso);
      // NWS daily-max periods start mid-morning UTC; the local date of the
      // period start is the calendar day whose daytime high it represents.
      if (localDate(start, city.timezone) === dateLocal) {
        return value + city.biasC;
      }
    }
    log.debug(`nws ${city.key}: no maxTemperature period for ${dateLocal}`);
    return null;
  } catch (err) {
    log.warn(`nws fetch failed for ${city.key}, will fall back to open-meteo: ${(err as Error).message}`);
    return null;
  }
}
