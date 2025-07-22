const fs = require('fs');
const path = require('path');
const config = require('../config');

function getTimestamp() {
  return new Date().toISOString();
}

function logToFile(message) {
  fs.appendFileSync(
    config.LOG_FILE,
    `[${getTimestamp()}] ${message}\n`,
    'utf-8'
  );
}

module.exports = {
  log(message, level = 'info') {
    const formatted = `[${level.toUpperCase()}] ${message}`;
    console.log(formatted);
    logToFile(formatted);
  },
  
  logError(error, context = '') {
    const message = context ? `${context}: ${error.message}` : error.message;
    console.error(message, error.stack);
    logToFile(`[ERROR] ${message} ${error.stack}`);
  }
};