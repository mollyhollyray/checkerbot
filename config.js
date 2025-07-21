const path = require('path');
require('dotenv').config();

module.exports = {
  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_USER_ID: process.env.ADMIN_USER_ID,

  // GitHub
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,

  // Paths
  DB_FILE: path.join(__dirname, 'data', 'repos.json'),
  LOG_FILE: path.join(__dirname, 'data', 'commits.log'),

  // Limits
  MAX_REPOS: 100, // Максимальное количество отслеживаемых репозиториев
  API_RATE_LIMIT_THRESHOLD: 5 // Предупреждать при остатке < N запросов
};