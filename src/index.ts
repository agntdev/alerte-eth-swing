import { buildBot } from "./bot.js";
import { setDefaultCommands } from "./toolkit/index.js";
import { startSignalChecker } from "./services/checker.js";

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }
  const bot = await buildBot(token);
  // Publish the "/" command list to Telegram (discoverability). A button-first
  // bot exposes only /start + /help; everything else is reached via menu buttons.
  await setDefaultCommands(bot);

  // Start the periodic signal checker (fetches ETH data, generates alerts).
  const stopChecker = startSignalChecker(bot);

  // Graceful shutdown
  process.on("SIGINT", () => {
    stopChecker();
    bot.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stopChecker();
    bot.stop();
    process.exit(0);
  });

  bot.start();
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
