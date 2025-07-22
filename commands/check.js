const checker = require('../service/checker');
const { sendMessage } = require('../utils/message');
const { log } = require('../utils/logger');

module.exports = async (ctx) => {
  try {
    await sendMessage(ctx, '🔍 Запуск ручной проверки...');
    const updates = await checker.checkAllRepos(ctx.bot);
    
    await sendMessage(
      ctx,
      updates.length > 0 
        ? `✅ Найдено обновлений: ${updates.length}`
        : '🔄 Все репозитории актуальны'
    );
  } catch (error) {
    logError(error, 'Ручная проверка');
    await sendMessage(ctx, '❌ Ошибка при проверке');
  }
};