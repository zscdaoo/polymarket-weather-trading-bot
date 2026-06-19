import { loadConfig, assertLiveReady, type Config } from "./config.js";
import { Engine, type EventReport } from "./strategy/engine.js";
import { buildForecast } from "./weather/forecast.js";
import { getCity, allCityKeys } from "./weather/cities.js";
import { todayLocal, addDays } from "./util/time.js";
import { log } from "./logger.js";

/* ──────────────────────────────────────────────────────────────────────────
 * CLI:  tsx src/index.ts <command> [...args]
 *   scan                 analyze markets, print edges & intended trades (no orders)
 *   run                  one pass that executes trades (paper or live per .env)
 *   watch [intervalMin]  repeat `run` on an interval (default 10 min)
 *   forecast <city> [d]  print the temperature distribution for a city/date
 *   auth                 derive & print CLOB API credentials to cache in .env
 *   portfolio            show open positions, exposure and realized PnL
 * ──────────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const cfg = loadConfig();
  const [cmd = "scan", ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "scan":
      await cmdScan(cfg);
      break;
    case "run":
      await cmdRun(cfg);
      break;
    case "watch":
      await cmdWatch(cfg, Number(rest[0] ?? 10));
      break;
    case "forecast":
      await cmdForecast(rest[0], rest[1]);
      break;
    case "auth":
      await cmdAuth(cfg);
      break;
    case "portfolio":
      cmdPortfolio(cfg);
      break;
    default:
      console.log(`Unknown command '${cmd}'. Try: scan | run | watch | forecast | auth | portfolio`);
      process.exitCode = 1;
  }
}

async function cmdScan(cfg: Config): Promise<void> {
  log.info(`MODE=${cfg.TRADING_MODE} (scan is always read-only) cities=${cfg.CITIES.join(",") || "all"}`);
  const engine = new Engine(cfg);
  const reports = await engine.runOnce({ execute: false });
  printReports(reports);
}

async function cmdRun(cfg: Config): Promise<void> {
  if (cfg.TRADING_MODE === "live") assertLiveReady(cfg);
  log.info(`RUN mode=${cfg.TRADING_MODE.toUpperCase()} — orders WILL be ${cfg.TRADING_MODE === "live" ? "PLACED LIVE" : "simulated"}`);
  const engine = new Engine(cfg);
  const reports = await engine.runOnce({ execute: true });
  printReports(reports);
  const fills = reports.flatMap((r) => r.executions).filter((e) => e.ok).length;
  log.info(`pass complete: ${fills} fills`);
}

async function cmdWatch(cfg: Config, intervalMin: number): Promise<void> {
  const ms = Math.max(1, intervalMin) * 60_000;
  log.info(`watching every ${intervalMin} min — Ctrl+C to stop`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await cmdRun(cfg);
    } catch (err) {
      log.error(`pass error: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, ms));
  }
}

async function cmdForecast(cityKey?: string, dateArg?: string): Promise<void> {
  if (!cityKey) {
    console.log(`usage: forecast <city> [YYYY-MM-DD]\ncities: ${allCityKeys().join(", ")}`);
    return;
  }
  const city = getCity(cityKey);
  if (!city) {
    console.log(`unknown city '${cityKey}'. known: ${allCityKeys().join(", ")}`);
    return;
  }
  const date = dateArg ?? todayLocal(city.timezone);
  const f = await buildForecast(city, date);
  console.log(`\nForecast — ${city.displayName} ${date}`);
  console.log(`  source : ${f.source}`);
  console.log(`  mean   : ${f.mean.toFixed(2)}°C   sd: ${f.stdDev.toFixed(2)}°C   members: ${f.members.length}`);
  console.log(`  distribution over integer buckets (rounding=${city.rounding}):`);
  const lo = Math.floor(f.mean - 4);
  const hi = Math.ceil(f.mean + 4);
  for (let v = lo; v <= hi; v++) {
    const p = f.probOfBucket({
      kind: "exact",
      value: v,
      lo: city.rounding === "round" ? v - 0.5 : v,
      hi: city.rounding === "round" ? v + 0.5 : v + 1,
    });
    const bar = "█".repeat(Math.round(p * 40));
    console.log(`   ${String(v).padStart(3)}°C  ${(p * 100).toFixed(1).padStart(5)}%  ${bar}`);
  }
}

async function cmdAuth(cfg: Config): Promise<void> {
  if (!cfg.PRIVATE_KEY) {
    console.log("Set PRIVATE_KEY in .env first.");
    return;
  }
  const { ClobTradingClient } = await import("./polymarket/clob.js");
  const client = new ClobTradingClient(cfg);
  const creds = await client.deriveCreds();
  console.log("\nDerived CLOB API credentials — paste into your .env:\n");
  console.log(`CLOB_API_KEY=${creds.key}`);
  console.log(`CLOB_API_SECRET=${creds.secret}`);
  console.log(`CLOB_API_PASSPHRASE=${creds.passphrase}\n`);
}

function cmdPortfolio(cfg: Config): void {
  const engine = new Engine(cfg);
  const pf = engine.portfolioRef;
  const positions = pf.openPositions();
  console.log(`\nPortfolio (mode=${cfg.TRADING_MODE})`);
  console.log(`  open positions : ${positions.length}`);
  console.log(`  total exposure : $${pf.totalExposure().toFixed(2)} / $${cfg.MAX_TOTAL_EXPOSURE}`);
  console.log(`  realized today : $${pf.realizedToday().toFixed(2)}`);
  for (const p of positions) {
    console.log(
      `   • ${p.shares.toFixed(1)} sh @ ${p.avgPrice.toFixed(3)} ($${p.costBasis.toFixed(2)}) ` +
        `— ${p.question}`,
    );
  }
}

function printReports(reports: EventReport[]): void {
  if (reports.length === 0) {
    console.log("No active temperature events in the configured window.");
    return;
  }
  for (const r of reports) {
    console.log(`\n══ ${r.event.title}  [${r.event.dateLocal}]`);
    console.log(
      `   forecast: ${r.forecast.mean.toFixed(1)}°C ±${r.forecast.stdDev.toFixed(1)} (${r.forecast.source})`,
    );
    for (const v of r.marketViews) {
      const flag = Math.abs(v.edge) >= 0.08 ? (v.edge > 0 ? " <== cheap" : " <== rich") : "";
      console.log(
        `     ${v.bucket.padEnd(7)} model ${(v.modelProb * 100).toFixed(1).padStart(5)}%  ` +
          `mkt ${(v.marketPrice * 100).toFixed(1).padStart(5)}%  edge ${(v.edge * 100).toFixed(1).padStart(6)}pp${flag}`,
      );
    }
    if (r.signals.length) {
      console.log(`   TRADES:`);
      for (const s of r.signals) {
        console.log(
          `     → BUY ${s.size.toFixed(1)} ${s.tokenId.slice(0, 8)}… @ ${s.price.toFixed(3)} ` +
            `$${s.stake.toFixed(2)}  [${s.reason}]`,
        );
      }
    } else {
      console.log(`   (no trades clear the edge/risk gates)`);
    }
  }
}

main().catch((err) => {
  log.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
