const storage = require('../service/storage');
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

module.exports = async (ctx) => {
    try {
        const args = ctx.message.text.split(' ').slice(1);
        const mode = args[0] || 'main';
        const param = args[1];
        const page = parseInt(param) || 1;

        await ctx.replyWithChatAction('typing');
        
        const allRepos = storage.getRepos();
        const trackedOwners = storage.getTrackedOwners();
        
        if (allRepos.length === 0) {
            return await sendMessage(
                ctx,
                '📭 Нет отслеживаемых репозиториев\n\n' +
                'Добавьте первый: /add owner/repo',
                { parse_mode: 'HTML' }
            );
        }

        // Получаем ID сообщения для редактирования (если есть)
        const messageId = ctx.message?.message_id;

        switch (mode) {
            case 'owner':
                if (!param) {
                    return await showOwnerSelection(ctx, allRepos, trackedOwners, messageId);
                }
                return await showOwnerRepos(ctx, param, page, messageId);
                
            case 'stats':
                return await showStats(ctx, allRepos, trackedOwners, messageId);
                
            default:
                return await showMainList(ctx, allRepos, trackedOwners, page, messageId);
        }

    } catch (error) {
        logger.error('List command failed:', error);
        await sendMessage(ctx, '❌ Ошибка при получении списка', { parse_mode: 'HTML' });
    }
};

