const { Telegraf } = require('telegraf');
const config = require('./config');
const { log, logError } = require('./utils/logger'); // Убедитесь в импорте

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// Load commands dynamically
const fs = require('fs');
const path = require('path');
const commandsDir = path.join(__dirname, 'commands');

fs.readdirSync(commandsDir).forEach(file => {
  if (!file.endsWith('.js')) return;
  const command = require(path.join(commandsDir, file));
  const commandName = path.basename(file, '.js');
  bot.command(commandName, command);
  log(`Command loaded: /${commandName}`, 'debug');
});

// Error handling
bot.catch((err, ctx) => {
  logError(err, `Error in ${ctx.updateType}`);
  ctx.reply('❌ Произошла ошибка').catch(e => logError(e));
});

// Start bot
bot.launch().then(() => {
  log('Bot started successfully', 'success');
});

process.once('SIGINT', () => bot.stop('SIGINT'));