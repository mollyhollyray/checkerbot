const { getDefaultBranch, fetchCommitsByBranch, getTotalCommitsCount } = require('../service/github');
const { sendMessage, escapeMarkdown } = require('../utils/message');
const { log, logError } = require('../utils/logger');
const storage = require('../service/storage');

module.exports = async (ctx) => {
    const args = ctx.message.text.split(' ').filter(arg => arg.trim());
    
    // Валидация аргументов
    if (args.length < 2 || !args[1].includes('/')) {
        return sendMessage(
            ctx,
            '❌ *Неверный формат команды*\n\n' +
            '▸ Используйте: `/last owner/repo [ветка] [количество=5]`\n' +
            '▸ Примеры:\n' +
            '   `/last facebook/react main 3`\n' +
            '   `/last vuejs/core development`',
            { parse_mode: 'MarkdownV2' }
        );
    }

    const [owner, repo] = args[1].split('/');
    const repoKey = `${owner}/${repo}`.toLowerCase();
    let branch, count = 5;

    // Парсинг аргументов
    if (args.length >= 3) {
        if (!isNaN(args[2])) {
            count = Math.min(parseInt(args[2]), 20);
            branch = await getDefaultBranch(owner, repo) || 'main';
        } else {
            branch = args[2];
            if (args.length >= 4) {
                count = Math.min(parseInt(args[3]), 20);
            }
        }
    } else {
        branch = await getDefaultBranch(owner, repo) || 'main';
    }

    try {
        // Получаем общее количество коммитов в ветке
        const totalCommits = await getTotalCommitsCount(owner, repo, branch);
        
        // Получаем последние N коммитов
        const commits = await fetchCommitsByBranch(owner, repo, branch, count);

        if (commits.length === 0) {
            return sendMessage(
                ctx,
                `🔍 В ветке *${escapeMarkdown(branch)}* репозитория *${escapeMarkdown(repoKey)}* нет коммитов.`,
                { parse_mode: 'MarkdownV2' }
            );
        }

        // Формирование сообщения
        let message = `📌 *Последние коммиты в ${escapeMarkdown(repoKey)} (${escapeMarkdown(branch)}):*\n\n` +
                     `📊 Всего коммитов в ветке: *${totalCommits}*\n\n`;

        commits.forEach((commit, index) => {
            const commitNumber = totalCommits - index; // Реальный номер коммита
            const date = new Date(commit.commit.author.date);
            const shortSha = commit.sha.substring(0, 7);
            
            message += `🔹 *Коммит #${commitNumber}*\n` +
                      `🆔 Хеш: \`${shortSha}\`\n` +
                      `📅 ${date.toLocaleString('ru-RU')}\n` +
                      `👤 ${escapeMarkdown(commit.commit.author.name)}\n` +
                      `📝 ${escapeMarkdown(truncate(commit.commit.message, 100))}\n` +
                      `🔗 <a href="${commit.html_url}">Ссылка</a>\n\n`;
        });

        await sendMessage(ctx, message, {
    parse_ode: 'HTML', // Изменено с MarkdownV2 на HTML
    disable_web_page_preview: true
});

    } catch (error) {
        logError(error, `Last command failed: ${repoKey}`);
        await sendMessage(
            ctx,
            `❌ Ошибка при получении коммитов: ${error.message || 'Неизвестная ошибка'}`,
            { parse_mode: 'MarkdownV2' }
        );
    }
};

// Вспомогательная функция для обрезки текста
function truncate(text, maxLength) {
    return text.length > maxLength 
        ? text.substring(0, maxLength) + '...' 
        : text;
}