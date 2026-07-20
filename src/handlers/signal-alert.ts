import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { now } from "../services/clock.js";
import { isMuted } from "./mute.js";

// Signal alert handler — displays incoming trade signals with an
// acknowledge button. This is the primary notification mechanism.
// Called by the signal generation flow (or directly for testing).

const composer = new Composer<Ctx>();

// Route for displaying a signal (callback from signal generation or test harness)
composer.callbackQuery(/^signal:alert:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const signalId = ctx.match[1];

  const { getStore } = await import("../services/store.js");
  const store = getStore();
  if (!store) {
    await ctx.reply("⚠️ Données temporairement indisponibles.");
    return;
  }

  const signal = await store.getSignal(signalId);
  if (!signal) {
    await ctx.reply("⚠️ Signal introuvable.");
    return;
  }

  const text = formatSignalAlert(signal);
  const ackButton = inlineButton("✅ Accusé", `signal:ack:${signal.id}`);
  const keyboard = inlineKeyboard([[ackButton]]);

  await ctx.reply(text, { reply_markup: keyboard });
});

/** Format a signal for Telegram display. */
export function formatSignalAlert(sig: {
  type: string;
  price: number;
  confidence: number;
  timeframe: string;
  reason: string;
  indicators: { ema20: number; ema50: number; rsi: number; macd: number; atr: number };
}): string {
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
    `  MACD: $${sig.indicators.macd.toFixed(2)}`,
    `  ATR: $${sig.indicators.atr.toFixed(2)}`,
    ``,
    `📌 Stop-loss recommandé: $${stopLoss}`,
    ``,
    `💡 ${sig.reason}`,
  ].join("\n");
}

// Export for use in signal generation flow
export { isMuted };

export default composer;