// Главный список
async function showMainList(ctx, allRepos, trackedOwners, page, editMessageId = null) {
    const totalPages = Math.ceil(allRepos.length / REPOS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (currentPage - 1) * REPOS_PER_PAGE;
    const endIdx = startIdx + REPOS_PER_PAGE;
    
    const reposToShow = allRepos.slice(startIdx, endIdx);

    // Статистика в начале
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
        const daysAgo = repoData.lastCommitTime 
            ? Math.floor((Date.now() - repoData.lastCommitTime) / (1000 * 60 * 60 * 24))
            : '∞';
        
        const emoji = repoData.trackedIndividually ? '🔸' : '🔹';
        
        message += `${emoji} <b>${owner}/</b><code>${repo}</code>\n`;
        message += `   🌿 Ветка: ${repoData.branch}\n`;
        message += `   🆔 Коммит: ${repoData.lastCommitSha?.slice(0, 7) || '----'}\n`;
        message += `   📅 Добавлен: ${formatDate(repoData.addedAt)}\n`;
        message += `   ⏱ Активность: ${daysAgo} назад\n\n`;
        
        message += `   /last ${repoKey} ${repoData.branch} 3\n`;
        message += '━━━━━━━━━━━━━━━━━━\n';
    });

    const keyboard = [];
    
    // Навигация
    if (totalPages > 1) {
        const navRow = [];
        if (currentPage > 1) {
            navRow.push({
                text: "◀️ Назад",
                callback_data: `list_main_${currentPage - 1}`
            });
        }
        navRow.push({
            text: `${currentPage}/${totalPages}`,
            callback_data: 'list_current'
        });
        if (currentPage < totalPages) {
            navRow.push({
                text: "Вперед ▶️",
                callback_data: `list_main_${currentPage + 1}`
            });
        }
        keyboard.push(navRow);
    }

    // Дополнительные действия
    keyboard.push([
        { text: "👥 По владельцам", callback_data: "list_owner_view" },
        { text: "📊 Детальная статистика", callback_data: "list_stats" }
    ]);

    // Редактируем существующее сообщение или отправляем новое
    if (editMessageId && ctx.callbackQuery) {
        try {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await ctx.answerCbQuery();
        } catch (error) {
            // Если редактирование не удалось, отправляем новое сообщение
            await sendMessage(ctx, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } else {
        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

// Просмотр репозиториев владельца
async function showOwnerRepos(ctx, owner, page, editMessageId = null) {
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

    reposToShow.forEach(([repoKey, repoData]) => {
        const [_, repo] = repoKey.split('/');
        const daysAgo = repoData.lastCommitTime 
            ? Math.floor((Date.now() - repoData.lastCommitTime) / (1000 * 60 * 60 * 24))
            : '∞';
        
        message += `📦 <b>${repo}</b>\n`;
        message += `   🌿 Ветка: ${repoData.branch}\n`;
        message += `   🆔 Коммит: ${repoData.lastCommitSha?.slice(0, 7) || '----'}\n`;
        message += `   📅 Добавлен: ${formatDate(repoData.addedAt)}\n`;
        message += `   ⏱ Активность: ${daysAgo} назад\n\n`;
        
        message += `   /last ${repoKey} ${repoData.branch} 3\n`;
        message += '━━━━━━━━━━━━━━━━━━\n';
    });

    const keyboard = [];
    
    // Навигация
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

    // Возврат
    keyboard.push([
        { text: "↩️ К общему списку", callback_data: "list_main_1" }
    ]);

    // Редактируем или отправляем новое
    if (editMessageId && ctx.callbackQuery) {
        try {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await ctx.answerCbQuery();
        } catch (error) {
            await sendMessage(ctx, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } else {
        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

// Выбор владельца
async function showOwnerSelection(ctx, allRepos, trackedOwners, editMessageId = null) {
    // Группируем по владельцам
    const owners = {};
    allRepos.forEach(([key, data]) => {
        const [owner] = key.split('/');
        if (!owners[owner]) owners[owner] = 0;
        owners[owner]++;
    });

    let message = '👥 <b>Выберите владельца</b>\n';
    message += '━━━━━━━━━━━━━━━━━━\n\n';

    Object.keys(owners).sort().forEach(owner => {
        message += `🔹 <b>${owner}</b> - ${owners[owner]} ${getRepoWord(owners[owner])}\n`;
    });

    const keyboard = [];
    const ownerKeys = Object.keys(owners).sort();
    
    // Создаем кнопки владельцев
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
        keyboard.push(row);
    }

    keyboard.push([
        { text: "↩️ Назад", callback_data: "list_main_1" }
    ]);

    // Редактируем или отправляем новое
    if (editMessageId && ctx.callbackQuery) {
        try {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await ctx.answerCbQuery();
        } catch (error) {
            await sendMessage(ctx, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } else {
        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

// Статистика
async function showStats(ctx, allRepos, trackedOwners, editMessageId = null) {
    const individualRepos = allRepos.filter(([_, repo]) => repo.trackedIndividually);
    const autoRepos = allRepos.filter(([_, repo]) => !repo.trackedIndividually);
    
    let message = '📊 <b>Детальная статистика отслеживания</b>\n';
    message += '━━━━━━━━━━━━━━━━━━\n\n';
    message += `📦 Всего репозиториев: ${allRepos.length}\n`;
    message += `🔸 Отдельные: ${individualRepos.length}\n`;
    message += `🔹 Авто-отслеживание: ${autoRepos.length}\n`;
    message += `👥 Отслеживаемых владельцев: ${trackedOwners.length}\n\n`;

    // Топ владельцев
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

    // Активность
    const activeRepos = allRepos.filter(([_, repo]) => repo.lastCommitTime).length;
    const inactiveRepos = allRepos.length - activeRepos;
    
    message += '\n⚡ <b>Активность:</b>\n';
    message += `🟢 Активных: ${activeRepos}\n`;
    message += `🔴 Неактивных: ${inactiveRepos}\n`;
    message += `📈 Активность: ${Math.round((activeRepos / allRepos.length) * 100)}%\n`;

    const keyboard = [[
        { text: "↩️ К списку", callback_data: "list_main_1" },
        { text: "🔄 Обновить", callback_data: "list_stats" }
    ]];

    // Редактируем или отправляем новое
    if (editMessageId && ctx.callbackQuery) {
        try {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
            await ctx.answerCbQuery();
        } catch (error) {
            await sendMessage(ctx, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } else {
        await sendMessage(ctx, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}