import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { FillRecord, Position } from "../types.js";
import { log } from "../logger.js";

/** Persistent bot state, stored as a single JSON file. */
export interface BotState {
  positions: Position[];
  fills: FillRecord[];
  /** Realized PnL (USDC) keyed by local date YYYY-MM-DD. */
  realizedByDate: Record<string, number>;
}

const EMPTY: BotState = { positions: [], fills: [], realizedByDate: {} };

export class Store {
  private state: BotState;

  constructor(private readonly path: string) {
    this.state = this.read();
  }

  private read(): BotState {
    if (!existsSync(this.path)) return structuredClone(EMPTY);
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<BotState>;
      return { ...structuredClone(EMPTY), ...parsed };
    } catch (err) {
      log.warn(`could not read state at ${this.path}, starting fresh: ${(err as Error).message}`);
      return structuredClone(EMPTY);
    }
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.state, null, 2));
  }

  get data(): BotState {
    return this.state;
  }

  positionByToken(tokenId: string): Position | undefined {
    return this.state.positions.find((p) => p.tokenId === tokenId);
  }

  upsertPosition(p: Position): void {
    const idx = this.state.positions.findIndex((x) => x.tokenId === p.tokenId);
    if (idx >= 0) this.state.positions[idx] = p;
    else this.state.positions.push(p);
  }

  recordFill(f: FillRecord): void {
    this.state.fills.push(f);
  }

  addRealized(dateLocal: string, pnl: number): void {
    this.state.realizedByDate[dateLocal] = (this.state.realizedByDate[dateLocal] ?? 0) + pnl;
  }
}
