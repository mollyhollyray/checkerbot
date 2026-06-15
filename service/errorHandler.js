/**
 * Универсальный обработчик ошибок для сервисов.
 * Принимает ошибку, контекст (строку описания) и возвращает объект,
 * совместимый с текущей кодовой базой (log + rethrow при необходимости).
 */
function handleError(err, context) {
  // Логируем ошибку через существующий logger
  const logger = require('../utils/logger');
  const message = context ? `${context}: ${err.message}` : err.message;
  logger.error(message, { stack: err.stack, context });
  // Возвращаем ошибку дальше – большинство сервисов ожидают бросок
  return err;
}

module.exports = { handleError };
