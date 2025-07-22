const axios = require('axios');
const config = require('../config');
const { log, logError } = require('../utils/logger');
const { sendMessage, sendLongMessage } = require('../utils/message');

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function getPRDetails(owner, repo, prNumber) {
  try {
    const { data } = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          'Authorization': `token ${config.GITHUB_TOKEN}`,
          'User-Agent': 'GitHub-Tracker-Bot',
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    return data;
  } catch (error) {
    throw error;
  }
}

function formatDate(dateString) {
  if (!dateString) return 'неизвестно';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatPRMessage(pr) {
  // Основное сообщение
  let message = `
<b>📌 ${escapeHtml(pr.title)} <i>(#${pr.number})</i></b>
<a href="${pr.html_url}">🔗 Открыть PR на GitHub</a>

${pr.state === 'open' ? '🟢 Открыт' : pr.merged ? '🟣 Слит' : '🔴 Закрыт'}
👤 <b>Автор:</b> <a href="${pr.user.html_url}">@${escapeHtml(pr.user.login)}</a>
📅 <b>Создан:</b> <i>${formatDate(pr.created_at)}</i>
🔄 <b>Обновлён:</b> <i>${formatDate(pr.updated_at)}</i>
🎯 <b>Слит:</b> <i>${pr.merged_at ? formatDate(pr.merged_at) : 'Нет'}</i>

🌿 <b>Ветка:</b> <code>${escapeHtml(pr.head.ref)}</code> → <code>${escapeHtml(pr.base.ref)}</code>

📊 <b>Статистика:</b> 
• Коммитов: <b>${pr.commits}</b>
• Изменений: +${pr.additions}/-${pr.deletions}
`;

  // Метки
  if (pr.labels?.length > 0) {
    message += `\n🏷 <b>Метки:</b> `;
    message += pr.labels.map(l => `<code>${escapeHtml(l.name)}</code>`).join(' ');
  }

  // Назначенные
  if (pr.assignees?.length > 0) {
    message += `\n👥 <b>Назначено:</b> `;
    message += pr.assignees.map(a => 
      `<a href="${a.html_url}">@${escapeHtml(a.login)}</a>`
    ).join(', ');
  }

  // Описание
  if (pr.body) {
    const description = escapeHtml(pr.body.substring(0, 500));
    message += `\n\n📝 <b>Описание:</b>\n<pre>${description}${pr.body.length > 500 ? '...' : ''}</pre>`;
  }

  // Ссылка на файлы изменений
  message += `\n\n📂 <a href="${pr.html_url}/files">Просмотреть изменения</a>`;

  return message;
}

module.exports = async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 2) {
      return await sendMessage(
        ctx,
        `<b>❌ Неверный формат команды</b>\n\n` +
        `<i>Использование:</i> <code>/prview &lt;владелец/репозиторий&gt; &lt;номер_PR&gt;</code>\n\n` +
        `<i>Пример:</i>\n` +
        `<code>/prview facebook/react 123</code>`,
        { parse_mode: 'HTML' }
      );
    }

    const [repoIdentifier, prNumberStr] = args;
    const prNumber = parseInt(prNumberStr);

    if (!repoIdentifier.includes('/')) {
      return await sendMessage(
        ctx,
        `<b>❌ Неверный формат репозитория</b>\n\n` +
        `<i>Формат:</i> <code>&lt;владелец&gt;/&lt;репозиторий&gt;</code>\n` +
        `<i>Пример:</i> <code>facebook/react</code>`,
        { parse_mode: 'HTML' }
      );
    }

    if (isNaN(prNumber)) {
      return await sendMessage(
        ctx,
        `<b>❌ Неверный номер PR</b>\n\n` +
        `Номер PR должен быть числом`,
        { parse_mode: 'HTML' }
      );
    }

    const [owner, repo] = repoIdentifier.split('/');
    const pr = await getPRDetails(owner, repo, prNumber);
    const message = formatPRMessage(pr);
    
    await sendLongMessage(ctx, message, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

  } catch (error) {
    let errorMessage = `<b>❌ Ошибка при получении PR</b>`;
    
    if (error.response) {
      if (error.response.status === 404) {
        errorMessage += `\n\n<i>Проверьте:</i>\n` +
                       `• Существование репозитория\n` +
                       `• Существование PR\n` +
                       `• Ваши права доступа`;
      } else {
        errorMessage += `\n\n<code>Код ошибки: ${error.response.status}</code>`;
      }
    } else {
      errorMessage += `\n\n<code>${escapeHtml(error.message)}</code>`;
    }

    await sendMessage(
      ctx,
      errorMessage,
      { 
        parse_mode: 'HTML',
        disable_web_page_preview: true 
      }
    ).catch(e => logError(e));
    
    logError(error, `PR command failed: ${error.message}`);
  }
};