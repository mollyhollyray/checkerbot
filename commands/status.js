const healthCheck = require('../utils/healthcheck');
const { sendMessage } = require('../utils/message');

module.exports = async (ctx) => {
  try {
    const telegramStatus = await healthCheck.checkTelegramAPI();
    const githubStatus = await healthCheck.checkGitHubAPI();
    
    const status = healthCheck.getStatus();
    
    const message = `
🩺 <b>Статус системы</b>

▸ <b>Telegram API:</b> ${telegramStatus ? '✅ Online' : '❌ Offline'}
▸ <b>GitHub API:</b> ${githubStatus ? '✅ Online' : '❌ Offline'}
▸ <b>Последняя проверка:</b> ${status.lastCheck ? status.lastCheck.toLocaleString('ru-RU') : 'Никогда'}

${!telegramStatus ? '⚠️ <i>Нет связи с Telegram API. Проверьте интернет-соединение</i>' : ''}
    `.trim();

    await sendMessage(ctx, message, { parse_mode: 'HTML' });
    
  } catch (error) {
    await sendMessage(
      ctx,
      '❌ Ошибка при проверке статуса системы',
      { parse_mode: 'HTML' }
    );
  }
};