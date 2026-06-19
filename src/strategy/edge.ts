import type { BookSnapshot, ForecastResult, WeatherEvent, WeatherMarket } from "../types.js";
import type { Config } from "../config.js";

/**
 * A pre-sizing trade candidate: a specific token to buy with positive expected
 * edge. We consider BOTH sides of each binary market — buying YES on a bucket the
 * model thinks is underpriced, and buying NO on a bucket the model thinks is
 * overpriced — since the edge can sit on either side of the partition.
 */
export interface EdgeCandidate {
  market: WeatherMarket;
  /** The token we'd buy (always a BUY; "NO" is just buying the No token). */
  tokenId: string;
  outcomeLabel: "YES" | "NO";
  /** Model probability that THIS token pays out (resolves to 1). */
  modelProb: number;
  /** Best ask we'd pay for it. */
  price: number;
  /** Liquidity available at/around the ask (USDC). */
  bookLiquidity: number;
  edge: number;
}

function liquidity(book: BookSnapshot): number {
  return book.askPrice * book.askSize;
}

export function findEdges(
  event: WeatherEvent,
  forecast: ForecastResult,
  books: Map<string, BookSnapshot>,
  cfg: Config,
): EdgeCandidate[] {
  const out: EdgeCandidate[] = [];

  for (const market of event.markets) {
    const pBucket = forecast.probOfBucket(market.bucket);
    if (!Number.isFinite(pBucket)) continue;

    const yesBook = books.get(market.yesTokenId);
    const noBook = books.get(market.noTokenId);

    // Candidate 1: BUY YES — model prob = P(bucket).
    if (yesBook && yesBook.askPrice > 0 && yesBook.askPrice < 1) {
      const cand = evaluate(market, market.yesTokenId, "YES", pBucket, yesBook, cfg);
      if (cand) out.push(cand);
    }
    // Candidate 2: BUY NO — model prob = 1 − P(bucket).
    if (noBook && noBook.askPrice > 0 && noBook.askPrice < 1) {
      const cand = evaluate(market, market.noTokenId, "NO", 1 - pBucket, noBook, cfg);
      if (cand) out.push(cand);
    }
  }

  // Strongest edges first.
  return out.sort((a, b) => b.edge - a.edge);
}

function evaluate(
  market: WeatherMarket,
  tokenId: string,
  label: "YES" | "NO",
  modelProb: number,
  book: BookSnapshot,
  cfg: Config,
): EdgeCandidate | null {
  const price = book.askPrice;
  if (price < cfg.MIN_PRICE || price > cfg.MAX_PRICE) return null;
  const edge = modelProb - price;
  if (edge < cfg.MIN_EDGE) return null;
  const bookLiquidity = liquidity(book);
  if (bookLiquidity < cfg.MIN_BOOK_LIQUIDITY) return null;
  return { market, tokenId, outcomeLabel: label, modelProb, price, bookLiquidity, edge };
}
