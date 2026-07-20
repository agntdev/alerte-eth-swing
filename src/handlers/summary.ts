import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { now } from "../services/clock.js";

// Daily summary — shows signals from the last 24h.
// Reached via main menu button (📋 Résumé) or /summary command.
// Uses the persistent store to fetch recent signals and format them.

const SUMMARY_PROMPT = "📋 Voici le résumé de vos signaux des dernières 24h :";

const composer = new Composer<Ctx>();

composer.command("summary", async (ctx) => {
  const text = await buildSummary(ctx);
  await ctx.reply(text, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Retour au menu", "menu:main")]]),
  });
});

composer.callbackQuery("summary:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const text = await buildSummary(ctx);
  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Retour au menu", "menu:main")]]),
  });
});

async function buildSummary(ctx: Ctx): Promise<string> {
  // Import store lazily to avoid circular deps at module load.
  const { getStore } = await import("../services/store.js");
  const store = getStore();
  if (!store) {
    return SUMMARY_PROMPT + "\n\n⚠️ Données temporairement indisponibles.";
  }

  const currentNow = now();
  const signals = await store.getRecentSignals(
    24 * 60 * 60 * 1000,
    currentNow.getTime(),
  );

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
    lines.push(
      `${emoji} ${time} — ${sig.type.toUpperCase()} @ $${sig.price.toFixed(2)} (${sig.confidence}%)`,
    );
  }
  return lines.join("\n");
}

export default composer;
