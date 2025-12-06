require('dotenv').config();
const path = require('path');

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  ADMIN_USER_ID: parseInt(process.env.ADMIN_USER_ID) || null,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  CHECK_INTERVAL_MINUTES: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5,
  CHECK_AUTO_TRACKED_REPOS: process.env.CHECK_AUTO_TRACKED_REPOS === 'true' || true,
  CHECK_AUTO_TRACKED_BRANCHES: process.env.CHECK_AUTO_TRACKED_BRANCHES === 'true' || false,
  MAX_REPOS: 100,
  TIMEZONE_OFFSET: 3,
  DB_FILE: path.join(__dirname, 'data', 'repos.json'),
  LOG_FILE: path.join(__dirname, 'data', 'bot.log'),
  DEBUG: process.env.DEBUG === 'true',
  
  // MongoDB конфигурация
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/github-tracker',
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || 'github-tracker'
};