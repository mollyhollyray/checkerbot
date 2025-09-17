const axios = require('axios');
const { log, logError } = require('./logger');

class HealthCheck {
  constructor() {
    this.lastCheck = null;
    this.isHealthy = false;
  }

  async checkTelegramAPI() {
    try {
      const response = await axios.get('https://api.telegram.org', {
        timeout: 10000
      });
      this.isHealthy = response.status === 200;
      this.lastCheck = new Date();
      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      this.lastCheck = new Date();
      logError('Health check failed for Telegram API', error);
      return false;
    }
  }

  async checkGitHubAPI() {
    try {
      const response = await axios.get('https://api.github.com', {
        timeout: 10000
      });
      return response.status === 200;
    } catch (error) {
      logError('Health check failed for GitHub API', error);
      return false;
    }
  }

  getStatus() {
    return {
      telegramAPI: this.isHealthy,
      lastCheck: this.lastCheck,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new HealthCheck();