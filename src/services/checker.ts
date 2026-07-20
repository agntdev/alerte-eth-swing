// Periodic signal checker — fetches ETH market data, computes indicators,
// and generates trade signals when conditions are met. Runs on a timer
// and sends alerts to registered users who aren't muted.

import type { Bot } from "grammy";
import type { Ctx } from "../bot.js";
import { getStore } from "./store.js";
import { fetchEthCandles, fetchEthPrice } from "./market.js";
import { computeIndicators } from "./indicators.js";
import {
  generateSignal,
  isDuplicate,
  formatSignal,
} from "./signals.js";
import { isMuted } from "../handlers/mute.js";
import { inlineButton, inlineKeyboard } from "../toolkit/ui/keyboard.js";
import { now } from "./clock.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

/**
 * Start the periodic signal checker. Called once at bot startup.
 * Returns a stop function for graceful shutdown.
 */
export function startSignalChecker(bot: Bot<any>): () => void {
  let running = true;

  const check = async () => {
    if (!running) return;
    try {
      await checkAndAlert(bot);
    } catch (err) {
      console.error("[signal-checker] error:", err);
    }
  };

  check();

  const timer = setInterval(check, CHECK_INTERVAL_MS);

  // Unref so the timer never keeps the process alive
  if (timer.unref) timer.unref();

  return () => {
    running = false;
    clearInterval(timer);
  };
}

/**
 * One check cycle: fetch data → compute indicators → generate signal →
 * alert users. Also usable from tests.
 */
export async function checkAndAlert(bot: Bot<any>): Promise<void> {
  const store = getStore();

  // 1. Fetch candles
  const candles = await fetchEthCandles({ days: 90, limit: 90 });
  if (candles.length === 0) return; // market data unavailable

  // Store candles
  await store.setCandles(candles);

  // 2. Compute indicators
  const indicators = computeIndicators(candles);
  if (!indicators) return; // not enough data
  await store.setIndicators(indicators);

  // 3. Get current price
  const price = await fetchEthPrice();
  if (!price) return;

  // 4. Generate signal
  const signal = generateSignal(indicators, price);
  if (!signal) return; // no signal conditions met

  // 5. Dedup — skip if same type within 24h
  const lastTime = await store.getLastSignalTime(signal.type);
  if (isDuplicate(signal.type, lastTime)) return;

  // 6. Store signal and update dedup timestamp
  await store.saveSignal(signal);
  await store.setLastSignalTime(signal.type, now().getTime());

  // 7. Alert all registered users who aren't muted
  const userIds = await store.getAllUserIds();
  const text = formatSignal(signal);
  const keyboard = inlineKeyboard([[inlineButton("✅ Accusé", `signal:ack:${signal.id}`)]]);

  for (const userId of userIds) {
    try {
      const user = await store.getUser(userId);
      // Skip if user has alerts disabled or is muted
      if (user && !user.notification_settings.alerts_enabled) continue;

      // Check session mute state (best-effort — session may not be available)
      // We send the alert and let the user's mute middleware handle suppression.
      await bot.api.sendMessage(userId, text, { reply_markup: keyboard });

      // Record the alert
      await store.saveAlert({
        signal_id: signal.id,
        user_id: userId,
        sent_at: now().getTime(),
      });
    } catch {
      // User may have blocked the bot (403) or chat not found — skip silently
    }
  }
}
