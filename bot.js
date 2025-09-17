const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const config = require('./config');
const checker = require('./service/checker');
const storage = require('./service/storage');
const network = require('./utils/network');
const { logError } = require('./utils/logger');

// Конфигурация Telegraf с таймаутами
const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN, {
  telegram: {
    agent: null,
    attachmentAgent: null,
    webhookReply: false,
    testEnvironment: false,
    timeout: 30000, // 30 секунд таймаут
    apiMode: 'bot',
    apiRoot: 'https://api.telegram.org',
    apiRetries: 3,
    apiTimeout: 30000,
    retryAfter: 2,
    handlerTimeout: 90000
  }
});

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
  remove: require('./commands/remove'),
  status: require('./commands/status')
};

Object.entries(commands).forEach(([name, handler]) => {
  bot.command(name, handler);
  console.log(`[INFO] Команда загружена: /${name}`);
});

bot.action(/^help_/, async (ctx) => {
  try {
    const action = ctx.callbackQuery.data.replace('help_', '');
    const commandMap = {
      list: '/list',
      check: '/check',
      branches: '/branches combatextended-continued/combatextended',
      pr: '/pr',
      limits: '/limits',
      add: '/add'
    };
    
    if (commandMap[action]) {
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

bot.action(/^prview_([a-zA-Z0-9_-]+)_([a-zA-Z0-9_-]+)_(\d+)$/, async (ctx) => {
  try {
    const [_, owner, repo, prNumber] = ctx.match;
    
    if (!owner || !repo || !prNumber) {
      await ctx.answerCbQuery('❌ Неверные параметры');
      return;
    }

    const repoKey = `${owner}/${repo}`;
    
    if (!storage.repoExists(owner, repo)) {
      await ctx.answerCbQuery('❌ Репозиторий не отслеживается');
      return;
    }

    ctx.message = {
      text: `/prview ${repoKey} ${prNumber}`,
      chat: ctx.callbackQuery.message.chat
    };
    
    const prviewCmd = require('./commands/prview');
    await prviewCmd(ctx);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('PR View callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки PR');
  }
});

bot.action(/^quick_last_([a-zA-Z0-9_-]+)_([a-zA-Z0-9_-]+)_(\d+)$/, async (ctx) => {
  try {
    const [_, owner, repo, count] = ctx.match;
    
    if (!owner || !repo) {
      await ctx.answerCbQuery('❌ Неверные параметры');
      return;
    }

    const repoKey = `${owner}/${repo}`;
    
    if (!storage.repoExists(owner, repo)) {
      await ctx.answerCbQuery('❌ Репозиторий не отслеживается');
      return;
    }

    ctx.message = {
      text: `/last ${repoKey} ${count}`,
      chat: ctx.callbackQuery.message.chat
    };
    
    const lastCmd = require('./commands/last');
    await lastCmd(ctx);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Quick last callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки коммитов');
  }
});

bot.action(/^quick_branches_([a-zA-Z0-9_-]+)_([a-zA-Z0-9_-]+)_(\d+)$/, async (ctx) => {
  try {
    const [_, owner, repo, limit] = ctx.match;
    
    if (!owner || !repo) {
      await ctx.answerCbQuery('❌ Неверные параметры');
      return;
    }

    const repoKey = `${owner}/${repo}`;
    
    if (!storage.repoExists(owner, repo)) {
      await ctx.answerCbQuery('❌ Репозиторий не отслеживается');
      return;
    }

    ctx.message = {
      text: `/branches ${repoKey} ${limit}`,
      chat: ctx.callbackQuery.message.chat
    };
    
    const branchesCmd = require('./commands/branches');
    await branchesCmd(ctx);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Quick branches callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки веток');
  }
});

bot.action(/^quick_pr_([a-zA-Z0-9_-]+)_([a-zA-Z0-9_-]+)_(\d+)_([a-zA-Z]+)$/, async (ctx) => {
  try {
    const [_, owner, repo, limit, state] = ctx.match;
    
    if (!owner || !repo) {
      await ctx.answerCbQuery('❌ Неверные параметры');
      return;
    }

    const repoKey = `${owner}/${repo}`;
    
    if (!storage.repoExists(owner, repo)) {
      await ctx.answerCbQuery('❌ Репозиторий не отслеживается');
      return;
    }

    // Валидация состояния
    const validStates = ['open', 'closed', 'all'];
    const finalState = validStates.includes(state) ? state : 'open';

    ctx.message = {
      text: `/pr ${repoKey} ${finalState} ${limit}`,
      chat: ctx.callbackQuery.message.chat
    };
    
    const prCmd = require('./commands/pr');
    await prCmd(ctx);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Quick PR callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки PR');
  }
});

// Подтверждение удаления из уведомления
bot.action(/^confirm_remove_(.+)$/, async (ctx) => {
  try {
    const repoKey = ctx.match[1];
    const [owner, repo] = repoKey.split('/');
    
    if (!storage.repoExists(owner, repo)) {
      await ctx.answerCbQuery('❌ Репозиторий уже удален');
      return;
    }

    await ctx.editMessageText(
      `⚠️ <b>Подтвердите удаление репозитория</b>\n\n` +
      `<code>${escapeHtml(repoKey)}</code>\n\n` +
      `Это действие нельзя отменить. Удалить репозиторий?`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { 
                text: "✅ Да, удалить навсегда", 
                callback_data: `final_remove_${repoKey}`
              },
              { 
                text: "❌ Отмена", 
                callback_data: "cancel_remove"
              }
            ]
          ]
        }
      }
    );
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Confirm remove error:', error);
    await ctx.answerCbQuery('❌ Ошибка подтверждения');
  }
});

