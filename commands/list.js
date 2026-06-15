const storage = require('../service/storage-mongo');
const { sendMessage, sendLongMessage } = require('../utils/message');
const logger = require('../utils/logger');

const REPOS_PER_PAGE = 10;
const MAX_MESSAGE_LENGTH = 3500;

function formatDate(isoString) {
    try {
        const date = new Date(isoString);
        return date.toLocaleDateString('ru-RU');
    } catch {
        return 'неизвестно';
    }
}

function getRepoWord(count) {
    const words = ['репозиторий', 'репозитория', 'репозиториев'];
    return words[
        count % 100 > 4 && count % 100 < 20 ? 2 : [2, 0, 1, 1, 1, 2][Math.min(count % 10, 5)]
    ];
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'никогда';
    
    const diffMs = Date.now() - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    
    if (diffMonths > 0) {
        return `${diffMonths} мес. назад`;
    } else if (diffWeeks > 0) {
        return `${diffWeeks} нед. назад`;
    } else if (diffDays > 0) {
        return `${diffDays} дн. назад`;
    } else if (diffHours > 0) {
        return `${diffHours} час. назад`;
    } else if (diffMinutes > 0) {
        return `${diffMinutes} мин. назад`;
    } else if (diffSeconds > 0) {
        return `${diffSeconds} сек. назад`;
    } else {
        return 'только что';
    }
}

async function safeAnswerCbQuery(ctx) {
    if (ctx.answerCbQuery && typeof ctx.answerCbQuery === 'function') {
        await ctx.answerCbQuery();
    }
}

module.exports = async (ctx) => {
    try {
        let args;
        
        if (ctx.message && ctx.message.text) {
            args = ctx.message.text.split(' ').slice(1);
        } else if (ctx.callbackQuery) {
            if (ctx.message && ctx.message.text) {
                args = ctx.message.text.split(' ').slice(1);
            } else {
                const callbackData = ctx.callbackQuery.data;
                if (callbackData.startsWith('list_')) {
                    const dataParts = callbackData.replace('list_', '').split('_');
                    args = dataParts;
                } else {
                    args = [callbackData];
                }
            }
        } else {
            return await sendMessage(
                ctx,
                '📭 Нет отслеживаемых репозиториев\n\nДобавьте первый: /add owner/repo',
                { parse_mode: 'HTML' }
            );
        }

        const mode = args[0] || 'main';
        const param = args[1];
        const page = parseInt(args[2]) || 1;

        if (ctx.replyWithChatAction && typeof ctx.replyWithChatAction === 'function') {
            await ctx.replyWithChatAction('typing');
        }
        
        const allRepos = storage.getRepos();
        const trackedOwners = storage.getTrackedOwners();
        
        if (allRepos.length === 0) {
            return await sendMessage(
                ctx,
                '📭 Нет отслеживаемых репозиториев\n\nДобавьте первый: /add owner/repo',
                { parse_mode: 'HTML' }
            );
        }

        switch (mode) {
            case 'owner':
                if (!param) {
                    return await showOwnerSelection(ctx, allRepos, trackedOwners);
                }
                return await showOwnerRepos(ctx, param, page);
                
            case 'stats':
                return await showStats(ctx, allRepos, trackedOwners);
                
            default:
                return await showMainList(ctx, allRepos, trackedOwners, page);
        }

    } catch (error) {
        logger.error('List command failed:', error);
        await safeAnswerCbQuery(ctx);
    }
};

