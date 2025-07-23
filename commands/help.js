const { sendMessage } = require('../utils/message');
const { log } = require('../utils/logger');

const COMMAND_HELP = {
  main: `🌸 *GitHub Tracker Bot* 🌸 *Help Center*

━━━━━━━━━━━━━━━━━━
📚 *Основные команды:*
┌───────────────────────────────
│  🔹 /add - Добавить репозиторий
│  🔹 /remove - Удалить репозиторий
│  🔹 /list - Список отслеживаемых
│  🔹 /check - Проверить обновления
└───────────────────────────────

🌿 *Работа с ветками:*
┌───────────────────────────────
│  🌿 /branches - Показать ветки
│  🌿 /last - Последние коммиты
└───────────────────────────────

🔄 *Pull Requests:*
┌───────────────────────────────
│  🔄 /pr - Список PR
│  🔍 /prview - Детали PR
└───────────────────────────────

⚙️ *Системные команды:*
┌───────────────────────────────
│  📊 /limits - Лимиты API
│  ❓ /help - Эта справка
└───────────────────────────────
━━━━━━━━━━━━━━━━━━

💡 *Для деталей по команде:* \`/help [команда]\`
Пример: \`/help add\``,

  add: `✨ *Команда /add* ✨
━━━━━━━━━━━━━━━━━━
Добавляет репозиторий для отслеживания

📌 *Формат:*
\`/add owner/repo\`

📌 *Примеры:*
\`/add facebook/react\`
\`/add axios/axios main\`

📌 *Особенности:*
• Автоматически определяет ветку по умолчанию
• Проверяет доступность репозитория
• Сохраняет последний коммит`,

  remove: `✨ *Команда /remove* ✨
━━━━━━━━━━━━━━━━━━
Удаляет репозиторий из отслеживания

📌 *Формат:*
\`/remove owner/repo\`

📌 *Пример:*
\`/remove facebook/react\`

⚠️ *Требует подтверждения*`,

  list: `✨ *Команда /list* ✨
━━━━━━━━━━━━━━━━━━
Показывает все отслеживаемые репозитории

📌 *Формат:*
\`/list\`

📌 *Отображает:*
• Ветку по умолчанию
• Последний коммит
• Дату добавления
• Активность`,

  branches: `✨ *Команда /branches* ✨
━━━━━━━━━━━━━━━━━━
Показывает ветки репозитория

📌 *Формат:*
\`/branches owner/repo [limit]\`

📌 *Примеры:*
\`/branches facebook/react\`
\`/branches vuejs/core 25\`

📌 *Отображает:*
• Ветку по умолчанию (👑)
• Последний коммит
• Дату изменения
• Ссылку на коммит`,

  last: `✨ *Команда /last* ✨
━━━━━━━━━━━━━━━━━━
Показывает последние коммиты

📌 *Формат:*
\`/last owner/repo [branch] [count]\`

📌 *Примеры:*
\`/last facebook/react\`
\`/last vuejs/core next 5\`

📌 *Отображает:*
• Хеш коммита
• Автора
• Дату
• Сообщение
• Ссылку`,

  pr: `✨ *Команда /pr* ✨
━━━━━━━━━━━━━━━━━━
Показывает Pull Requests

📌 *Формат:*
\`/pr owner/repo [state] [limit] [filters]\`

📌 *Примеры:*
\`/pr facebook/react\`
\`/pr vuejs/core closed 10\`
\`/pr webpack/webpack label:bug\`

📌 *Фильтры:*
• state: open|closed|all
• label:метка
• author:автор`,

  prview: `✨ *Команда /prview* ✨
━━━━━━━━━━━━━━━━━━
Детальная информация о PR

📌 *Формат:*
\`/prview owner/repo pr_number\`

📌 *Пример:*
\`/prview facebook/react 123\`

📌 *Отображает:*
• Статус PR
• Автора
• Ветки
• Метки
• Проверки CI
• Описание`,

  limits: `✨ *Команда /limits* ✨
━━━━━━━━━━━━━━━━━━
Показывает лимиты GitHub API

📌 *Формат:*
\`/limits\`

📌 *Отображает:*
• Использованные запросы
• Оставшиеся запросы
• Время до сброса`,

  check: `✨ *Команда /check* ✨
━━━━━━━━━━━━━━━━━━
Ручная проверка обновлений

📌 *Формат:*
\`/check\`

📌 *Особенности:*
• Проверяет все репозитории
• Показывает новые коммиты
• Работает параллельно с авто-проверкой`
};

module.exports = async (ctx) => {
  const [_, command] = ctx.message.text.split(' ')
  
  try {
    const helpText = command 
      ? COMMAND_HELP[command.toLowerCase()] || COMMAND_HELP.main
      : COMMAND_HELP.main;

const buttons = [
  [
    { 
      text: "📋 Список", 
      callback_data: "help_list" 
    },
    { 
      text: "🔄 Проверить", 
      callback_data: "help_check" 
    }
  ],
  [
  { 
    text: "🌿 Ветки", 
    callback_data: "help_branches" 
  },
    { 
      text: "🔄 PR", 
      callback_data: "help_pr" 
    }
  ]
];

    await sendMessage(ctx, helpText, { 
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: buttons
      }
    });
    
    log(`Help delivered for: ${command || 'main'}`);
  } catch (error) {
    logError(error, 'Help command failed');
    await sendMessage(ctx, 
      '⚠️ Произошла ошибка при показе справки\nПопробуйте еще раз',
      { parse_mode: 'MarkdownV2' }
    );
  }
};