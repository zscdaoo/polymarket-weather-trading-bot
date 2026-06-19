import type { Config } from "../config.js";
import type { BookSnapshot, ForecastResult, TradeSignal, WeatherEvent } from "../types.js";
import { GammaClient } from "../polymarket/gamma.js";
import { ClobTradingClient } from "../polymarket/clob.js";
import { buildForecast } from "../weather/forecast.js";
import { getCity, allCityKeys } from "../weather/cities.js";
import { findEdges, type EdgeCandidate } from "./edge.js";
import { kellyStake } from "./sizing.js";
import { applyRiskLimits } from "../risk/guards.js";
import { Store } from "../store/db.js";
import { Portfolio } from "../trading/portfolio.js";
import { Executor, type ExecutionResult } from "../trading/executor.js";
import { daysAhead } from "../util/time.js";
import { log } from "../logger.js";

export interface MarketView {
  question: string;
  bucket: string;
  modelProb: number;
  marketPrice: number; // yes price hint
  edge: number;
}

export interface EventReport {
  event: WeatherEvent;
  forecast: ForecastResult;
  marketViews: MarketView[];
  candidates: EdgeCandidate[];
  signals: TradeSignal[];
  executions: ExecutionResult[];
}

const STATE_PATH = "data/state.json";

export class Engine {
  private readonly gamma: GammaClient;
  private readonly clob: ClobTradingClient;
  private readonly store: Store;
  private readonly portfolio: Portfolio;
  private readonly executor: Executor;

  constructor(private readonly cfg: Config) {
    this.gamma = new GammaClient(cfg.GAMMA_HOST);
    this.clob = new ClobTradingClient(cfg);
    this.store = new Store(STATE_PATH);
    this.portfolio = new Portfolio(this.store);
    this.executor = new Executor(cfg, this.clob, this.portfolio);
  }

  get clobClient(): ClobTradingClient {
    return this.clob;
  }
  get portfolioRef(): Portfolio {
    return this.portfolio;
  }

  private targetCities(): string[] {
    const wanted = this.cfg.CITIES;
    if (wanted.length === 0 || wanted.includes("all")) return allCityKeys();
    return wanted;
  }

  /**
   * Run one full pass. With execute=false it only analyzes and reports (used by
   * `scan`); with execute=true it sizes, risk-checks, and fires orders (`run`).
   */
  async runOnce(opts: { execute: boolean }): Promise<EventReport[]> {
    const cities = this.targetCities();
    const events = await this.gamma.fetchWeatherEvents(cities);

    // Filter to the configured horizon (today .. +MAX_DAYS_AHEAD).
    const inWindow = events.filter((e) => {
      const city = getCity(e.cityKey);
      if (!city) return false;
      const lead = daysAhead(e.dateLocal, city.timezone);
      return lead >= 0 && lead <= this.cfg.MAX_DAYS_AHEAD;
    });
    log.info(`evaluating ${inWindow.length}/${events.length} events within ${this.cfg.MAX_DAYS_AHEAD}d horizon`);

    const reports: EventReport[] = [];
    for (const event of inWindow) {
      try {
        const report = await this.evaluateEvent(event, opts.execute);
        reports.push(report);
      } catch (err) {
        log.warn(`event ${event.slug} failed: ${(err as Error).message}`);
      }
    }
    return reports;
  }

  private async evaluateEvent(event: WeatherEvent, execute: boolean): Promise<EventReport> {
    const city = getCity(event.cityKey)!;
    const forecast = await buildForecast(city, event.dateLocal);

    // Fetch order books for every token in the event.
    const books = new Map<string, BookSnapshot>();
    await Promise.all(
      event.markets.flatMap((m) => [m.yesTokenId, m.noTokenId]).map(async (tokenId) => {
        try {
          books.set(tokenId, await this.clob.getBook(tokenId));
        } catch (err) {
          log.debug(`book fetch failed for ${tokenId}: ${(err as Error).message}`);
        }
      }),
    );

    const marketViews: MarketView[] = event.markets.map((m) => {
      const p = forecast.probOfBucket(m.bucket);
      return {
        question: m.question,
        bucket: describeBucket(m.bucket),
        modelProb: p,
        marketPrice: m.yesPriceHint,
        edge: p - m.yesPriceHint,
      };
    });

    const candidates = findEdges(event, forecast, books, this.cfg);
    const signals = this.sizeCandidates(event, candidates);

    const executions: ExecutionResult[] = [];
    if (execute) {
      for (const signal of signals) {
        executions.push(await this.executor.execute(signal));
      }
    }

    return { event, forecast, marketViews, candidates, signals, executions };
  }

  /** Convert edge candidates into risk-checked, sized trade signals. */
  private sizeCandidates(event: WeatherEvent, candidates: EdgeCandidate[]): TradeSignal[] {
    const signals: TradeSignal[] = [];
    for (const c of candidates) {
      const desired = kellyStake(c.modelProb, c.price, this.cfg.BANKROLL, this.cfg.KELLY_FRACTION);
      if (desired <= 0) continue;
      // Don't try to take more than the book offers.
      const capped = Math.min(desired, c.bookLiquidity);
      const risk = applyRiskLimits(capped, { cityKey: event.cityKey, dateLocal: event.dateLocal }, this.portfolio, this.cfg);
      if (risk.blocked) {
        log.debug(`risk blocked ${c.outcomeLabel} ${c.market.question}: ${risk.reason}`);
        continue;
      }
      const stake = risk.allowedStake;
      const size = stake / c.price;
      signals.push({
        eventId: event.id,
        marketId: c.market.id,
        cityKey: event.cityKey,
        dateLocal: event.dateLocal,
        question: c.market.question,
        tokenId: c.tokenId,
        side: "BUY",
        modelProb: c.modelProb,
        price: c.price,
        edge: c.edge,
        stake,
        size: Number(size.toFixed(2)),
        tickSize: c.market.tickSize,
        negRisk: c.market.negRisk,
        reason: `${c.outcomeLabel} edge ${(c.edge * 100).toFixed(1)}pp @ ${c.price.toFixed(3)}`,
      });
    }
    return signals;
  }
}

function describeBucket(b: { kind: string; value: number }): string {
  if (b.kind === "at_or_below") return `≤${b.value}°C`;
  if (b.kind === "at_or_above") return `≥${b.value}°C`;
  return `=${b.value}°C`;
}