async function showMainList(ctx, allRepos, trackedOwners, page) {
    const totalPages = Math.ceil(allRepos.length / REPOS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (currentPage - 1) * REPOS_PER_PAGE;
    const endIdx = startIdx + REPOS_PER_PAGE;
    
    const reposToShow = allRepos.slice(startIdx, endIdx);

    const individualRepos = allRepos.filter(([_, repo]) => repo.trackedIndividually);
    const autoRepos = allRepos.filter(([_, repo]) => !repo.trackedIndividually);

    let message = '📂 <b>Отслеживаемые репозитории</b>\n';
    message += '━━━━━━━━━━━━━━━━━━\n';
    message += `📊 Всего: ${allRepos.length} ${getRepoWord(allRepos.length)}\n`;
    message += `👥 Владельцев: ${trackedOwners.length}\n`;
    message += `📈 Статистика:\n`;
    message += `🔸 Отдельные репозитории: ${individualRepos.length}\n`;
    message += `🔹 Авто-отслеживание: ${autoRepos.length}\n`;
    message += `📄 Страница: ${currentPage}/${totalPages}\n`;
    message += '━━━━━━━━━━━━━━━━━━\n\n';

    reposToShow.forEach(([repoKey, repoData]) => {
        const [owner, repo] = repoKey.split('/');
        const emoji = repoData.trackedIndividually ? '🔸' : '🔹';
        
        message += `${emoji} <b>${owner}/</b><code>${repo}</code>\n`;
        message += `   🌿 Ветка: ${repoData.branch}\n`;
        message += `   🆔 Коммит: ${repoData.lastCommitSha?.slice(0, 7) || '----'}\n`;
        message += `   📅 Добавлен: ${formatDate(repoData.addedAt)}\n`;
        message += `   ⏱ Активность: ${formatTimeAgo(repoData.lastCommitTime)}\n\n`;
        message += `   /last ${repoKey} ${repoData.branch} 3\n`;
        message += '━━━━━━━━━━━━━━━━━━\n';
    });

    const keyboard = [];
    
    if (totalPages > 1) {
        const navRow = [];
        if (currentPage > 1) {
            navRow.push({ text: "◀️ Назад", callback_data: `list_main_${currentPage - 1}` });
        }
        navRow.push({ text: `${currentPage}/${totalPages}`, callback_data: 'list_current' });
        if (currentPage < totalPages) {
            navRow.push({ text: "Вперед ▶️", callback_data: `list_main_${currentPage + 1}` });
        }
        keyboard.push(navRow);
    }

    keyboard.push([
        { text: "👥 По владельцам", callback_data: "list_owner_view" },
        { text: "📊 Детальная статистика", callback_data: "list_stats" }
    ]);

    if (ctx.callbackQuery && ctx.editMessageText) {
        try {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await safeAnswerCbQuery(ctx);
        } catch (error) {
            await sendMessage(ctx, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await safeAnswerCbQuery(ctx);
        }
    } else {
        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

async function showOwnerRepos(ctx, owner, page) {
    const ownerRepos = storage.getReposByOwner(owner);
    const allRepos = storage.getRepos().filter(([key]) => key.startsWith(owner + '/'));
    
    const totalPages = Math.ceil(ownerRepos.length / REPOS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (currentPage - 1) * REPOS_PER_PAGE;
    const endIdx = startIdx + REPOS_PER_PAGE;

    const reposToShow = allRepos.slice(startIdx, endIdx);

    let message = `👤 <b>Репозитории ${owner}</b>\n`;
    message += '━━━━━━━━━━━━━━━━━━\n';
    message += `📦 Всего: ${ownerRepos.length} ${getRepoWord(ownerRepos.length)}\n`;
    message += `📄 Страница: ${currentPage}/${totalPages}\n`;
    message += '━━━━━━━━━━━━━━━━━━\n\n';

    if (ownerRepos.length === 0) {
        message += `📭 У владельца <b>${owner}</b> нет авто-отслеживаемых репозиториев\n\n`;
        message += `💡 <i>Репозитории могут быть добавлены индивидуально через /add</i>`;
    } else {
        reposToShow.forEach(([repoKey, repoData]) => {
            const [_, repo] = repoKey.split('/');
            
            message += `📦 <b>${repo}</b>\n`;
            message += `   🌿 Ветка: ${repoData.branch}\n`;
            message += `   🆔 Коммит: ${repoData.lastCommitSha?.slice(0, 7) || '----'}\n`;
            message += `   📅 Добавлен: ${formatDate(repoData.addedAt)}\n`;
            message += `   ⏱ Активность: ${formatTimeAgo(repoData.lastCommitTime)}\n\n`;
            
            message += `   /last ${repoKey} ${repoData.branch} 3\n`;
            message += '━━━━━━━━━━━━━━━━━━\n';
        });
    }

    const keyboard = [];
    
    if (totalPages > 1) {
        const navRow = [];
        if (currentPage > 1) {
            navRow.push({
                text: "◀️ Назад",
                callback_data: `list_owner_${owner}_${currentPage - 1}`
            });
        }
        navRow.push({
            text: `${currentPage}/${totalPages}`,
            callback_data: 'list_current'
        });
        if (currentPage < totalPages) {
            navRow.push({
                text: "Вперед ▶️",
                callback_data: `list_owner_${owner}_${currentPage + 1}`
            });
        }
        keyboard.push(navRow);
    }

    keyboard.push([
        { text: "↩️ К общему списку", callback_data: "list_main_1" }
    ]);

    if (ctx.callbackQuery && ctx.editMessageText) {
        try {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await safeAnswerCbQuery(ctx);
        } catch (error) {
            await sendMessage(ctx, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await safeAnswerCbQuery(ctx);
        }
    } else {
        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

async function showOwnerSelection(ctx, allRepos, trackedOwners) {
    const owners = {};
    allRepos.forEach(([key, data]) => {
        const [owner] = key.split('/');
        if (!owners[owner]) owners[owner] = 0;
        owners[owner]++;
    });

    let message = '👥 <b>Выберите владельца</b>\n';
    message += '━━━━━━━━━━━━━━━━━━\n\n';

    Object.keys(owners).sort().forEach(owner => {
        const isTracked = trackedOwners.includes(owner.toLowerCase());
        const trackingStatus = isTracked ? '🔹' : '🔸';
        message += `${trackingStatus} <b>${owner}</b> - ${owners[owner]} ${getRepoWord(owners[owner])}\n`;
    });

    const keyboard = [];
    const ownerKeys = Object.keys(owners).sort();
    
    for (let i = 0; i < ownerKeys.length; i += 2) {
        const row = [];
        if (ownerKeys[i]) {
            row.push({
                text: ownerKeys[i],
                callback_data: `list_owner_${ownerKeys[i]}_1`
            });
        }
        if (ownerKeys[i + 1]) {
            row.push({
                text: ownerKeys[i + 1],
                callback_data: `list_owner_${ownerKeys[i + 1]}_1`
            });
        }
        if (row.length > 0) {
            keyboard.push(row);
        }
    }

    keyboard.push([
        { text: "↩️ Назад", callback_data: "list_main_1" }
    ]);

    if (ctx.callbackQuery && ctx.editMessageText) {
        try {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await safeAnswerCbQuery(ctx);
        } catch (error) {
            await sendMessage(ctx, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await safeAnswerCbQuery(ctx);
        }
    } else {
        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

async function showStats(ctx, allRepos, trackedOwners) {
    const individualRepos = allRepos.filter(([_, repo]) => repo.trackedIndividually);
    const autoRepos = allRepos.filter(([_, repo]) => !repo.trackedIndividually);
    
    const now = Date.now();
    const activeRepos = allRepos.filter(([_, repo]) => {
        if (!repo.lastCommitTime) return false;
        const diffDays = (now - repo.lastCommitTime) / (1000 * 60 * 60 * 24);
        return diffDays <= 7;
    }).length;

    const recentRepos = allRepos.filter(([_, repo]) => {
        if (!repo.lastCommitTime) return false;
        const diffDays = (now - repo.lastCommitTime) / (1000 * 60 * 60 * 24);
        return diffDays <= 30;
    }).length;

    const inactiveRepos = allRepos.length - recentRepos;

    let message = '📊 <b>Детальная статистика отслеживания</b>\n';
    message += '━━━━━━━━━━━━━━━━━━\n\n';
    message += `📦 Всего репозиториев: ${allRepos.length}\n`;
    message += `🔸 Отдельные: ${individualRepos.length}\n`;
    message += `🔹 Авто-отслеживание: ${autoRepos.length}\n`;
    message += `👥 Отслеживаемых владельцев: ${trackedOwners.length}\n\n`;

    const owners = {};
    allRepos.forEach(([key]) => {
        const [owner] = key.split('/');
        if (!owners[owner]) owners[owner] = 0;
        owners[owner]++;
    });

    const topOwners = Object.entries(owners)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    message += '🏆 <b>Топ владельцев:</b>\n';
    topOwners.forEach(([owner, count], index) => {
        const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
        message += `${medal} ${owner} - ${count} ${getRepoWord(count)}\n`;
    });

    const activityPercent = allRepos.length > 0 ? Math.round((recentRepos / allRepos.length) * 100) : 0;
    
    message += '\n⚡ <b>Активность репозиториев:</b>\n';
    message += `🟢 Активные (&lt;7 дн.): ${activeRepos}\n`;
    message += `🟡 Недавние (&lt;30 дн.): ${recentRepos - activeRepos}\n`;
    message += `🔴 Неактивные (&gt;30 дн.): ${inactiveRepos}\n`;
    message += `📈 Общая активность: ${activityPercent}%\n`;

    const nowDate = new Date();
    const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
    const reposAddedToday = allRepos.filter(([_, repo]) => {
        const addedDate = new Date(repo.addedAt);
        const addedDay = new Date(addedDate.getFullYear(), addedDate.getMonth(), addedDate.getDate()).getTime();
        return addedDay === today;
    }).length;

    const reposAddedThisWeek = allRepos.filter(([_, repo]) => {
        const addedDate = new Date(repo.addedAt);
        return (now - addedDate.getTime()) <= (7 * 24 * 60 * 60 * 1000);
    }).length;

    message += '\n📅 <b>Недавно добавленные:</b>\n';
    message += `📥 Сегодня: ${reposAddedToday}\n`;
    message += `📥 За неделю: ${reposAddedThisWeek}\n`;

    const defaultBranches = {};
    allRepos.forEach(([_, repo]) => {
        const branch = repo.branch || repo.defaultBranch || 'main';
        if (!defaultBranches[branch]) defaultBranches[branch] = 0;
        defaultBranches[branch]++;
    });

    const topBranches = Object.entries(defaultBranches)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    message += '\n🌿 <b>Популярные ветки:</b>\n';
    topBranches.forEach(([branch, count], index) => {
        message += `${index + 1}. ${branch} - ${count}\n`;
    });

    message += `\n🕒 <i>Обновлено: ${new Date().toLocaleString('ru-RU')}</i>`;

    const keyboard = [[
        { text: "↩️ К списку", callback_data: "list_main_1" },
        { text: "🔄 Обновить", callback_data: "list_stats" }
    ]];

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await safeAnswerCbQuery(ctx);
        } catch (error) {
            await sendMessage(ctx, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await safeAnswerCbQuery(ctx);
        }
    } else {
        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}