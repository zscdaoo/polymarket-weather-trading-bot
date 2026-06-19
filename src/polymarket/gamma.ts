import type { WeatherEvent, WeatherMarket } from "../types.js";
import type { City } from "../weather/cities.js";
import { CITIES, matchCityFromTitle } from "../weather/cities.js";
import { parseBucket } from "../strategy/buckets.js";
import { getJson } from "../weather/http.js";
import { log } from "../logger.js";

/**
 * Gamma API: discover "Highest temperature in {city} on {date}" events and parse
 * them into structured WeatherEvent/WeatherMarket objects with temperature buckets.
 *
 * public-search returns events WITH their nested markets and tags, so a single
 * request per city yields everything we need.
 */

interface RawMarket {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  outcomes: string; // JSON string e.g. '["Yes","No"]'
  outcomePrices: string; // JSON string e.g. '["0.12","0.88"]'
  clobTokenIds: string; // JSON string e.g. '["123","456"]'
  orderPriceMinTickSize?: number;
  negRisk?: boolean;
  active?: boolean;
  closed?: boolean;
}

interface RawEvent {
  id: string;
  slug: string;
  title: string;
  endDate: string;
  negRisk?: boolean;
  closed?: boolean;
  active?: boolean;
  tags?: { slug?: string; label?: string }[];
  markets?: RawMarket[];
}

interface SearchResp {
  events?: RawEvent[];
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Pull the local resolution date (YYYY-MM-DD) out of an event slug. */
export function dateFromSlug(slug: string): string | null {
  // e.g. "highest-temperature-in-seoul-on-june-19-2026"
  const m = /on-([a-z]+)-(\d{1,2})-(\d{4})/i.exec(slug);
  if (!m) return null;
  const month = MONTHS[m[1]!.toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function jsonArr(s: string | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function parseMarket(raw: RawMarket, city: City): WeatherMarket | null {
  const tokens = jsonArr(raw.clobTokenIds);
  const prices = jsonArr(raw.outcomePrices).map(Number);
  if (tokens.length < 2) return null;
  const bucket = parseBucket(raw.question, city);
  if (!bucket) {
    log.debug(`skip unparseable market: ${raw.question}`);
    return null;
  }
  return {
    id: raw.id,
    conditionId: raw.conditionId,
    question: raw.question,
    slug: raw.slug,
    yesTokenId: tokens[0]!,
    noTokenId: tokens[1]!,
    yesPriceHint: prices[0] ?? NaN,
    noPriceHint: prices[1] ?? NaN,
    tickSize: raw.orderPriceMinTickSize ?? 0.001,
    negRisk: raw.negRisk ?? false,
    active: raw.active ?? true,
    closed: raw.closed ?? false,
    bucket,
  };
}

function parseEvent(raw: RawEvent): WeatherEvent | null {
  const cityKey = matchCityFromTitle(raw.title);
  if (!cityKey) return null;
  const city = CITIES[cityKey]!;
  const dateLocal = dateFromSlug(raw.slug) ?? raw.endDate.slice(0, 10);
  const markets = (raw.markets ?? [])
    .map((m) => parseMarket(m, city))
    .filter((m): m is WeatherMarket => m !== null && m.active && !m.closed);
  if (markets.length === 0) return null;
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    cityKey,
    dateLocal,
    endDate: raw.endDate,
    negRisk: raw.negRisk ?? markets[0]!.negRisk,
    markets,
  };
}

export class GammaClient {
  constructor(private readonly host: string) {}

  /** Fetch and parse all active temperature events for the given cities. */
  async fetchWeatherEvents(cityKeys: string[]): Promise<WeatherEvent[]> {
    const seen = new Map<string, WeatherEvent>();
    for (const key of cityKeys) {
      const city = CITIES[key];
      if (!city) {
        log.warn(`unknown city key '${key}', skipping`);
        continue;
      }
      const q = encodeURIComponent(`highest temperature in ${city.displayName}`);
      const url = `${this.host}/public-search?q=${q}&limit_per_type=50&events_status=active`;
      try {
        const resp = await getJson<SearchResp>(url);
        for (const rawEvent of resp.events ?? []) {
          if (rawEvent.closed) continue;
          if (seen.has(rawEvent.id)) continue;
          const ev = parseEvent(rawEvent);
          if (ev && ev.cityKey === key) seen.set(ev.id, ev);
        }
      } catch (err) {
        log.warn(`gamma search failed for ${key}: ${(err as Error).message}`);
      }
    }
    const events = [...seen.values()];
    log.info(`gamma: ${events.length} active temperature events across ${cityKeys.length} cities`);
    return events;
  }
}
