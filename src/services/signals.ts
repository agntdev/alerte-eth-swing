// Signal generation — evaluates indicator states against trading rules
// and generates buy/sell signals with confidence scores.

import type { IndicatorState, Signal } from "./store.js";
import { now } from "./clock.js";

// ---------------------------------------------------------------------------
// Signal rules
// ---------------------------------------------------------------------------

export interface SignalRule {
  name: string;
  met: boolean;
  weight: number; // contribution to confidence score
}

/** Evaluate swing-trade signal rules against current indicators. */
export function evaluateRules(ind: IndicatorState, currentPrice: number): {
  type: "buy" | "sell" | null;
  rules: SignalRule[];
  confidence: number;
  reasons: string[];
} {
  const rules: SignalRule[] = [];
  const reasons: string[] = [];

  // Rule 1: EMA crossover — EMA20 > EMA50 = bullish, < = bearish
  const emaBullish = ind.ema20 > ind.ema50;
  const emaBearish = ind.ema20 < ind.ema50;
  rules.push({ name: "EMA crossover", met: true, weight: 25 });
  if (emaBullish) reasons.push("EMA20 > EMA50 (haussier)");
  else if (emaBearish) reasons.push("EMA20 < EMA50 (baissier)");

  // Rule 2: RSI — oversold (<30) = buy signal, overbought (>70) = sell signal
  const rsiOversold = ind.rsi < 30;
  const rsiOverbought = ind.rsi > 70;
  rules.push({ name: "RSI", met: rsiOversold || rsiOverbought, weight: 25 });
  if (rsiOversold) reasons.push(`RSI ${ind.rsi.toFixed(1)} (survente)`);
  else if (rsiOverbought) reasons.push(`RSI ${ind.rsi.toFixed(1)} (surachat)`);

  // Rule 3: MACD — histogram positive = bullish momentum, negative = bearish
  const macdBullish = ind.macd_histogram > 0;
  const macdBearish = ind.macd_histogram < 0;
  rules.push({ name: "MACD", met: true, weight: 25 });
  if (macdBullish) reasons.push("MACD haussier");
  else if (macdBearish) reasons.push("MACD baissier");

  // Rule 4: ATR — volatility check (ATR > 1% of price = sufficient volatility)
  const atrPct = (ind.atr / currentPrice) * 100;
  const sufficientVol = atrPct > 1;
  rules.push({ name: "ATR volatility", met: sufficientVol, weight: 25 });
  if (sufficientVol) reasons.push(`Volatilité suffisante (ATR ${atrPct.toFixed(2)}%)`);

  // Determine signal type based on majority vote
  const bullishScore = (emaBullish ? 25 : 0) + (rsiOversold ? 25 : 0) +
    (macdBullish ? 25 : 0) + (sufficientVol ? 25 : 0);
  const bearishScore = (emaBearish ? 25 : 0) + (rsiOverbought ? 25 : 0) +
    (macdBearish ? 25 : 0) + (sufficientVol ? 25 : 0);

  let type: "buy" | "sell" | null = null;
  let confidence = 0;

  if (bullishScore >= 50 && bullishScore > bearishScore) {
    type = "buy";
    confidence = bullishScore;
  } else if (bearishScore >= 50 && bearishScore > bullishScore) {
    type = "sell";
    confidence = bearishScore;
  }

  return { type, rules, confidence, reasons };
}

// ---------------------------------------------------------------------------
// Signal deduplication — 24h per type
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isDuplicate(type: string, lastSignalTime: number): boolean {
  return (now().getTime() - lastSignalTime) < DEDUP_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Generate a signal from indicator state
// ---------------------------------------------------------------------------

let signalCounter = 0;

export function generateSignal(
  indicators: IndicatorState,
  currentPrice: number,
): Signal | null {
  const { type, confidence, reasons } = evaluateRules(indicators, currentPrice);
  if (!type) return null;

  signalCounter++;
  const id = `sig_${now().getTime()}_${signalCounter}`;

  return {
    id,
    type,
    reason: reasons.join(" · "),
    timestamp: now().getTime(),
    price: currentPrice,
    timeframe: indicators.timeframe,
    confidence,
    indicators: {
      ema20: indicators.ema20,
      ema50: indicators.ema50,
      rsi: indicators.rsi,
      macd: indicators.macd,
      atr: indicators.atr,
    },
  };
}

// ---------------------------------------------------------------------------
// Format signal for user display
// ---------------------------------------------------------------------------

export function formatSignal(sig: Signal): string {
  const emoji = sig.type === "buy" ? "🟢" : "🔴";
  const label = sig.type === "buy" ? "Bon achat" : "Bon vente";
  const stopLoss = sig.type === "buy"
    ? (sig.price - sig.indicators.atr * 1.5).toFixed(2)
    : (sig.price + sig.indicators.atr * 1.5).toFixed(2);

  return [
    `${emoji} ${label} — ETH/USD`,
    ``,
    `Prix: $${sig.price.toFixed(2)}`,
    `Confiance: ${sig.confidence}%`,
    `Timeframe: ${sig.timeframe}`,
    ``,
    `📊 Indicateurs:`,
    `  EMA20: $${sig.indicators.ema20.toFixed(2)}`,
    `  EMA50: $${sig.indicators.ema50.toFixed(2)}`,
    `  RSI: ${sig.indicators.rsi.toFixed(1)}`,
    `  MACD: ${sig.indicators.macd.toFixed(2)}`,
    `  ATR: $${sig.indicators.atr.toFixed(2)}`,
    ``,
    `📌 Stop-loss recommandé: $${stopLoss}`,
    ``,
    `💡 ${sig.reason}`,
  ].join("\n");
}

export function formatSummary(signals: Signal[]): string {
  if (signals.length === 0) {
    return "📋 Aucun signal sur les dernières 24h.";
  }
  const lines = [`📋 Résumé — ${signals.length} signal(s) sur 24h`, ""];
  for (const sig of signals.slice(0, 10)) {
    const emoji = sig.type === "buy" ? "🟢" : "🔴";
    const time = new Date(sig.timestamp).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(`${emoji} ${time} — ${sig.type.toUpperCase()} @ $${sig.price.toFixed(2)} (${sig.confidence}%)`);
  }
  return lines.join("\n");
}
