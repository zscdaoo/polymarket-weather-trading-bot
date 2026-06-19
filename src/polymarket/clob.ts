import { ClobClient, Side as ClobSide, OrderType, type TickSize } from "@polymarket/clob-client";
import { ethers } from "ethers";
import type { BookSnapshot, Side } from "../types.js";
import type { Config } from "../config.js";
import { log } from "../logger.js";

/**
 * Thin wrapper over @polymarket/clob-client.
 *
 * NOTE: that package is archived (Polymarket now ships a beta unified ts-sdk),
 * but it remains the battle-tested way to trade the live CLOB today and uses
 * ethers v5. Keeping all of its surface area behind this one class means the
 * rest of the bot is decoupled and a future SDK migration touches only here.
 *
 * Auth model:
 *   L1 — your wallet private key signs orders (EIP-712).
 *   L2 — an API key/secret/passphrase derived from L1 authenticates REST calls.
 */
export class ClobTradingClient {
  private client: ClobClient | null = null;
  private readonly cfg: Config;
  /** Read-only client (no creds) — enough for order books. */
  private readClient: ClobClient | null = null;

  constructor(cfg: Config) {
    this.cfg = cfg;
  }

  /** Lazily build a read-only client for public data (order books). */
  private reader(): ClobClient {
    if (!this.readClient) {
      this.readClient = new ClobClient(this.cfg.CLOB_HOST, this.cfg.CHAIN_ID);
    }
    return this.readClient;
  }

  /** Build (and memoize) the authenticated client needed to place orders. */
  async ensureAuthed(): Promise<ClobClient> {
    if (this.client) return this.client;
    if (!this.cfg.PRIVATE_KEY) throw new Error("PRIVATE_KEY required to authenticate with the CLOB");

    const signer = new ethers.Wallet(this.cfg.PRIVATE_KEY);
    const creds =
      this.cfg.CLOB_API_KEY && this.cfg.CLOB_API_SECRET && this.cfg.CLOB_API_PASSPHRASE
        ? {
            key: this.cfg.CLOB_API_KEY,
            secret: this.cfg.CLOB_API_SECRET,
            passphrase: this.cfg.CLOB_API_PASSPHRASE,
          }
        : await this.deriveCreds(signer);

    this.client = new ClobClient(
      this.cfg.CLOB_HOST,
      this.cfg.CHAIN_ID,
      signer,
      creds,
      this.cfg.SIGNATURE_TYPE,
      this.cfg.FUNDER_ADDRESS || undefined,
    );
    log.info(`CLOB authenticated (signer ${await signer.getAddress()}, funder ${this.cfg.FUNDER_ADDRESS})`);
    return this.client;
  }

  /** Derive L2 API creds from the wallet; print once so they can be cached in .env. */
  async deriveCreds(
    signer?: ethers.Wallet,
  ): Promise<{ key: string; secret: string; passphrase: string }> {
    const s = signer ?? new ethers.Wallet(this.cfg.PRIVATE_KEY);
    const bootstrap = new ClobClient(this.cfg.CLOB_HOST, this.cfg.CHAIN_ID, s);
    const creds = await bootstrap.createOrDeriveApiKey();
    return { key: creds.key, secret: creds.secret, passphrase: creds.passphrase };
  }

  /** Top-of-book snapshot for a token (best bid/ask, sizes, mid). */
  async getBook(tokenId: string): Promise<BookSnapshot> {
    const book = await this.reader().getOrderBook(tokenId);
    const bids = (book.bids ?? []).map((o) => ({ price: Number(o.price), size: Number(o.size) }));
    const asks = (book.asks ?? []).map((o) => ({ price: Number(o.price), size: Number(o.size) }));
    // Defensive: order books are usually sorted, but don't rely on it.
    const bestBid = bids.reduce((b, o) => (o.price > b.price ? o : b), { price: 0, size: 0 });
    const bestAsk = asks.reduce((a, o) => (o.price < a.price ? o : a), { price: 1, size: 0 });
    const mid = bestAsk.price > bestBid.price ? (bestBid.price + bestAsk.price) / 2 : bestBid.price || bestAsk.price;
    return {
      tokenId,
      bidPrice: bestBid.price,
      bidSize: bestBid.size,
      askPrice: bestAsk.price,
      askSize: bestAsk.size,
      midPrice: mid,
    };
  }

  /** Snap an arbitrary tick value onto the CLOB's allowed TickSize union. */
  // (declared as a free function below)

  /** Round a price to the market tick size. */
  static roundToTick(price: number, tickSize: number): number {
    const ticks = Math.round(price / tickSize);
    return Number((ticks * tickSize).toFixed(6));
  }

  /**
   * Place a limit order. Returns the venue order id on success.
   * Uses GTC by default; pass FOK for immediate-or-kill marketable orders.
   */
  async placeOrder(args: {
    tokenId: string;
    side: Side;
    price: number;
    size: number;
    tickSize: number;
    negRisk: boolean;
    fok?: boolean;
  }): Promise<{ orderId?: string; status?: string; raw: unknown }> {
    const client = await this.ensureAuthed();
    const price = ClobTradingClient.roundToTick(args.price, args.tickSize);
    const order = await client.createOrder(
      {
        tokenID: args.tokenId,
        price,
        side: args.side === "BUY" ? ClobSide.BUY : ClobSide.SELL,
        size: args.size,
        feeRateBps: 0,
      },
      { tickSize: toTickSize(args.tickSize), negRisk: args.negRisk },
    );
    const resp = await client.postOrder(order, args.fok ? OrderType.FOK : OrderType.GTC);
    return { orderId: (resp as { orderID?: string }).orderID, status: (resp as { status?: string }).status, raw: resp };
  }
}

const TICK_SIZES: TickSize[] = ["0.1", "0.01", "0.001", "0.0001"];

/** Map a numeric tick (e.g. 0.001) onto the CLOB's allowed TickSize literals. */
function toTickSize(tick: number): TickSize {
  const s = String(tick) as TickSize;
  if (TICK_SIZES.includes(s)) return s;
  // Fall back to the closest allowed tick by value.
  let best: TickSize = "0.001";
  let bestDiff = Infinity;
  for (const t of TICK_SIZES) {
    const d = Math.abs(Number(t) - tick);
    if (d < bestDiff) {
      bestDiff = d;
      best = t;
    }
  }
  return best;
}
