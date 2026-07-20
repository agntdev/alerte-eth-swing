// Technical indicator calculations for ETH swing trading.
// Pure functions over candle arrays — no I/O, fully testable.

import type { IndicatorState, MarketCandle } from "./store.js";

// ---------------------------------------------------------------------------
// EMA — Exponential Moving Average
// ---------------------------------------------------------------------------

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i]! * k + result[i - 1]! * (1 - k));
  }
  return result;
}

// ---------------------------------------------------------------------------
// RSI — Relative Strength Index (Wilder's smoothing)
// ---------------------------------------------------------------------------

export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50; // neutral default
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff > 0) gainSum += diff; else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ---------------------------------------------------------------------------
// MACD — Moving Average Convergence Divergence
// ---------------------------------------------------------------------------

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}

export function macd(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  if (closes.length < slowPeriod + signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0 };
  }
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);
  const macdLine = emaFast.map((f, i) => f - (emaSlow[i] ?? f));
  const signalLine = ema(macdLine, signalPeriod);
  const lastIdx = closes.length - 1;
  const m = macdLine[lastIdx] ?? 0;
  const s = signalLine[lastIdx] ?? 0;
  return { macd: m, signal: s, histogram: m - s };
}

// ---------------------------------------------------------------------------
// ATR — Average True Range
// ---------------------------------------------------------------------------

export function atr(candles: MarketCandle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i]!;
    const prev = candles[i - 1]!;
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    trs.push(tr);
  }
  if (trs.length < period) {
    return trs.reduce((a, b) => a + b, 0) / trs.length;
  }
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]!) / period;
  }
  return atrVal;
}

// ---------------------------------------------------------------------------
// Compute all indicators from candle data
// ---------------------------------------------------------------------------

export function computeIndicators(candles: MarketCandle[]): IndicatorState | null {
  if (candles.length < 30) return null; // need enough data

  const closes = candles.map((c) => c.close);
  const ema20Values = ema(closes, 20);
  const ema50Values = ema(closes, 50);
  const rsiValue = rsi(closes, 14);
  const macdResult = macd(closes);
  const atrValue = atr(candles, 14);

  return {
    ema20: ema20Values[ema20Values.length - 1] ?? 0,
    ema50: ema50Values[ema50Values.length - 1] ?? 0,
    rsi: rsiValue,
    macd: macdResult.macd,
    macd_signal: macdResult.signal,
    macd_histogram: macdResult.histogram,
    atr: atrValue,
    timeframe: "1d",
    updated_at: Date.now(),
  };
}
