const { apiRateLimit } = require('../service/github');
const { sendMessage } = require('../utils/message');
const { log, logError } = require('../utils/logger');

module.exports = async (ctx) => {
    try {
        // Проверка наличия данных о лимитах
        if (!apiRateLimit || typeof apiRateLimit.remaining === 'undefined') {
            throw new Error('Данные о лимитах недоступны');
        }

        // Рассчет времени до сброса
        const resetTime = new Date(apiRateLimit.reset * 1000);
        const timeLeftMinutes = Math.max(0, (apiRateLimit.reset * 1000 - Date.now()) / 60000);

        // Формирование данных для вывода
        const limitTotal = apiRateLimit.limit || 60;
        const remaining = apiRateLimit.remaining || 0;
        const used = limitTotal - remaining;

        const message = `
📊 *Лимиты GitHub API*:

▸ Использовано: ${used}/${limitTotal}
▸ Осталось: ${remaining}
▸ Обновление через: ${timeLeftMinutes.toFixed(1)} минут
▸ Полное обновление: ${resetTime.toLocaleTimeString('ru-RU')}

ℹ️ Лимиты обновляются каждый час.
Для критичных операций используйте GitHub Personal Token.
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