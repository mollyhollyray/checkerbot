const { sendMessage } = require('../utils/message');
const { log } = require('../utils/logger');

// Основные тексты справки
const HELP_TEXTS = {
  main: `
📚 *Помощь по боту GitHub Tracker*

🔹 *Основные команды:*
├ /add \\- добавить репозиторий
├ /remove \\- удалить репозиторий
├ /list \\- список отслеживаемых репозиториев
└ /branches \\- показать ветки репозитория

🔹 *Работа с коммитами:*
└ /last \\- последние коммиты

🔹 *Pull Requests:*
├ /pr \\- список PR
└ /prview \\- детали PR

🔹 *Система:*
├ /limits \\- лимиты API
└ /help \\- эта справка

Для детальной справки: \`/help [команда]\`
Пример: \`/help add\`
  `,

  add: `
📌 *Помощь по команде /add*

▫️ *Формат:* \`/add владелец/репозиторий\`
▫️ *Пример:* \`/add facebook/react\`

Добавляет репозиторий в отслеживаемые. Бот будет присылать уведомления о новых коммитах.

⚠️ *Ограничения:*
• Поддерживаются только публичные репозитории
• Максимально 100 репозиториев
  `,

  last: `
📌 *Помощь по команде /last*

▫️ *Формат:* \`/last владелец/репозиторий [ветка] [количество]\`
▫️ *Примеры:*
\`/last vuejs/core\` \\- 5 последних коммитов
\`/last facebook/react main 3\` \\- 3 коммита из ветки main

🔄 *Автодополнение:* Если ветка не указана, используется ветка по умолчанию
  `
};

// Главный обработчик команды
module.exports = async (ctx) => {
  const command = ctx.message.text.split(' ')[1]?.toLowerCase();

  try {
    if (!command) {
      await sendMainHelp(ctx);
    } else {
      await sendCommandHelp(ctx, command);
    }
    log(`Help shown for: ${command || 'main'}`);
  } catch (error) {
    logError(error, 'Help command failed');
    await sendMessage(ctx, '⚠️ Произошла ошибка при показе справки');
  }
};

// Отправка основной справки
async function sendMainHelp(ctx) {
  await sendMessage(ctx, HELP_TEXTS.main, {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true
  });
}

// Отправка справки по конкретной команде
async function sendCommandHelp(ctx, command) {
  const helpText = HELP_TEXTS[command] || `
🔍 Справка по команде \`${command}\` не найдена.

Используйте \`/help\` для списка доступных команд
  `;

  await sendMessage(ctx, helpText, {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true
  });
}