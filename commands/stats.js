const storage = require('../service/storage');
const { sendMessage, escapeHtml } = require('../utils/message');
const logger = require('../utils/logger');
const config = require('../config');

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function generateProgressBar(percentage, length = 10) {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function getActivityLevel(lastCommitTime) {
    if (!lastCommitTime) return 'inactive';
    
    const daysDiff = (Date.now() - lastCommitTime) / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= 7) return 'very_active';
    if (daysDiff <= 30) return 'active';
    if (daysDiff <= 90) return 'moderate';
    return 'inactive';
}

function calculateRepoActivity(repos) {
    const activity = {
        very_active: 0,
        active: 0,
        moderate: 0,
        inactive: 0
    };
    
    repos.forEach(([_, repoData]) => {
        const level = getActivityLevel(repoData.lastCommitTime);
        activity[level]++;
    });
    
    return activity;
}

function getTopOwners(repos, limit = 5) {
    const owners = {};
    
    repos.forEach(([repoKey, repoData]) => {
        const [owner] = repoKey.split('/');
        if (!owners[owner]) owners[owner] = 0;
        owners[owner]++;
    });
    
    return Object.entries(owners)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
}

function getPopularBranches(repos) {
    const branches = {};
    
    repos.forEach(([_, repoData]) => {
        const branch = repoData.branch || repoData.defaultBranch || 'main';
        if (!branches[branch]) branches[branch] = 0;
        branches[branch]++;
    });
    
    return Object.entries(branches)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
}

function getRecentActivity(repos, days = 7) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return repos.filter(([_, repoData]) => {
        return repoData.lastCommitTime && repoData.lastCommitTime > cutoff;
    }).length;
}

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
        const trackedOwners = storage.getTrackedOwners();
        
        if (repos.length === 0) {
            return await sendMessage(
                ctx,
                '📭 Нет отслеживаемых репозиториев\n\n' +
                'Добавьте репозитории командой /add',
                { parse_mode: 'HTML' }
            );
        }

        const individualRepos = repos.filter(([_, repo]) => repo.trackedIndividually);
        const autoRepos = repos.filter(([_, repo]) => !repo.trackedIndividually);
        const activity = calculateRepoActivity(repos);
        const topOwners = getTopOwners(repos);
        const popularBranches = getPopularBranches(repos);
        const recentActivity = getRecentActivity(repos);
        const activityPercentage = Math.round((recentActivity / repos.length) * 100);

        let message = '📊 <b>ДАШБОРД СТАТИСТИКИ</b>\n';
        message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        
        message += '🎯 <b>ОСНОВНЫЕ ПОКАЗАТЕЛИ</b>\n';
        message += `📦 Всего репозиториев: <b>${formatNumber(repos.length)}</b>\n`;
        message += `👥 Отслеживаемых владельцев: <b>${formatNumber(trackedOwners.length)}</b>\n`;
        message += `🔸 Индивидуальные: <b>${formatNumber(individualRepos.length)}</b>\n`;
        message += `🔹 Авто-отслеживание: <b>${formatNumber(autoRepos.length)}</b>\n\n`;
        
        message += '⚡ <b>АКТИВНОСТЬ РЕПОЗИТОРИЕВ</b>\n';
        message += `🟢 Активные (≤7 дн.): <b>${formatNumber(activity.very_active)}</b>\n`;
        message += `🟡 Умеренные (≤30 дн.): <b>${formatNumber(activity.active)}</b>\n`;
        message += `🟠 Неактивные (≤90 дн.): <b>${formatNumber(activity.moderate)}</b>\n`;
        message += `🔴 Спящие (>90 дн.): <b>${formatNumber(activity.inactive)}</b>\n`;
        message += `📈 Активность за неделю: <b>${formatNumber(recentActivity)}</b> (${activityPercentage}%)\n`;
        message += `${generateProgressBar(activityPercentage)} ${activityPercentage}%\n\n`;
        
        message += '🏆 <b>ТОП ВЛАДЕЛЬЦЫ</b>\n';
        topOwners.forEach(([owner, count], index) => {
            const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : '▸';
            const percentage = Math.round((count / repos.length) * 100);
            message += `${medal} <code>${owner}</code> - ${count} (${percentage}%)\n`;
        });
        message += '\n';
        
        message += '🌿 <b>ПОПУЛЯРНЫЕ ВЕТКИ</b>\n';
        popularBranches.forEach(([branch, count], index) => {
            message += `${index + 1}. <code>${branch}</code> - ${count}\n`;
        });
        message += '\n';
        
        const recentlyAdded = repos
            .sort((a, b) => new Date(b[1].addedAt) - new Date(a[1].addedAt))
            .slice(0, 3);
        
        message += '🆕 <b>ПОСЛЕДНИЕ ДОБАВЛЕНИЯ</b>\n';
        recentlyAdded.forEach(([repoKey, repoData]) => {
            const daysAgo = Math.floor((Date.now() - new Date(repoData.addedAt).getTime()) / (1000 * 60 * 60 * 24));
            message += `▸ <code>${repoKey}</code> (${daysAgo} дн. назад)\n`;
        });
        message += '\n';
        
        const now = new Date();
        const nextCheck = new Date(now.getTime() + config.CHECK_INTERVAL_MINUTES * 60 * 1000);
        
        message += '🖥️ <b>СИСТЕМНАЯ ИНФОРМАЦИЯ</b>\n';
        message += `⏰ Следующая проверка: ${nextCheck.toLocaleTimeString('ru-RU')}\n`;
        message += `🔄 Интервал: ${config.CHECK_INTERVAL_MINUTES} мин.\n`;
        message += `📅 Обновлено: ${now.toLocaleString('ru-RU')}\n\n`;
        
        message += '💡 <i>Используйте кнопки ниже для детальной информации</i>';

        const keyboard = {
            inline_keyboard: [
                [
                    { text: "📋 Список репозиториев", callback_data: "list_main_1" },
                    { text: "👥 Статистика владельцев", callback_data: "owner_stats" }
                ],
                [
                    { text: "🔄 Проверить сейчас", callback_data: "quick_check" },
                    { text: "📈 Детальная статистика", callback_data: "detailed_stats" }
                ],
                [
                    { text: "🔄 Обновить дашборд", callback_data: "refresh_dashboard" }
                ]
            ]
        };

        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: keyboard
        });

        logger.info('Дашборд статистики показан', 'info', {
            context: 'STATS_DASHBOARD',
            totalRepos: repos.length,
            trackedOwners: trackedOwners.length,
            recentActivity: recentActivity
        });

    } catch (error) {
        logger.error('Ошибка при показе дашборда статистики', error, {
            context: 'STATS_COMMAND_ERROR'
        });
        
        await sendMessage(
            ctx,
            '❌ Ошибка при загрузке статистики\n\n' +
            `<code>${escapeHtml(error.message)}</code>`,
            { parse_mode: 'HTML' }
        );
    }
};