import "dotenv/config";
import { z } from "zod";
import { setLogLevel, type LogLevel } from "./logger.js";

/** Coerce a comma-separated env string into a string[] (trimmed, non-empty). */
const csv = z
  .string()
  .optional()
  .transform((s) =>
    (s ?? "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );

const num = (def: number) => z.coerce.number().default(def);

const schema = z.object({
  // wallet / polymarket
  PRIVATE_KEY: z.string().default(""),
  FUNDER_ADDRESS: z.string().default(""),
  SIGNATURE_TYPE: z.coerce.number().int().min(0).max(2).default(0),
  CLOB_HOST: z.string().url().default("https://clob.polymarket.com"),
  GAMMA_HOST: z.string().url().default("https://gamma-api.polymarket.com"),
  CHAIN_ID: z.coerce.number().int().default(137),
  CLOB_API_KEY: z.string().default(""),
  CLOB_API_SECRET: z.string().default(""),
  CLOB_API_PASSPHRASE: z.string().default(""),

  // mode + risk
  TRADING_MODE: z.enum(["paper", "live"]).default("paper"),
  MIN_EDGE: num(0.08),
  MIN_PRICE: num(0.03),
  MAX_PRICE: num(0.97),
  KELLY_FRACTION: num(0.25),
  BANKROLL: num(1000),
  MAX_STAKE_PER_MARKET: num(50),
  MAX_STAKE_PER_EVENT: num(150),
  MAX_TOTAL_EXPOSURE: num(1000),
  MAX_DAILY_LOSS: num(200),
  MIN_BOOK_LIQUIDITY: num(20),

  CITIES: csv,
  MAX_DAYS_AHEAD: z.coerce.number().int().min(0).default(2),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  cached = parsed.data;
  setLogLevel(cached.LOG_LEVEL as LogLevel);
  return cached;
}

/** Throw early if live trading is requested without the credentials to do it. */
export function assertLiveReady(cfg: Config): void {
  const missing: string[] = [];
  if (!cfg.PRIVATE_KEY || !cfg.PRIVATE_KEY.startsWith("0x")) missing.push("PRIVATE_KEY");
  if (!cfg.FUNDER_ADDRESS) missing.push("FUNDER_ADDRESS");
  if (missing.length) {
    throw new Error(
      `TRADING_MODE=live requires ${missing.join(", ")} in .env. ` +
        `Refusing to start live trading without them.`,
    );
  }
}
