const storage = require('../service/storage');
const { sendMessage, sendLongMessage } = require('../utils/message');
const logger = require('../utils/logger');

module.exports = async (ctx) => {
    try {
        await ctx.replyWithChatAction('typing');
        const repos = storage.getRepos();
        
        if (!repos.length) {
            return await sendMessage(
                ctx,
                '📭 Список отслеживаемых репозиториев пуст\n\n' +
                'Добавьте первый репозиторий командой:\n' +
                '/add владелец/репозиторий'
            );
        }

        const reposByOwner = {};
        repos.forEach(([key, data]) => {
            const [owner, repo] = key.split('/');
            if (!reposByOwner[owner]) reposByOwner[owner] = [];
            
            let daysAgo = '∞';
            if (data.lastCommitTime) {
                const diffDays = Math.floor((Date.now() - data.lastCommitTime) / (1000 * 60 * 60 * 24));
                daysAgo = diffDays === 0 ? 'менее дня' : `${diffDays} дн.`;
            }
            
            reposByOwner[owner].push({
                repo,
                fullName: `${owner}/${repo}`,
                branch: data.branch || data.defaultBranch || 'main',
                lastCommitSha: data.lastCommitSha,
                daysAgo,
                addedAt: data.addedAt
            });
        });

        let message = '📂 Отслеживаемые репозитории\n';
        message += '━━━━━━━━━━━━━━━━━━\n';
        message += `📊 Всего: ${repos.length} ${getRepoWord(repos.length)}\n`;
        message += `🔄 Активных: ${repos.filter(r => r[1].lastCommitTime).length}\n`;
        message += '━━━━━━━━━━━━━━━━━━\n\n';

        Object.entries(reposByOwner).forEach(([owner, items]) => {
            message += `👤 ${owner}\n\n`;
            
            items.forEach(item => {
                message +=
`▸ ${item.repo} (🌿 ${item.branch})
├ 🆔 ${item.lastCommitSha?.slice(0, 7) || '----'}
├ 📅 ${formatDate(item.addedAt)}
└ ⏱ ${item.daysAgo} назад\n\n` +
`/last ${item.fullName} ${item.branch} 5\n` +
'━━━━━━━━━━━━━━━━━━\n';
            });
        });

        message += '\n💡 Быстрые команды:\n';
        message += '/add владелец/репозиторий - добавить\n';
        message += '/remove владелец/репозиторий - удалить\n';
        message += '/check все - проверить обновления';

        await sendLongMessage(ctx, message);

    } catch (error) {
        logger.error(error, 'List command failed');
        await sendMessage(
            ctx,
            '❌ Ошибка при получении списка\n' +
            error.message
        );
    }
};

function getRepoWord(count) {
    const cases = [2, 0, 1, 1, 1, 2];
    const words = ['репозиторий', 'репозитория', 'репозиториев'];
    return words[
        count % 100 > 4 && count % 100 < 20 ? 2 : cases[Math.min(count % 10, 5)]
    ];
}

function formatDate(isoString) {
    try {
        const date = new Date(isoString);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    } catch {
        return 'дата неизвестна';
    }
}