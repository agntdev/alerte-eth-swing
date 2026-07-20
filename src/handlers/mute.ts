import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { now } from "../services/clock.js";

// Mute feature — temporarily suppresses alerts for 1h, 4h, or 24h.
// Reached via the main menu button (🔇 Pause) or the /mute command.
// The mute expiry is stored in the ephemeral session (survives the conversation
// but not a restart — acceptable since muting is a short-lived preference).

const DURATIONS = [
  { label: "⏸ 1 heure", hours: 1, data: "mute:1h" },
  { label: "⏸ 4 heures", hours: 4, data: "mute:4h" },
  { label: "⏸ 24 heures", hours: 24, data: "mute:24h" },
];

const muteKeyboard = inlineKeyboard(
  DURATIONS.map((d) => [inlineButton(d.label, d.data)]),
);

const MUTE_PROMPT =
  "🔇 Pause les alertes pendant combien de temps ?";

const MUTE_CONFIRMED =
  "🔇 Alertes en pause. Vous recevrez de nouveau des signaux après la pause.";

const composer = new Composer<Ctx>();

composer.command("mute", async (ctx) => {
  await ctx.reply(MUTE_PROMPT, { reply_markup: muteKeyboard });
});

composer.callbackQuery("mute:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(MUTE_PROMPT, { reply_markup: muteKeyboard });
});

for (const d of DURATIONS) {
  composer.callbackQuery(d.data, async (ctx) => {
    await ctx.answerCallbackQuery();
    const expiry = now().getTime() + d.hours * 60 * 60 * 1000;
    ctx.session.mute_expiry = expiry;
    await ctx.editMessageText(MUTE_CONFIRMED, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Retour au menu", "menu:main")]]),
    });
  });
}

// Export a helper to check mute state (used by signal-alert handler).
export function isMuted(session: { mute_expiry?: number }): boolean {
  if (!session.mute_expiry) return false;
  return now().getTime() < session.mute_expiry;
}

export default composer;
