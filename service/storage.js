const fs = require('fs');
const path = require('path');
const config = require('../config');
const { log, logError } = require('../utils/logger');

class Storage {
  constructor() {
    this.repos = new Map();
    this.load();
    this.ensureDataDir();
  }

  ensureDataDir() {
    const dir = path.dirname(config.DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(config.DB_FILE)) {
        const data = JSON.parse(fs.readFileSync(config.DB_FILE, 'utf-8'));
        this.repos = new Map(data);
        log(`Loaded ${this.repos.size} repositories from storage`);
      }
    } catch (error) {
      logError(error, 'Failed to load storage');
    }
  }

  save() {
    try {
      fs.writeFileSync(
        config.DB_FILE,
        JSON.stringify([...this.repos], null, 2),
        'utf-8'
      );
    } catch (error) {
      logError(error, 'Failed to save storage');
    }
  }

  addRepo(owner, repo, data) {
    const key = `${owner}/${repo}`.toLowerCase();
    this.repos.set(key, data);
    this.save();
    log(`Added repository: ${key}`, 'success');
    return true;
  }

  hasRepo(owner, repo) {
    return this.repos.has(`${owner}/${repo}`.toLowerCase());
  }

  getRepos() {
    return Array.from(this.repos.entries());
  }
}

module.exports = new Storage();