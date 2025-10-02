const { Telegraf } = require('telegraf'); 
const cron = require('node-cron');
const config = require('./config');
const checker = require('./service/checker');
const storage = require('./service/storage');
const chokidar = require('chokidar');
const path = require('path');
const { log } = require('./utils/logger');

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
const reloadCommand = require('./commands/reload');
reloadCommand.setBotInstance(bot);

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
  pm2: require('./commands/pm2'),
  reload: require('./commands/reload'),
  logs: require('./commands/logs'),
  releases: require('./commands/releases'),
  trackowner: require('./commands/trackowner'),
  untrackowner: require('./commands/untrackowner'),
  ownerstats: require('./commands/ownerstats'),
};

global.botInstance = bot;

Object.entries(commands).forEach(([name, handler]) => {
  bot.command(name, handler);
  console.log(`[INFO] Команда загружена: /${name}`);
});

function setupFileWatcher() {
    if (process.env.NODE_ENV === 'development') {
        const watcher = chokidar.watch('./commands/*.js', {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true
        });

        watcher.on('change', (filePath) => {
            const fileName = path.basename(filePath, '.js');
            log(`Обнаружено изменение файла: ${fileName}`, 'info');
            
            try {
                const commandPath = `./commands/${fileName}`;
                delete require.cache[require.resolve(commandPath)];
                const newCommand = require(commandPath);
                commands[fileName] = newCommand;
                
                log(`Команда ${fileName} перезагружена автоматически`, 'info');
            } catch (error) {
                logError(`Ошибка автоматической перезагрузки ${fileName}`, error);
            }
        });

        log('File watcher started for commands', 'info');
    }
}

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
});bot.action(/^help_/, async (ctx) => {
  try {
    const action = ctx.callbackQuery.data.replace('help_', '');
    const commandMap = {
      list: '/list',
      check: '/check',
      branches: '/branches combatextended-continued/combatextended',
      pr: '/pr',
      limits: '/limits',
      pm2: '/pm2',
      reload: '/reload',
      add: '/add'
    };
    
    if (commandMap[action]) {
      const fakeContext = {
        ...ctx,
        message: {
          text: commandMap[action],
          chat: ctx.callbackQuery.message.chat,
          from: ctx.callbackQuery.from
        },
        bot: ctx.bot
      };
      
      const cmd = require(`./commands/${action}`);
      await cmd(fakeContext);
    }
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка выполнения команды');
  }
});

bot.action(/^list_page_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        
        const fakeContext = {
            ...ctx,
            message: {
                text: `/list ${page}`,
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from
            },
            bot: ctx.bot,
            replyWithChatAction: ctx.replyWithChatAction.bind(ctx)
        };
        
        const listCmd = require('./commands/list');
        await listCmd(fakeContext);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('List page callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка перехода по страницам');
    }
});

bot.action('list_current_page', async (ctx) => {
    await ctx.answerCbQuery('Текущая страница');
});

bot.action('owner_stats', async (ctx) => {
    try {
        const fakeContext = {
            ...ctx,
            message: {
                text: '/ownerstats',
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from
            },
            bot: ctx.bot
        };
        
        const ownerstatsCmd = require('./commands/ownerstats');
        await ownerstatsCmd(fakeContext);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Owner stats callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка загрузки статистики');
    }
});

bot.action('add_repo_help', async (ctx) => {
    try {
        const fakeContext = {
            ...ctx,
            message: {
                text: '/help add',
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from
            },
            bot: ctx.bot
        };
        
        const helpCmd = require('./commands/help');
        await helpCmd(fakeContext);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Add repo help callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка загрузки справки');
    }
});

