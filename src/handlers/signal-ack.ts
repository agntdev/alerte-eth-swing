import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { now } from "../services/clock.js";

// Signal acknowledgment — marks a signal as acted upon.
// Triggered by the "✅ Accusé" button on a signal alert message.
// Uses the persistent store to record the ack and update user state.

const composer = new Composer<Ctx>();

// Handle both "signal:ack" (basic) and "signal:ack:<id>" (with signal id)
composer.callbackQuery(/^signal:ack(?::(.+))?$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const signalId = ctx.match?.[1];

  const { getStore } = await import("../services/store.js");
  const store = getStore();

  if (!store || !ctx.from) {
    await ctx.editMessageText(
      "⚠️ Impossible d'enregistrer l'accusé. Réessayez plus tard.",
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Retour au menu", "menu:main")]]),
      },
    );
    return;
  }

  const userId = ctx.from.id;
  const ackTime = now().getTime();

  if (signalId) {
    // Save alert record if it doesn't exist yet
    const existingAlert = await store.getAlert(signalId, userId);
    if (!existingAlert) {
      await store.saveAlert({
        signal_id: signalId,
        user_id: userId,
        sent_at: ackTime,
        ack_time: ackTime,
      });
    } else {
      await store.ackAlert(signalId, userId, ackTime);
    }
  }

  await ctx.editMessageText(
    "✅ Signal marqué comme traité.",
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Retour au menu", "menu:main")]]),
    },
  );
});

export default composer;
