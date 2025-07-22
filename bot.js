const { Telegraf } = require('telegraf');
const config = require('./config');
const checker = require('./service/checker');
const { log } = require('./utils/logger');
const cron = require('node-cron');

// Инициализация бота
const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// Загрузка команд
const fs = require('fs');
const path = require('path');
fs.readdirSync(path.join(__dirname, 'commands'))
  .forEach(file => {
    if (!file.endsWith('.js')) return;
    const command = require(`./commands/${file}`);
    const name = path.basename(file, '.js');
    bot.command(name, command);
    log(`Команда загружена: /${name}`);
  });

// Настройка автоматической проверки
cron.schedule(`*/${config.CHECK_INTERVAL_MINUTES} * * * *`, async () => {
  log(`\n=== Автопроверка начата ===`);
  try {
    await checker.checkAllRepos(bot);
  } catch (error) {
    logError(`Ошибка автоматической проверки: ${error.message}`);
  }
  log(`=== Автопроверка завершена ===\n`);
});

// Обработка ошибок
bot.catch((err, ctx) => {
  logError(`Ошибка в обработчике: ${err.message}`);
  ctx.reply('❌ Произошла ошибка при обработке команды');
});

// Запуск бота
bot.launch().then(() => {
  log(`\n🤖 Бот запущен!`);
  log(`⏱ Автопроверка каждые ${config.CHECK_INTERVAL_MINUTES} минут`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));