bot.action(/^quick_releases_(.+)_(.+)_(\d+)$/, async (ctx) => {
  try {
    const [_, owner, repo, limit] = ctx.match;
    
    const fakeContext = {
      ...ctx,
      from: ctx.callbackQuery.from,
      message: {
        text: `/releases ${owner}/${repo} ${limit}`,
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from
      },
      bot: ctx.bot,
      replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const releasesCmd = require('./commands/releases');
    await releasesCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Quick releases callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки релизов');
  }
});

bot.action('help_pm2', async (ctx) => {
  try {
    ctx.message = {
      text: '/help pm2',
      chat: ctx.callbackQuery.message.chat,
      from: ctx.callbackQuery.from
    };
    
    const helpCmd = require('./commands/help');
    await helpCmd(ctx);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help pm2 callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки справки');
  }
});

bot.action('help_reload', async (ctx) => {
  try {
    ctx.message = {
      text: '/help reload',
      chat: ctx.callbackQuery.message.chat,
      from: ctx.callbackQuery.from
    };
    
    const helpCmd = require('./commands/help');
    await helpCmd(ctx);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help reload callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки справки');
  }
});


bot.action(/^list_owner_(.+)_(\d+)$/, async (ctx) => {
    try {
        const [_, owner, page] = ctx.match;
        const pageNum = parseInt(page);
        
        const fakeContext = {
            ...ctx,
            message: {
                text: `/list ${pageNum} ${owner}`,
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from
            },
            bot: ctx.bot,
            replyWithChatAction: ctx.replyWithChatAction.bind(ctx)
        };
        
        const listCmd = require('./commands/list');
        await listCmd(fakeContext);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('List owner callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка загрузки репозиториев владельца');
    }
});

bot.action(/^list_main_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        
        const fakeContext = {
            ...ctx,
            message: {
                text: `/list ${page}`,
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from,
                message_id: ctx.callbackQuery.message.message_id
            },
            callbackQuery: ctx.callbackQuery,
            bot: ctx.bot,
            replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
            editMessageText: ctx.editMessageText?.bind(ctx),
            telegram: ctx.telegram
        };
        
        const listCmd = require('./commands/list');
        await listCmd(fakeContext);
        
    } catch (error) {
        console.error('List page callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка перехода по страницам');
    }
});

bot.action(/^list_owner_([^_]+)_(\d+)$/, async (ctx) => {
    try {
        const [_, owner, page] = ctx.match;
        const pageNum = parseInt(page);
        
        const fakeContext = {
            ...ctx,
            message: {
                text: `/list owner ${owner} ${pageNum}`,
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from,
                message_id: ctx.callbackQuery.message.message_id
            },
            callbackQuery: ctx.callbackQuery,
            bot: ctx.bot,
            replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
            editMessageText: ctx.editMessageText?.bind(ctx),
            telegram: ctx.telegram
        };
        
        const listCmd = require('./commands/list');
        await listCmd(fakeContext);
        
    } catch (error) {
        console.error('List owner callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка загрузки репозиториев владельца');
    }
});

bot.action('list_owner_view', async (ctx) => {
    try {
        const fakeContext = {
            ...ctx,
            message: {
                text: '/list owner',
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from,
                message_id: ctx.callbackQuery.message.message_id
            },
            callbackQuery: ctx.callbackQuery,
            bot: ctx.bot,
            replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
            editMessageText: ctx.editMessageText?.bind(ctx),
            telegram: ctx.telegram
        };
        
        const listCmd = require('./commands/list');
        await listCmd(fakeContext);
        
    } catch (error) {
        console.error('List owner view callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка выбора владельца');
    }
});

bot.action('list_stats', async (ctx) => {
    try {
        const fakeContext = {
            ...ctx,
            message: {
                text: '/list stats',
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from,
                message_id: ctx.callbackQuery.message.message_id
            },
            callbackQuery: ctx.callbackQuery,
            bot: ctx.bot,
            replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
            editMessageText: ctx.editMessageText?.bind(ctx),
            telegram: ctx.telegram
        };
        
        const listCmd = require('./commands/list');
        await listCmd(fakeContext);
        
    } catch (error) {
        console.error('List stats callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка загрузки статистики');
    }
});

