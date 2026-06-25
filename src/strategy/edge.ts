import type { BookSnapshot, ForecastResult, WeatherEvent, WeatherMarket } from "../types.js";
import type { Config } from "../config.js";
import { log } from "../logger.js";

/**
 * A pre-sizing trade candidate: a specific token to buy with positive expected
 * edge. We consider BOTH sides of each binary market — buying YES on a bucket the
 * model thinks is underpriced, and buying NO on a bucket the model thinks is
 * overpriced — since the edge can sit on either side of the partition.
 */
export interface EdgeCandidate {
  market: WeatherMarket;
  tokenId: string;
  outcomeLabel: "YES" | "NO";
  /** Raw model probability that this token pays out. */
  rawModelProb: number;
  /** De-vigged market-implied probability that this token pays out. */
  marketImplied: number;
  /** Blended (shrunk) probability we actually trade & size on. */
  prob: number;
  /** Best ask we'd pay. */
  price: number;
  bookLiquidity: number;
  /** prob − price. */
  edge: number;
}

function liquidity(book: BookSnapshot): number {
  return book.askPrice * book.askSize;
}

/** Mid price for a token's book, falling back to a hint when the book is empty. */
function impliedFromBook(book: BookSnapshot | undefined, hint: number): number {
  if (book && book.midPrice > 0 && book.midPrice < 1) return book.midPrice;
  return Number.isFinite(hint) ? hint : NaN;
}

/**
 * De-vig the event's bucket ladder. The YES mids across a mutually-exclusive,
 * exhaustive partition sum to MORE than 1 (the market's overround). Normalising
 * them to sum to 1 recovers the true market-implied probability per bucket, which
 * is what we should compare the model against — not the raw, vig-inflated price.
 *
 * Returns a map marketId -> implied YES probability, or null if we can't build a
 * usable ladder (then callers fall back to no de-vig).
 */
export function devigLadder(
  event: WeatherEvent,
  books: Map<string, BookSnapshot>,
): Map<string, number> | null {
  const rawYes = new Map<string, number>();
  let sum = 0;
  for (const m of event.markets) {
    const implied = impliedFromBook(books.get(m.yesTokenId), m.yesPriceHint);
    if (!Number.isFinite(implied)) continue;
    rawYes.set(m.id, implied);
    sum += implied;
  }
  if (rawYes.size === 0 || sum <= 0) return null;
  const devigged = new Map<string, number>();
  for (const [id, yes] of rawYes) devigged.set(id, yes / sum);
  return devigged;
}

export function findEdges(
  event: WeatherEvent,
  forecast: ForecastResult,
  books: Map<string, BookSnapshot>,
  cfg: Config,
): EdgeCandidate[] {
  const out: EdgeCandidate[] = [];
  const devigged = devigLadder(event, books);

  for (const market of event.markets) {
    const pModel = forecast.probOfBucket(market.bucket);
    if (!Number.isFinite(pModel)) continue;

    // De-vigged market-implied YES prob for this bucket (fallback: raw model so
    // shrinkage is a no-op when we have no usable book).
    const impliedYes = devigged?.get(market.id) ?? pModel;

    const yesBook = books.get(market.yesTokenId);
    const noBook = books.get(market.noTokenId);

    if (yesBook && yesBook.askPrice > 0 && yesBook.askPrice < 1) {
      const cand = evaluate(market, market.yesTokenId, "YES", pModel, impliedYes, yesBook, cfg);
      if (cand) out.push(cand);
    }
    if (noBook && noBook.askPrice > 0 && noBook.askPrice < 1) {
      const cand = evaluate(market, market.noTokenId, "NO", 1 - pModel, 1 - impliedYes, noBook, cfg);
      if (cand) out.push(cand);
    }
  }

  return out.sort((a, b) => b.edge - a.edge);
}

function evaluate(
  market: WeatherMarket,
  tokenId: string,
  label: "YES" | "NO",
  rawModelProb: number,
  marketImplied: number,
  book: BookSnapshot,
  cfg: Config,
): EdgeCandidate | null {
  const price = book.askPrice;
  if (price < cfg.MIN_PRICE || price > cfg.MAX_PRICE) return null;

  // Shrink the model toward the de-vigged market: the market embeds station
  // climatology we may not have calibrated for. Edge is measured on the BLEND.
  const w = cfg.MODEL_WEIGHT;
  const prob = w * rawModelProb + (1 - w) * marketImplied;
  const edge = prob - price;

  if (edge < cfg.MIN_EDGE) return null;
  if (edge > cfg.EDGE_SANITY_CAP) return null;
  const bookLiquidity = liquidity(book);
  if (bookLiquidity < cfg.MIN_BOOK_LIQUIDITY) return null;

  log.debug(
    `edge ${label} ${market.question}: model=${rawModelProb.toFixed(3)} ` +
      `mkt=${marketImplied.toFixed(3)} blend=${prob.toFixed(3)} ask=${price.toFixed(3)} edge=${edge.toFixed(3)}`,
  );
  return { market, tokenId, outcomeLabel: label, rawModelProb, marketImplied, prob, price, bookLiquidity, edge };
}
