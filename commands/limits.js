const { apiRateLimit } = require('../service/github');
const { sendMessage } = require('../utils/message');
const { log, logError } = require('../utils/logger');

function progressBar(used, total) {
    const percent = Math.round((used / total) * 10);
    return `[${'█'.repeat(percent)}${'░'.repeat(10 - percent)}]`;
}

module.exports = async (ctx) => {
    try {
        if (!apiRateLimit || typeof apiRateLimit.remaining === 'undefined') {
            throw new Error('Данные о лимитах недоступны');
        }

        const resetTime = new Date(apiRateLimit.reset * 1000);
        const timeLeftMinutes = ((apiRateLimit.reset * 1000 - Date.now()) / 60000).toFixed(1);

        const limitTotal = apiRateLimit.limit || 60;
        const remaining = apiRateLimit.remaining || 0;
        const used = limitTotal - remaining;

        const message = `
📊 *Лимиты GitHub API*

▸ Использовано: ${used}/${limitTotal}
${progressBar(used, limitTotal)} ${Math.round((used/limitTotal)*100)}%
▸ Осталось: ${remaining} запросов
▸ Обновление через: ${timeLeftMinutes} минут
▸ Полное обновление: ${resetTime.toLocaleTimeString('ru-RU')}

ℹ️ *Советы:*
- Для увеличения лимитов добавьте GITHUB_TOKEN в .env
- Критичные запросы: не более 5/мин
`;

        await sendMessage(ctx, message, { 
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true
        });

        log(`Проверены лимиты API. Осталось запросов: ${remaining}`, 'info');

    } catch (error) {
        logError(error, 'Ошибка при проверке лимитов API');
        await sendMessage(
            ctx,
            `❌ Ошибка: ${error.message}`,
            { parse_mode: 'MarkdownV2' }
        );
    }
};