// Финальное удаление
bot.action(/^final_remove_(.+)$/, async (ctx) => {
  try {
    const repoKey = ctx.match[1];
    const [owner, repo] = repoKey.split('/');
    
    if (!storage.repoExists(owner, repo)) {
      await ctx.answerCbQuery('❌ Репозиторий уже удален');
      return;
    }

    if (storage.removeRepo(owner, repo)) {
      await ctx.editMessageText(
        `✅ <b>Репозиторий удалён из отслеживания!</b>\n\n` +
        `<code>${escapeHtml(repoKey)}</code>\n` +
        `🕒 ${new Date().toLocaleString('ru-RU')}`,
        { parse_mode: 'HTML' }
      );
      
      // Логируем удаление через кнопку
      console.log(`[INFO] Репозиторий удален через кнопку: ${repoKey}`);
    } else {
      await ctx.answerCbQuery('❌ Ошибка при удалении');
    }
  } catch (error) {
    console.error('Final remove error:', error);
    await ctx.answerCbQuery('❌ Ошибка при удалении');
  }
});

bot.action('cancel_remove', async (ctx) => {
  try {
    await ctx.deleteMessage();
    await ctx.answerCbQuery('Удаление отменено');
  } catch (error) {
    console.error('Cancel remove error:', error);
    await ctx.answerCbQuery('❌ Ошибка отмены');
  }
});

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

cron.schedule(`*/${config.CHECK_INTERVAL_MINUTES} * * * *`, async () => {
  console.log('[INFO] Запуск автоматической проверки репозиториев');
  try {
    await checker.checkAllRepos(bot);
  } catch (error) {
    console.error('[ERROR] Ошибка при автоматической проверке:', error);
  }
});

bot.catch((error) => {
  console.error('[ERROR] Ошибка в боте:', error);
});
async function startBot() {
  try {
    await network.withRetry(async () => {
      await bot.launch();
      console.log('[INFO] Бот успешно запущен');
      storage.initStorage();
    }, 'bot_launch');
    
  } catch (error) {
    if (network.isNetworkError(error)) {
      logError('Критическая ошибка сети при запуске бота', error, {
        type: 'network',
        code: error.code,
        address: 'api.telegram.org'
      });
      
      console.error('[FATAL] Не удалось подключиться к Telegram API');
      console.error('[FATAL] Проверьте интернет-соединение и настройки сети');
      process.exit(1);
    } else {
      logError('Критическая ошибка при запуске бота', error);
      process.exit(1);
    }
  }
}

startBot();

bot.catch(async (error) => {
  if (network.isNetworkError(error)) {
    logError('Сетевая ошибка в боте', error, {
      type: 'network',
      code: error.code
    });
    
    // Попробуем переподключиться
    setTimeout(() => {
      console.log('[INFO] Попытка переподключения после сетевой ошибки...');
      startBot();
    }, 5000);
  } else {
    logError('Ошибка в боте', error);
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
