const Reporter = require('../service/reporter');
const { sendMessage } = require('../utils/message');
const logger = require('../utils/logger');
const config = require('../config');

module.exports = async (ctx) => {
    try {
        if (ctx.from.id !== config.ADMIN_USER_ID) {
            return await sendMessage(
                ctx,
                '❌ Эта команда доступна только администратору',
                { parse_mode: 'HTML' }
            );
        }

        const args = ctx.message.text.split(' ').slice(1);
        const reportType = args[0] || 'daily';

        await ctx.replyWithChatAction('typing');

        const reporter = new Reporter();
        const bot = global.botInstance || ctx.bot;

        if (!bot) {
            throw new Error('Bot instance not available');
        }

        switch (reportType) {
            case 'daily':
                await reporter.sendDailyReport(bot);
                await sendMessage(ctx, '✅ Ежедневный отчет отправлен');
                break;
            case 'weekly':
                await reporter.sendWeeklyReport(bot);
                await sendMessage(ctx, '✅ Еженедельный отчет отправлен');
                break;
            case 'test':
                const testChart = reporter.generateASCIIChart([
                    { value: 10, label: 'A' },
                    { value: 25, label: 'B' },
                    { value: 15, label: 'C' },
                    { value: 30, label: 'D' },
                    { value: 20, label: 'E' }
                ]);
                
                await sendMessage(ctx, 
                    '📊 <b>ТЕСТОВЫЙ ГРАФИК</b>\n\n<pre>' + testChart + '</pre>', 
                    { parse_mode: 'HTML' }
                );
                break;
            default:
                await sendMessage(ctx, 
                    '❌ Неизвестный тип отчета. Используйте: daily, weekly, test'
                );
        }

        logger.info(`Отчет запущен вручную: ${reportType}`, 'info');

    } catch (error) {
        logger.error('Ошибка в команде report', error);
        await sendMessage(
            ctx,
            '❌ Ошибка при генерации отчета: ' + error.message
        );
    }
};