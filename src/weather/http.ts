import { log } from "../logger.js";

/** GET JSON with a timeout, a couple of retries, and a friendly User-Agent. */
export async function getJson<T>(
  url: string,
  opts: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 15_000, retries = 2, headers = {} } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json", "User-Agent": "polymarket-weather-bot/0.1", ...headers },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const backoff = 400 * 2 ** attempt;
        log.debug(`fetch retry ${attempt + 1} in ${backoff}ms: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`GET failed after ${retries + 1} attempts: ${(lastErr as Error)?.message}`);
}
