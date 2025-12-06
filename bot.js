const { Telegraf } = require('telegraf'); 
const cron = require('node-cron');
const config = require('./config');
const Reporter = require('./service/reporter');
const checker = require('./service/checker');
const storage = require('./service/storage-mongo');
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
  stats: require('./commands/stats'),
  analytics: require('./commands/analytics'),
  report: require('./commands/report'),
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

const reporter = new Reporter();

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

bot.action('help_check', async (ctx) => {
  try {
    const fakeContext = {
    ...ctx,
    message: {
        text: '/check',
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const checkCmd = require('./commands/check');
    await checkCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help check callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка выполнения проверки');
  }
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
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
        
        const helpCmd = require('./commands/help');
        await helpCmd(fakeContext);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Add repo help callback error:', error);
        await ctx.answerCbQuery('❌ Ошибка загрузки справки');
    }
});

bot.action('help_pr', async (ctx) => {
  try {
    const defaultRepo = storage.getFirstRepo();
    if (!defaultRepo) {
      await ctx.answerCbQuery('Нет отслеживаемых репозиториев');
      return;
    }
    
    const fakeContext = {
    ...ctx,
    message: {
        text: `/pr ${defaultRepo}`,
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const prCmd = require('./commands/pr');
    await prCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help pr callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки PR');
  }
});

bot.action('help_releases', async (ctx) => {
  try {
    const defaultRepo = storage.getFirstRepo();
    if (!defaultRepo) {
      await ctx.answerCbQuery('Нет отслеживаемых репозиториев');
      return;
    }
    
    const fakeContext = {
    ...ctx,
    message: {
        text: `/releases ${defaultRepo}`,
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const releasesCmd = require('./commands/releases');
    await releasesCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help releases callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки релизов');
  }
});

bot.action('help_pm2', async (ctx) => {
  try {
    const fakeContext = {
    ...ctx,
    message: {
        text: '/help pm2',
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const helpCmd = require('./commands/help');
    await helpCmd(fakeContext);
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

const helpButtonHandlers = {
    'help_check': { command: '/check', module: 'check' },
    'help_stats': { command: '/stats', module: 'stats' },
    'help_list': { command: '/list', module: 'list' },
    'help_branches': { command: null, module: 'branches' }, // особый случай
    'help_trackowner': { command: '/help trackowner', module: 'help' },
    'help_limits': { command: '/limits', module: 'limits' },
    'help_pm2': { command: '/help pm2', module: 'help' },
    'help_pr': { command: null, module: 'pr' }, // особый случай
    'help_releases': { command: null, module: 'releases' }, // особый случай
    'help_analytics': { command: '/analytics', module: 'analytics' },
    'help_report': { command: '/help report', module: 'help' }
};

// Обработчик для специальных случаев (где нужен репозиторий по умолчанию)
async function handleCommandWithDefaultRepo(ctx, command, moduleName) {
    const defaultRepo = storage.getFirstRepo();
    if (!defaultRepo) {
        await ctx.answerCbQuery('Нет отслеживаемых репозиториев');
        return;
    }
    
    const fakeContext = {
        ...ctx,
        message: {
            text: `${command} ${defaultRepo}`,
            chat: ctx.callbackQuery.message.chat,
            from: ctx.callbackQuery.from
        },
        bot: ctx.bot,
        replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const cmd = require(`./commands/${moduleName}`);
    await cmd(fakeContext);
    await ctx.answerCbQuery();
}

// Обработчик для обычных команд
async function handleSimpleCommand(ctx, command, moduleName) {
    const fakeContext = {
        ...ctx,
        message: {
            text: command,
            chat: ctx.callbackQuery.message.chat,
            from: ctx.callbackQuery.from
        },
        bot: ctx.bot,
        replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const cmd = require(`./commands/${moduleName}`);
    await cmd(fakeContext);
    await ctx.answerCbQuery();
}

// Регистрируем все help обработчики
Object.entries(helpButtonHandlers).forEach(([action, config]) => {
    bot.action(action, async (ctx) => {
        try {
            if (config.command === null) {
                // Особые случаи с репозиторием по умолчанию
                await handleCommandWithDefaultRepo(ctx, `/${config.module}`, config.module);
            } else {
                // Обычные команды
                await handleSimpleCommand(ctx, config.command, config.module);
            }
        } catch (error) {
            console.error(`${action} callback error:`, error);
            await ctx.answerCbQuery('❌ Ошибка выполнения команды');
        }
    });
});

bot.action('help_report', async (ctx) => {
  try {
    const fakeContext = {
    ...ctx,
    message: {
        text: '/help report',
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const helpCmd = require('./commands/help');
    await helpCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help report callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки справки');
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

bot.action('refresh_dashboard', async (ctx) => {
    try {
        const fakeContext = {
            ...ctx,
            message: {
                text: '/stats',
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
        
        const statsCmd = require('./commands/stats');
        await statsCmd(fakeContext);
        await ctx.answerCbQuery('✅ Дашборд обновлен');
        
    } catch (error) {
        console.error('Refresh dashboard error:', error);
        await ctx.answerCbQuery('❌ Ошибка обновления');
    }
});

bot.action('quick_check', async (ctx) => {
    try {
        const fakeContext = {
            ...ctx,
            message: {
                text: '/check',
                chat: ctx.callbackQuery.message.chat,
                from: ctx.callbackQuery.from
            },
            bot: ctx.bot
        };
        
        const checkCmd = require('./commands/check');
        await checkCmd(fakeContext);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Quick check error:', error);
        await ctx.answerCbQuery('❌ Ошибка проверки');
    }
});

bot.action('detailed_stats', async (ctx) => {
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
        console.error('Detailed stats error:', error);
        await ctx.answerCbQuery('❌ Ошибка загрузки');
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

bot.action('help_analytics', async (ctx) => {
  try {
    const fakeContext = {
    ...ctx,
    message: {
        text: '/analytics',
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const analyticsCmd = require('./commands/analytics');
    await analyticsCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help analytics callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки аналитики');
  }
});



bot.action('help_stats', async (ctx) => {
  try {
    const fakeContext = {
    ...ctx,
    message: {
        text: '/stats',
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const statsCmd = require('./commands/stats');
    await statsCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help stats callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки дашборда');
  }
});

bot.action('help_list', async (ctx) => {
  try {
    const fakeContext = {
    ...ctx,
    message: {
        text: '/list',
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const listCmd = require('./commands/list');
    await listCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help list callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки списка');
  }
});

bot.action('help_branches', async (ctx) => {
  try {
    const defaultRepo = storage.getFirstRepo();
    if (!defaultRepo) {
      await ctx.answerCbQuery('Нет отслеживаемых репозиториев');
      return;
    }
    
    const fakeContext = {
    ...ctx,
    message: {
        text: '/branches',
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const branchesCmd = require('./commands/branches');
    await branchesCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help branches callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки веток');
  }
});

bot.action('help_trackowner', async (ctx) => {
  try {
    const fakeContext = {
    ...ctx,
    message: {
        text: '/help trackowner',
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const helpCmd = require('./commands/help');
    await helpCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help trackowner callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки справки');
  }
});

bot.action('help_limits', async (ctx) => {
  try {
    const fakeContext = {
    ...ctx,
    message: {
        text: '/limits',
        chat: ctx.callbackQuery.message.chat,
        from: ctx.callbackQuery.from,
        message_id: ctx.callbackQuery.message.message_id
    },
    callbackQuery: ctx.callbackQuery,
    bot: ctx.bot,
    telegram: ctx.telegram,
    replyWithChatAction: ctx.replyWithChatAction?.bind(ctx),
    editMessageText: ctx.editMessageText?.bind(ctx)
};
    
    const limitsCmd = require('./commands/limits');
    await limitsCmd(fakeContext);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Help limits callback error:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки лимитов');
  }
});

// Новый универсальный обработчик для безопасных callback
bot.action(/^(\w+)_(.+)$/, async (ctx) => {
    try {
        const { prefix, params } = parseSafeCallback(ctx.callbackQuery.data);
        
        switch (prefix) {
            case 'quick_last':
                await handleQuickLast(ctx, params);
                break;
            case 'quick_branches':
                await handleQuickBranches(ctx, params);
                break;
            case 'quick_pr':
                await handleQuickPR(ctx, params);
                break;
            case 'quick_releases':
                await handleQuickReleases(ctx, params);
                break;
            case 'prview':
                await handlePRView(ctx, params);
                break;
            case 'confirm_remove':
                await handleConfirmRemove(ctx, params);
                break;
            case 'final_remove':
                await handleFinalRemove(ctx, params);
                break;
            default:
                await ctx.answerCbQuery('❌ Неизвестная команда');
        }
        
    } catch (error) {
        console.error('Callback handler error:', error);
        await ctx.answerCbQuery('❌ Ошибка выполнения команды');
    }
});

// Убираем старые обработчики и добавляем новые функции
async function handleQuickLast(ctx, params) {
    const [owner, repo, count, branch] = params;
    
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
            text: `/last ${owner}/${repo} ${branch || ''} ${count || 3}`,
            chat: ctx.callbackQuery.message.chat,
            from: ctx.callbackQuery.from
        },
        bot: ctx.bot,
        replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const lastCmd = require('./commands/last');
    await lastCmd(fakeContext);
    await ctx.answerCbQuery();
}

async function handleQuickBranches(ctx, params) {
    const [owner, repo, limit] = params;
    
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
            text: `/branches ${owner}/${repo} ${limit || 15}`,
            chat: ctx.callbackQuery.message.chat,
            from: ctx.callbackQuery.from
        },
        bot: ctx.bot,
        replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const branchesCmd = require('./commands/branches');
    await branchesCmd(fakeContext);
    await ctx.answerCbQuery();
}

async function handleQuickPR(ctx, params) {
    const [owner, repo, limit, state] = params;
    
    if (!owner || !repo) {
        await ctx.answerCbQuery('❌ Неверные параметры');
        return;
    }

    const fakeContext = {
        ...ctx,
        from: ctx.callbackQuery.from,
        message: {
            text: `/pr ${owner}/${repo} ${state || 'open'} ${limit || 5}`,
            chat: ctx.callbackQuery.message.chat,
            from: ctx.callbackQuery.from
        },
        bot: ctx.bot,
        replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const prCmd = require('./commands/pr');
    await prCmd(fakeContext);
    await ctx.answerCbQuery();
}

async function handleQuickReleases(ctx, params) {
    const [owner, repo, limit] = params;
    
    if (!owner || !repo) {
        await ctx.answerCbQuery('❌ Неверные параметры');
        return;
    }

    const fakeContext = {
        ...ctx,
        from: ctx.callbackQuery.from,
        message: {
            text: `/releases ${owner}/${repo} ${limit || 10}`,
            chat: ctx.callbackQuery.message.chat,
            from: ctx.callbackQuery.from
        },
        bot: ctx.bot,
        replyWithChatAction: ctx.replyWithChatAction?.bind(ctx)
    };
    
    const releasesCmd = require('./commands/releases');
    await releasesCmd(fakeContext);
    await ctx.answerCbQuery();
}

async function handlePRView(ctx, params) {
    const [owner, repo, prNumber] = params;
    
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
}

async function handleConfirmRemove(ctx, params) {
    const [owner, repo] = params;
    const repoKey = `${owner}/${repo}`;
    
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
                            callback_data: createSafeCallback('final_remove', owner, repo)
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
}

async function handleFinalRemove(ctx, params) {
    const [owner, repo] = params;
    const repoKey = `${owner}/${repo}`;
    
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
}

// Оставляем простые обработчики
bot.action('cancel_remove', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.answerCbQuery('Удаление отменено');
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

cron.schedule('0 9 * * *', async () => {
    log('Проверка ежедневного отчета', 'info');
    if (reporter.shouldSendDailyReport()) {
        await reporter.sendDailyReport(bot);
    }
});

cron.schedule('0 10 * * 1', async () => {
    log('Проверка еженедельного отчета', 'info');
    if (reporter.shouldSendWeeklyReport()) {
        await reporter.sendWeeklyReport(bot);
    }
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

    const connected = storage.init();
    if (!connected) {
        console.error('[ERROR] Не удалось подключиться к MongoDB');
        process.exit(1);
    }
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