bot.action('list_current', async (ctx) => {
    await ctx.answerCbQuery('Текущая страница');
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

async function executeListCommand(ctx, command) {
    try {
        const fakeContext = {
            ...ctx,
            message: {
                text: `/${command}`,
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from,
                message_id: ctx.callbackQuery.message.message_id 
            },
            bot: ctx.bot,
            callbackQuery: ctx.callbackQuery, 
            replyWithChatAction: ctx.replyWithChatAction.bind(ctx)
        };
        
        const listCmd = require('./commands/list');
        await listCmd(fakeContext);
        
    } catch (error) {
        console.error('List callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка выполнения команды');
    }
}

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

    const fakeContext = {
      ...ctx,
      message: {
        text: `/prview ${repoKey} ${prNumber}`,
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from  
      },
      bot: ctx.bot,
      replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const prviewCmd = require('./commands/prview');
    await prviewCmd(fakeContext);
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

    const repoKey = `${owner}/${repo}`.toLowerCase();
    
    if (!storage.repoExists(owner, repo)) {
      await ctx.answerCbQuery('❌ Репозиторий не отслеживается');
      return;
    }

    // Получаем данные репозитория из хранилища
    const repoData = storage.repos.get(repoKey);
    if (!repoData) {
      await ctx.answerCbQuery('❌ Данные репозитория не найдены');
      return;
    }

    // Используем правильную ветку из данных репозитория
    const branch = repoData.branch || repoData.defaultBranch || 'master';
    
    console.log(`Quick last: ${repoKey}, branch: ${branch}, count: ${count}`);

    // Создаем правильный контекст для команды
    const fakeContext = {
      ...ctx,
      from: ctx.callbackQuery.from,
      message: {
        text: `/last ${owner}/${repo} ${branch} ${count}`,
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from
      },
      bot: ctx.bot,
      replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const lastCmd = require('./commands/last');
    await lastCmd(fakeContext);
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

    const repoKey = `${owner}/${repo}`.toLowerCase();
    
    if (!storage.repoExists(owner, repo)) {
      await ctx.answerCbQuery('❌ Репозиторий не отслеживается');
      return;
    }

    const fakeContext = {
      ...ctx,
      from: ctx.callbackQuery.from,
      message: {
        text: `/branches ${owner}/${repo} ${limit}`,
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from
      },
      bot: ctx.bot,
      replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const branchesCmd = require('./commands/branches');
    await branchesCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Quick branches callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки веток');
  }
});

bot.action(/^quick_pr_([a-zA-Z0-9_-]+)_([a-zA-Z0-9_-]+)_(\d+)_(.+)$/, async (ctx) => {
  try {
    const [_, owner, repo, limit, state] = ctx.match;
    
    if (!owner || !repo) {
      await ctx.answerCbQuery('❌ Неверные параметры');
      return;
    }

    const repoKey = `${owner}/${repo}`.toLowerCase();
    
    const fakeContext = {
      ...ctx,
      from: ctx.callbackQuery.from,
      message: {
        text: `/pr ${owner}/${repo} ${state} ${limit}`,
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from
      },
      bot: ctx.bot,
      replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const prCmd = require('./commands/pr');
    await prCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Quick PR callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки PR');
  }
});

bot.action(/^confirm_remove_(.+)$/, async (ctx) => {
  const repoKey = ctx.match[1];
  
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
});


bot.action(/^final_remove_(.+)$/, async (ctx) => {
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

bot.action('cancel_remove', async (ctx) => {
  await ctx.deleteMessage();
  await ctx.answerCbQuery('Удаление отменено');
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

bot.launch().then(() => {
    console.log('[INFO] Бот успешно запущен');
    storage.initStorage();
    
    if (storage.getTrackedOwners().length === 0 && storage.getRepos().length > 0) {
      console.log('[INFO] Восстанавливаем владельцев из репозиториев...');
      storage.restoreOwnersFromRepos();
    }
    
    setupFileWatcher();
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
