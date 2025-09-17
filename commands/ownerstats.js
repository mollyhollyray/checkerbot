const storage = require('../service/storage');
const { sendMessage, sendLongMessage } = require('../utils/message');

module.exports = async (ctx) => {
    try {
        const trackedOwners = storage.getTrackedOwners();
        
        if (!trackedOwners.length) {
            return await sendMessage(
                ctx,
                '👥 Нет отслеживаемых владельцев\n\n' +
                'Добавьте первого: /trackowner username',
                { parse_mode: 'HTML' }
            );
        }

        let message = '👥 <b>Статистика отслеживаемых владельцев</b>\n';
        message += '━━━━━━━━━━━━━━━━━━\n\n';

        for (const owner of trackedOwners) {
            const ownerData = storage.owners.get(owner);
            const repos = storage.getReposByOwner(owner);
            const activeRepos = repos.filter(([_, repo]) => repo.lastCommitTime).length;
            
            message += `🔹 <b>${owner}</b>\n`;
            message += `   📦 Репозиториев: ${repos.length} (${activeRepos} активных)\n`;
            message += `   📅 Добавлен: ${new Date(ownerData.addedAt).toLocaleDateString('ru-RU')}\n`;
            message += `   🔍 Последняя проверка: ${new Date(ownerData.lastChecked || 0).toLocaleDateString('ru-RU')}\n\n`;
            
            message += `   <code>/untrackowner ${owner}</code> - Удалить\n`;
            message += '   ━━━━━━━━━━━━━━━━━━\n\n';
        }

        message += '💡 <i>Автоматически отслеживаются все новые репозитории</i>';

        await sendLongMessage(ctx, message, { parse_mode: 'HTML' });

    } catch (error) {
        await sendMessage(
            ctx,
            '❌ Ошибка при получении статистики владельцев',
            { parse_mode: 'HTML' }
        );
    }
};