require('dotenv').config();
const path = require('path');

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  ADMIN_USER_ID: parseInt(process.env.ADMIN_USER_ID) || null,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  CHECK_INTERVAL_MINUTES: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5,
  MAX_REPOS: 100,
  TIMEZONE_OFFSET: 3,
  DB_FILE: path.join(__dirname, 'data', 'repos.json'),
  LOG_FILE: path.join(__dirname, 'data', 'bot.log'),
  DEBUG: process.env.DEBUG === 'true'
};