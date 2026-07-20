// Market data service — fetches ETH OHLCV candle data from CoinGecko's
// free API. No API key required for the public endpoints used here.

import type { MarketCandle } from "./store.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

type FetchFn = typeof fetch;

/**
 * Fetch ETH OHLCV candles from CoinGecko.
 * - days=90 → daily candles (granularity: daily)
 * - Returns up to `limit` candles, most recent last.
 * Handles network errors gracefully — returns [] on failure so the bot
 * continues operating without market data.
 */
export async function fetchEthCandles(
  opts?: { days?: number; limit?: number; fetch?: FetchFn },
): Promise<MarketCandle[]> {
  const days = opts?.days ?? 90;
  const limit = opts?.limit ?? 90;
  const doFetch = opts?.fetch ?? globalThis.fetch;

  try {
    // CoinGecko OHLC endpoint: /coins/{id}/ohlc
    // For daily data we use /market_chart instead (includes volume).
    const url = `${COINGECKO_BASE}/coins/ethereum/market_chart?vs_currency=usd&days=${days}&interval=daily`;
    const res = await doFetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      prices?: [number, number][];
      total_volumes?: [number, number][];
    };

    const prices = data.prices ?? [];
    const volumes = data.total_volumes ?? [];

    const candles: MarketCandle[] = [];
    for (let i = 0; i < prices.length && candles.length < limit; i++) {
      const [ts, price] = prices[i]!;
      const vol = volumes[i]?.[1] ?? 0;
      // CoinGecko daily chart gives close prices; approximate OHLC from
      // consecutive closes for indicator calculation purposes.
      const prev = i > 0 ? prices[i - 1]![1] : price;
      const high = Math.max(price, prev) * 1.005;
      const low = Math.min(price, prev) * 0.995;
      candles.push({
        timestamp: ts,
        open: prev,
        high,
        low,
        close: price,
        volume: vol,
      });
    }
    return candles;
  } catch {
    return [];
  }
}

/**
 * Fetch the current ETH price in USD.
 * Returns null on failure.
 */
export async function fetchEthPrice(
  fetchFn?: FetchFn,
): Promise<number | null> {
  const doFetch = fetchFn ?? globalThis.fetch;
  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=ethereum&vs_currencies=usd`;
    const res = await doFetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json() as { ethereum?: { usd?: number } };
    return data.ethereum?.usd ?? null;
  } catch {
    return null;
  }
}
