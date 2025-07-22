const path = require('path');
require('dotenv').config();

module.exports = {
  // Настройки Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_USER_ID: process.env.ADMIN_USER_ID,
  
  // Настройки GitHub
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  
  // Настройки проверки
  CHECK_INTERVAL_MINUTES: 5, // Интервал проверки в минутах
  MAX_REPOS: 50, // Максимальное количество отслеживаемых репозиториев
  
  // Пути к файлам
  DB_FILE: path.join(__dirname, 'data', 'repos.json'),
  LOG_FILE: path.join(__dirname, 'data', 'bot.log')
};