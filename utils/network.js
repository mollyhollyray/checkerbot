const axios = require('axios');
const { logError } = require('./logger');

class NetworkManager {
  constructor() {
    this.retryAttempts = 3;
    this.retryDelay = 2000;
  }

  async withRetry(operation, operationName = 'operation') {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === this.retryAttempts) {
          throw error;
        }
        
        logError(`Attempt ${attempt} failed for ${operationName}`, error, {
          operation: operationName,
          attempt,
          nextRetry: this.retryDelay * attempt
        });
        
        await this.delay(this.retryDelay * attempt);
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isNetworkError(error) {
    return [
      'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 
      'ENOTFOUND', 'EAI_AGAIN'
    ].includes(error.code);
  }
}

module.exports = new NetworkManager();