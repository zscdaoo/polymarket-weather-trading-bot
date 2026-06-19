/** Shared domain types across the bot. */

/** A temperature bucket parsed from a market question. */
export type BucketKind = "at_or_below" | "exact" | "at_or_above";

export interface TempBucket {
  kind: BucketKind;
  /** The integer °C threshold in the question (e.g. 26 for "26°C"). */
  value: number;
  /**
   * Half-open temperature interval [lo, hi) in °C that resolves this bucket YES.
   * Open ends use ±Infinity. Built using the per-city rounding rule.
   */
  lo: number;
  hi: number;
}

/** One binary Yes/No market within a temperature event. */
export interface WeatherMarket {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  /** clobTokenIds[0] = YES token, [1] = NO token. */
  yesTokenId: string;
  noTokenId: string;
  /** Last-trade / Gamma-reported outcome prices [yes, no]. */
  yesPriceHint: number;
  noPriceHint: number;
  tickSize: number;
  negRisk: boolean;
  active: boolean;
  closed: boolean;
  bucket: TempBucket;
}

/** A whole "Highest temperature in {city} on {date}" event. */
export interface WeatherEvent {
  id: string;
  slug: string;
  title: string;
  cityKey: string;
  /** Local resolution date (YYYY-MM-DD) the market refers to. */
  dateLocal: string;
  endDate: string;
  negRisk: boolean;
  markets: WeatherMarket[];
}

/** Top-of-book snapshot for one token. */
export interface BookSnapshot {
  tokenId: string;
  /** Best bid we could sell into. */
  bidPrice: number;
  bidSize: number;
  /** Best ask we could buy from. */
  askPrice: number;
  askSize: number;
  midPrice: number;
}

/** A probability distribution over the event's buckets. */
export interface ForecastResult {
  cityKey: string;
  dateLocal: string;
  /** Mean and spread of the predicted daily high (°C). */
  mean: number;
  stdDev: number;
  /** Raw ensemble/sample members of the daily high (°C), if available. */
  members: number[];
  /** Source label, e.g. "open-meteo:ensemble" or "nws+open-meteo". */
  source: string;
  /** Resolve a bucket -> model probability in [0,1]. */
  probOfBucket: (b: TempBucket) => number;
}

export type Side = "BUY" | "SELL";

/** A trade the strategy wants to make. */
export interface TradeSignal {
  eventId: string;
  marketId: string;
  cityKey: string;
  dateLocal: string;
  question: string;
  tokenId: string; // the YES token we buy
  side: Side;
  /** Model probability the outcome resolves YES. */
  modelProb: number;
  /** Price we'd pay (ask) for one YES share. */
  price: number;
  /** modelProb - price. */
  edge: number;
  /** USDC to stake. */
  stake: number;
  /** Shares = stake / price. */
  size: number;
  tickSize: number;
  negRisk: boolean;
  reason: string;
}

export interface Position {
  marketId: string;
  tokenId: string;
  question: string;
  cityKey: string;
  dateLocal: string;
  shares: number;
  avgPrice: number;
  costBasis: number;
  modelProbAtEntry: number;
  openedAt: string;
}

export interface FillRecord {
  ts: string;
  mode: "paper" | "live";
  marketId: string;
  tokenId: string;
  side: Side;
  price: number;
  size: number;
  stake: number;
  orderId?: string;
  question: string;
}
