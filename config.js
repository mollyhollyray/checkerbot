const path = require('path');
require('dotenv').config();

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN не указан в .env файле');
}

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_USER_ID: process.env.ADMIN_USER_ID || '',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  CHECK_INTERVAL_MINUTES: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 1, // Изменили на 1 минуту
  MAX_REPOS: parseInt(process.env.MAX_REPOS) || 50,
  DB_FILE: path.join(__dirname, 'data', 'repos.json'),
  LOG_FILE: path.join(__dirname, 'data', 'bot.log')
};