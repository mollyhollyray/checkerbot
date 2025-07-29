const checker = require('../service/checker');
const { sendMessage, sendLongMessage } = require('../utils/message');
const logger = require('../utils/logger');
const storage = require('../service/storage');

module.exports = async (ctx) => {
    try {
        await ctx.replyWithChatAction('typing');
        await sendMessage(ctx, '🔍 Запуск проверки репозиториев...');

        const startTime = Date.now();
        const updates = await checker.checkAllRepos(ctx.bot);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (updates.length === 0) {
            return await sendMessage(
                ctx,
                `🔄 Проверка завершена за ${duration} сек.\n` +
                'Все репозитории актуальны, новых коммитов не найдено.'
            );
        }

        let message = `🔄 <b>Найдены обновления</b> (${duration} сек)\n\n`;
        
        updates.forEach(update => {
            message += 
`📌 <b>${update.repoKey}</b> (${update.branch})
├ 🆕 Коммит: <code>${update.newCommitSha.slice(0, 7)}</code>
├ 👤 ${update.commitAuthor}
├ 📝 ${update.commitMessage.split('\n')[0]}
└ 🔗 <a href="${update.commitUrl}">Ссылка на коммит</a>\n\n`;
        });

        message += '<b>Проверенные репозитории:</b>\n';
        storage.getRepos().forEach(([repo, data]) => {
            message += `▸ ${repo} (${data.branch || 'main'})\n`;
        });

        await sendLongMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

    } catch (error) {
        logger.error(error, 'Check command failed');
        await sendMessage(
            ctx,
            '❌ Ошибка при проверке репозиториев\n' +
            `<code>${error.message}</code>`,
            { parse_mode: 'HTML' }
        );
    }
};