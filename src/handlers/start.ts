import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, registerMainMenuItem } from "../toolkit/index.js";

// Register main menu items for features that are button-reachable.
registerMainMenuItem({ label: "🔇 Pause", data: "mute:show", order: 20 });
registerMainMenuItem({ label: "📋 Résumé", data: "summary:show", order: 30 });

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot.
const composer = new Composer<Ctx>();

const WELCOME =
  "👋 Bienvenue ! Je surveille le prix de l'ETH et je vous envoie des alertes " +
  "d'achat/vente quand les indicateurs techniques le confirment.\n\n" +
  "Stratégie par défaut : EMA (20/50), RSI (14), MACD et ATR — " +
  "calibrée pour du swing trading avec un petit capital (~20$).\n\n" +
  "Appuyez sur un bouton ci-dessous pour commencer.";

composer.command("start", async (ctx) => {
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
