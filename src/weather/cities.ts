/**
 * Registry of cities the bot trades, keyed by a stable slug.
 *
 * Each entry pins:
 *  - the coordinates of (approximately) the OFFICIAL resolution station, because
 *    Polymarket resolves these markets against a specific observatory/airport, not
 *    a city centroid;
 *  - the IANA timezone, so "the daily high on June 18" means the local calendar day;
 *  - the preferred forecast source;
 *  - the ROUNDING RULE that maps a real-valued daily high (°C) onto the integer
 *    bucket the market uses. This is the single most important — and most easily
 *    overlooked — modeling detail. Get it wrong and every probability is shifted.
 */

export type WeatherSource = "nws" | "open-meteo";

/** How the official source converts a measured high into the integer bucket value. */
export type RoundingRule = "round" | "floor";

export interface City {
  key: string;
  /** Substrings (lowercase) that appear in Gamma event titles for this city. */
  matchNames: string[];
  displayName: string;
  lat: number;
  lon: number;
  timezone: string;
  source: WeatherSource;
  rounding: RoundingRule;
  /**
   * Open-Meteo measures 2m air temperature; some official stations read slightly
   * different microclimates. A small additive bias (°C) applied to model output
   * lets you calibrate against historical resolution. Start at 0 and tune.
   */
  biasC: number;
}

export const CITIES: Record<string, City> = {
  seoul: {
    key: "seoul",
    matchNames: ["seoul"],
    displayName: "Seoul",
    // Seoul (Songwol-dong) KMA station.
    lat: 37.5714,
    lon: 126.9658,
    timezone: "Asia/Seoul",
    source: "open-meteo",
    rounding: "round",
    biasC: 0,
  },
  hong_kong: {
    key: "hong_kong",
    matchNames: ["hong kong"],
    displayName: "Hong Kong",
    // Hong Kong Observatory headquarters, Tsim Sha Tsui.
    lat: 22.3022,
    lon: 114.1741,
    timezone: "Asia/Hong_Kong",
    source: "open-meteo",
    rounding: "round",
    biasC: 0,
  },
  wellington: {
    key: "wellington",
    matchNames: ["wellington"],
    displayName: "Wellington",
    // Wellington (Kelburn) station.
    lat: -41.2847,
    lon: 174.768,
    timezone: "Pacific/Auckland",
    source: "open-meteo",
    rounding: "round",
    biasC: 0,
  },
  nyc: {
    key: "nyc",
    matchNames: ["nyc", "new york"],
    displayName: "New York City",
    // Central Park, NY — the NWS climate station Polymarket NYC markets resolve to.
    lat: 40.7789,
    lon: -73.9692,
    timezone: "America/New_York",
    source: "nws",
    rounding: "round",
    biasC: 0,
  },
  london: {
    key: "london",
    matchNames: ["london"],
    displayName: "London",
    lat: 51.479,
    lon: -0.4543, // Heathrow
    timezone: "Europe/London",
    source: "open-meteo",
    rounding: "round",
    biasC: 0,
  },
  paris: {
    key: "paris",
    matchNames: ["paris"],
    displayName: "Paris",
    lat: 48.8232,
    lon: 2.3375, // Montsouris
    timezone: "Europe/Paris",
    source: "open-meteo",
    rounding: "round",
    biasC: 0,
  },
  moscow: {
    key: "moscow",
    matchNames: ["moscow"],
    displayName: "Moscow",
    lat: 55.8336,
    lon: 37.6175, // VDNH
    timezone: "Europe/Moscow",
    source: "open-meteo",
    rounding: "round",
    biasC: 0,
  },
};

export function allCityKeys(): string[] {
  return Object.keys(CITIES);
}

export function getCity(key: string): City | undefined {
  return CITIES[key];
}

/** Resolve a Gamma event title to a known city key, or undefined. */
export function matchCityFromTitle(title: string): string | undefined {
  const t = title.toLowerCase();
  for (const city of Object.values(CITIES)) {
    if (city.matchNames.some((n) => t.includes(n))) return city.key;
  }
  return undefined;
}
