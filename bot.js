const { Telegraf } = require('telegraf');  // Исправленный импорт
const cron = require('node-cron');
const config = require('./config');
const checker = require('./service/checker');
const storage = require('./service/storage');

// Инициализация бота
const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// Загрузка команд
const commands = {
  add: require('./commands/add'),
  branches: require('./commands/branches'),
  check: require('./commands/check'),
  help: require('./commands/help'),
  last: require('./commands/last'),
  limits: require('./commands/limits'),
  list: require('./commands/list'),
  pr: require('./commands/pr'),
  prview: require('./commands/prview'),
  remove: require('./commands/remove')
};

// Регистрация команд
Object.entries(commands).forEach(([name, handler]) => {
  bot.command(name, handler);
  console.log(`[INFO] Команда загружена: /${name}`);
});

// Обработка callback-кнопок
bot.action(/^confirm_remove_(.+)$/, async (ctx) => {
  const repoKey = ctx.match[1];
  const [owner, repo] = repoKey.split('/');
  
  if (storage.removeRepo(owner, repo)) {
    await ctx.editMessageText(
      `✅ <b>Репозиторий удалён из отслеживания!</b>\n\n` +
      `<code>${escapeHtml(repoKey)}</code>\n` +
      `🕒 ${new Date().toLocaleString('ru-RU')}`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.answerCbQuery('❌ Ошибка при удалении');
  }
});

bot.action(/^help_/, async (ctx) => {
  try {
    const action = ctx.callbackQuery.data.replace('help_', '');
    const commandMap = {
      list: '/list',
      check: '/check',
      branches: '/branches combatextended-continued/combatextended', // пример
      pr: '/pr',
      limits: '/limits',
      add: '/add'
    };
    
    if (commandMap[action]) {
      // Имитируем объект сообщения
      ctx.message = {
        text: commandMap[action],
        chat: ctx.callbackQuery.message.chat
      };
      
      const cmd = require(`./commands/${action}`);
      await cmd(ctx);
    }
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка выполнения команды');
  }
});

bot.action(/^help_branches/, async (ctx) => {
  try {
    const defaultRepo = storage.getFirstRepo();
    if (!defaultRepo) {
      await ctx.answerCbQuery('Нет отслеживаемых репозиториев');
      return;
    }
    
    ctx.message = {
      text: `/branches ${defaultRepo}`,
      chat: ctx.callbackQuery.message.chat
    };
    
    const branchesCmd = require('./commands/branches');
    await branchesCmd(ctx);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Branches callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки веток');
  }
});

// Обработка нажатия кнопок в самом help
bot.action(/^show_help_/, async (ctx) => {
  const command = ctx.callbackQuery.data.replace('show_help_', '');
  const help = require('./commands/help');
  await help({ 
    ...ctx, 
    message: { text: `/help ${command}` } 
  });
  await ctx.answerCbQuery();
});

bot.action('cancel_remove', async (ctx) => {
  await ctx.deleteMessage();
  await ctx.answerCbQuery('Удаление отменено');
});

// Автопроверка репозиториев
cron.schedule(`*/${config.CHECK_INTERVAL_MINUTES} * * * *`, async () => {
  console.log('[INFO] Запуск автоматической проверки репозиториев');
  try {
    await checker.checkAllRepos(bot);
  } catch (error) {
    console.error('[ERROR] Ошибка при автоматической проверке:', error);
  }
});

// Обработка ошибок
bot.catch((error) => {
  console.error('[ERROR] Ошибка в боте:', error);
});

// Запуск бота
bot.launch().then(() => {
  console.log('[INFO] Бот успешно запущен');
  storage.initStorage(); // Инициализация хранилища
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Вспомогательная функция
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}