# Polymarket Weather Bot
<img width="680" height="355" alt="HGYvjq4a4AAiRJw" src="https://github.com/user-attachments/assets/b6829db7-0713-424a-b384-73602ae4e969" />

**English** · [简体中文](README.zh-CN.md) · [Русский](README.ru.md)

A TypeScript bot that trades Polymarket **daily-high temperature** markets
("Will the highest temperature in Seoul be 29°C on June 19?") using a
probabilistic forecast instead of a point guess.

It does what sharp weather traders do by hand: build a *distribution* of the
day's high temperature, convert it into a probability for every °C bucket the
market exposes, compare that to the live order-book price, and bet — selectively
and sized — only where the model and the market meaningfully disagree.

```
ensemble forecast ──► distribution over °C buckets ──► P(bucket)
                                                          │
live order book ──► market price per bucket ─────────────┤
                                                          ▼
                                          edge = P(bucket) − price
                                          │  (gate on min edge / price / liquidity)
                                          ▼
                          fractional-Kelly stake ──► risk caps ──► order
```

## How it works

| Stage | Module | What it does |
|-------|--------|--------------|
| Discover | [src/polymarket/gamma.ts](src/polymarket/gamma.ts) | Finds active "highest temperature in {city}" events via the Gamma `public-search` API and parses each Yes/No market into a temperature **bucket** (`≤24`, `=25`, … `≥34`). |
| Forecast | [src/weather/forecast.ts](src/weather/forecast.ts) | Pulls the **Open-Meteo ensemble** (≈140 members across 4 models), takes each member's daily max, and builds a Gaussian-kernel distribution. For US cities it recenters on the **NWS** deterministic max. |
| Bucket math | [src/strategy/buckets.ts](src/strategy/buckets.ts) | Maps each bucket to the real-temperature interval `[lo, hi)` that resolves it, honoring each city's rounding rule. |
| Edge | [src/strategy/edge.ts](src/strategy/edge.ts) | **De-vigs** the bucket ladder (normalises YES prices to sum to 1) to recover the true market-implied distribution, **shrinks** the model toward it (`MODEL_WEIGHT`), then keeps candidates whose blended edge passes the edge/price/liquidity gates. |
| Sizing | [src/strategy/sizing.ts](src/strategy/sizing.ts) | Fractional-Kelly stake on the *blended* probability: `f* = (q − p)/(1 − p)`, scaled by `KELLY_FRACTION`, with a **correlation discount** (`CORRELATION_DECAY`) on stacked same-direction bets across the ladder. |
| Risk | [src/risk/guards.ts](src/risk/guards.ts) | Per-market, per-event, total-exposure and daily-loss caps. |
| Execute | [src/trading/executor.ts](src/trading/executor.ts) | Paper-simulates fills, or places real CLOB orders in live mode. |
| Track | [src/trading/portfolio.ts](src/trading/portfolio.ts) + [src/store/db.ts](src/store/db.ts) | Positions, exposure and realized PnL persisted to `data/state.json`. |

## Setup

```bash
npm install
cp .env.example .env        # then edit .env
```

Edit `.env`. Everything has a safe default and `TRADING_MODE=paper`, so you can
run read-only commands with no wallet at all.

## Commands

```bash
npm run forecast -- hong_kong          # print the temperature distribution
npm run forecast -- nyc 2026-06-20     # for a specific date

npm run scan                           # analyze all markets, show edges + intended
                                       # trades — never places orders

npm run run-once                       # one pass that executes (paper or live)
npm run watch -- 10                    # repeat run every 10 minutes

npm run auth                           # derive CLOB API creds to cache in .env
npm run portfolio                      # positions, exposure, realized PnL
```

`scan` is always read-only and needs no credentials — start there.

## Going live

1. Fund a **dedicated** Polygon wallet with USDC (not your main wallet).
2. Set `PRIVATE_KEY`, `FUNDER_ADDRESS` (your Polymarket profile address) and
   `SIGNATURE_TYPE` (`0` EOA / `1` Magic-email / `2` Safe) in `.env`.
3. Run `npm run auth` once and paste the printed creds back into `.env`.
4. Set `BANKROLL` to no more than your real balance and keep `KELLY_FRACTION`
   low (0.25 = quarter-Kelly).
5. Flip `TRADING_MODE=live`. The bot refuses to start live without the keys.

## ⚠️ Calibrate before trusting it

The forecast quality is only as good as its alignment with the **official
resolution station**. Two knobs in [src/weather/cities.ts](src/weather/cities.ts) matter most:

- **`rounding`** — does the station report a *rounded* (`26` = 25.5–26.5) or
  *floored* integer? Wrong choice shifts every probability.
- **`biasC`** — a small additive correction if the model's 2 m temperature runs
  systematically hot/cold vs the station's microclimate.

When you run `scan` you will sometimes see **very large** model-vs-market edges.
Treat those as a *prompt to verify your calibration*, not as free money — the
market often knows the station's quirks better than an uncalibrated model does.
Use `archiveDailyHighs()` in [src/weather/openmeteo.ts](src/weather/openmeteo.ts)
to backtest model output against historical official highs and tune `biasC`
before risking capital.

## Built-in safety guards

These are on by default and tunable in `.env`:

- **Edge sanity cap** (`EDGE_SANITY_CAP`, default 0.35) — edges larger than this
  are treated as *model error* and skipped, so the bot never bets hardest on the
  most-mispriced signal.
- **Spread inflation** (`SPREAD_INFLATION`, default 1.4) — daily-max ensembles are
  under-dispersed; this widens the predictive distribution so the model stops
  manufacturing false certainty.
- **Intraday floor** — for same-day markets the distribution is clamped at the
  temperature already observed today (the high can't end up below it).
- **Resolution guard** (`MIN_MINUTES_TO_RESOLVE`, default 60) — never trades an
  event about to settle.
- **Leak-proof caps** — per-market, per-event and total-exposure limits account
  for both booked positions *and* stakes committed earlier in the same pass, so
  repeated `watch` passes can't accumulate past the ceilings.

## Strategy refinements

The edge isn't a naive "model minus price":

- **De-vig** (`src/strategy/edge.ts`) — the YES prices across a bucket ladder sum
  to more than 1 (the market's overround). We normalise them to recover the true
  market-implied distribution and compare against *that*, so edges aren't inflated
  by the spread you'd pay.
- **Model↔market shrinkage** (`MODEL_WEIGHT`, default 0.5) — we trade on a blend
  `w·model + (1−w)·market` rather than the raw model, because the market embeds
  station climatology an uncalibrated model lacks. Keep `MODEL_WEIGHT` moderate
  until you've tuned `biasC`.
- **Correlation-aware sizing** (`CORRELATION_DECAY`, default 0.5) — NO bets on
  adjacent buckets (e.g. 29 / 30 / 31°C) are nearly the same view, so each extra
  same-direction bet in an event is sized down geometrically instead of stacking
  full Kelly on one correlated position.

This software is for research/educational use. Trading involves real financial
risk; you are responsible for your own funds and decisions.

## Notes

- The `@polymarket/clob-client` dependency is archived but still the most
  battle-tested way to trade the live CLOB; it's isolated behind
  [src/polymarket/clob.ts](src/polymarket/clob.ts) so migrating to Polymarket's
  new unified SDK later touches only that one file.
- No paid services required: Open-Meteo and NWS are both free and keyless.

[Reference](https://x.com/polysuccubus/status/2046644181347491847)
