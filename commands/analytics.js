const storage = require('../service/storage');
const { sendLongMessage, escapeHtml } = require('../utils/message');
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

        await ctx.replyWithChatAction('typing');
        
        const repos = storage.getRepos();
        
        if (repos.length === 0) {
            return await sendMessage(
                ctx,
                '📭 Нет данных для анализа',
                { parse_mode: 'HTML' }
            );
        }

        const repoAges = repos.map(([_, repo]) => 
            (Date.now() - new Date(repo.addedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        const avgAge = repoAges.reduce((a, b) => a + b, 0) / repoAges.length;
        const oldestRepo = repos.reduce((oldest, current) => 
            new Date(current[1].addedAt) < new Date(oldest[1].addedAt) ? current : oldest
        );
        
        const activityByHour = Array(24).fill(0);
        repos.forEach(([_, repo]) => {
            if (repo.lastCommitTime) {
                const hour = new Date(repo.lastCommitTime).getHours();
                activityByHour[hour]++;
            }
        });

        let message = '📈 <b>РАСШИРЕННАЯ АНАЛИТИКА</b>\n';
        message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        
        message += '📅 <b>ВРЕМЕННЫЕ МЕТРИКИ</b>\n';
        message += `📊 Средний возраст репозиториев: <b>${Math.round(avgAge)}</b> дней\n`;
        message += `🥇 Самый старый репозиторий: <code>${oldestRepo[0]}</code>\n`;
        message += `📅 Добавлен: <b>${new Date(oldestRepo[1].addedAt).toLocaleDateString('ru-RU')}</b>\n\n`;
        
        message += '🕒 <b>АКТИВНОСТЬ ПО ЧАСАМ (UTC)</b>\n';
        const maxActivity = Math.max(...activityByHour);
        activityByHour.forEach((count, hour) => {
            const barLength = count > 0 ? Math.round((count / maxActivity) * 10) : 0;
            const bar = '█'.repeat(barLength) + '░'.repeat(10 - barLength);
            message += `${hour.toString().padStart(2, '0')}:00 ${bar} ${count}\n`;
        });
        
        message += '\n💡 <i>Анализ основан на времени последних коммитов</i>';

        await sendLongMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

    } catch (error) {
        logger.error('Ошибка в команде analytics', error);
        await sendMessage(
            ctx,
            '❌ Ошибка при анализе данных',
            { parse_mode: 'HTML' }
        );
    }
};