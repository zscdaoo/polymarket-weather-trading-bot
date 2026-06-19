import type { Config } from "../config.js";
import type { ClobTradingClient } from "../polymarket/clob.js";
import type { Portfolio } from "./portfolio.js";
import type { FillRecord, TradeSignal } from "../types.js";
import { log } from "../logger.js";

export interface ExecutionResult {
  ok: boolean;
  mode: "paper" | "live";
  orderId?: string;
  error?: string;
  fill?: FillRecord;
}

/**
 * Turns a TradeSignal into a fill. In paper mode it simulates an immediate fill
 * at the signal price; in live mode it posts a real order to the CLOB and only
 * books the position if the venue accepts it.
 */
export class Executor {
  constructor(
    private readonly cfg: Config,
    private readonly clob: ClobTradingClient,
    private readonly portfolio: Portfolio,
  ) {}

  async execute(signal: TradeSignal): Promise<ExecutionResult> {
    const mode = this.cfg.TRADING_MODE;
    const ts = new Date().toISOString();
    const baseFill: FillRecord = {
      ts,
      mode,
      marketId: signal.marketId,
      tokenId: signal.tokenId,
      side: signal.side,
      price: signal.price,
      size: signal.size,
      stake: signal.stake,
      question: signal.question,
    };

    if (mode === "paper") {
      this.book(baseFill, signal);
      log.info(
        `PAPER fill: BUY ${signal.size.toFixed(2)} @ ${signal.price.toFixed(3)} ` +
          `($${signal.stake.toFixed(2)}) — ${signal.question}`,
      );
      return { ok: true, mode, fill: baseFill };
    }

    // live
    try {
      const res = await this.clob.placeOrder({
        tokenId: signal.tokenId,
        side: "BUY",
        price: signal.price,
        size: signal.size,
        tickSize: signal.tickSize,
        negRisk: signal.negRisk,
      });
      const fill: FillRecord = { ...baseFill, orderId: res.orderId };
      this.book(fill, signal);
      log.info(
        `LIVE order ${res.orderId ?? "?"} (${res.status ?? "?"}): BUY ${signal.size.toFixed(2)} ` +
          `@ ${signal.price.toFixed(3)} — ${signal.question}`,
      );
      return { ok: true, mode, orderId: res.orderId, fill };
    } catch (err) {
      const error = (err as Error).message;
      log.error(`LIVE order failed: ${error} — ${signal.question}`);
      return { ok: false, mode, error };
    }
  }

  private book(fill: FillRecord, signal: TradeSignal): void {
    this.portfolio.applyBuy(fill, {
      cityKey: signal.cityKey,
      dateLocal: signal.dateLocal,
      modelProb: signal.modelProb,
    });
  }
}
