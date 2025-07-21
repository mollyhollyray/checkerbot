const fs = require('fs');
const path = require('path');
const { LOG_FILE } = require('../config');

const EMOJI_MAP = {
  debug: '🐛',
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌'
};

function log(message, level = 'info') {
  const emoji = EMOJI_MAP[level] || '';
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${emoji} ${message}`;

  console.log(logEntry);

  if (['error', 'warning', 'success'].includes(level)) {
    try {
      if (!fs.existsSync(path.dirname(LOG_FILE))) {
        fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
      }
      fs.appendFileSync(LOG_FILE, logEntry + '\n', 'utf-8');
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }
}

function logError(error, context = '') {
  let message = context ? `${context}: ${error.message}` : error.message;
  
  if (error.response) {
    message += `\nStatus: ${error.response.status}`;
    if (error.response.data?.message) {
      message += `\nMessage: ${error.response.data.message}`;
    }
  }

  log(message, 'error');
}

module.exports = {
  log,
  logError
};