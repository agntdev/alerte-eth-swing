import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

// /help — plain-language explanation for non-technical users.
const composer = new Composer<Ctx>();

const HELP =
  "ℹ️ Ce bot surveille le prix de l'ETH et vous envoie des alertes " +
  "quand les indicateurs techniques détectent une bonne opportunité.\n\n" +
  "🔍 Comment ça marche :\n" +
  "• Les signaux « Bon achat » ou « Bon vente » s'affichent avec " +
  "le prix, la confiance et un stop-loss recommandé.\n" +
  "• Vous pouvez marquer un signal comme traité avec le bouton « ✅ Accusé ».\n\n" +
  "🔇 Besoin de pause ? Utilisez « Pause alertes » depuis le menu.\n" +
  "📋 Pour un résumé des dernières 24h, tapez /summary.\n\n" +
  "Tout est accessible depuis le menu — tapez /start pour y revenir.";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Retour au menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: backToMenu });
});

export default composer;
