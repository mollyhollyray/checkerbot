const checker = require('../service/checker');
const { sendMessage, sendLongMessage } = require('../utils/message');
const logger = require('../utils/logger');
const config = require('../config');
const storage = require('../service/storage');

module.exports = async (ctx) => {
    try {
        const args = ctx.message.text.split(' ').slice(1);

        if (ctx.from.id !== config.ADMIN_USER_ID) {
                    return await sendMessage(
                        ctx,
                        '❌ Эта команда доступна только администратору',
                        { parse_mode: 'HTML' }
                    );
                }
        
        if (args.length > 0 && args[0] !== 'все' && args[0] !== 'all') {
            return await sendMessage(
                ctx,
                '<b>❌ Неверный аргумент</b>\n\n' +
                'Используйте: <code>/check</code> или <code>/check все</code>',
                { parse_mode: 'HTML' }
            );
        }

        await ctx.replyWithChatAction('typing');
        
        const reposCount = storage.getRepos().length;
        if (reposCount === 0) {
            return await sendMessage(
                ctx,
                '📭 Нет отслеживаемых репозиториев для проверки\n\n' +
                'Добавьте репозитории командой /add',
                { parse_mode: 'HTML' }
            );
        }

        await sendMessage(ctx, `🔍 Запуск проверки ${reposCount} репозиториев...`);

        const startTime = Date.now();
        const updates = await checker.checkAllRepos(ctx.bot);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (updates.length === 0) {
            return await sendMessage(
                ctx,
                `✅ Проверка завершена за ${duration} сек.\n` +
                'Все репозитории актуальны, новых коммитов не найдено.'
            );
        }

        let message = `🔄 <b>Найдены обновления</b> (${duration} сек)\n\n`;
        
        updates.forEach(update => {
            message += 
`📌 <b>${update.repoKey}</b> (${update.branch})
├ 🆕 Коммит: <code>${update.newSha.slice(0, 7)}</code>
├ 📝 ${update.message.split('\n')[0].substring(0, 50)}...
└ 🔗 <a href="${update.url}">Ссылка на коммит</a>\n\n`;
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