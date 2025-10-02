const fs = require('fs');
const path = require('path');
const config = require('../config');
const { log } = require('../utils/logger');

class Storage {
  constructor() {
    this.repos = new Map();
    this.owners = new Map();
    this.initStorage();
  }

  initStorage() {
    try {
      if (!fs.existsSync(path.dirname(config.DB_FILE))) {
        fs.mkdirSync(path.dirname(config.DB_FILE), { recursive: true });
      }

      if (fs.existsSync(config.DB_FILE)) {
        const data = JSON.parse(fs.readFileSync(config.DB_FILE, 'utf-8'));
        
        if (Array.isArray(data)) {
          this.repos = new Map(data);
          this.owners = new Map();
          log(`Загружено ${this.repos.size} репозиториев из старого формата хранилища`);
        } else if (data && typeof data === 'object') {
          this.repos = new Map(data.repos || []);
          this.owners = new Map(data.owners || []);
          log(`Загружено ${this.repos.size} репозиториев и ${this.owners.size} владельцев из хранилища`);
        }
      }
    if (this.owners.size === 0 && this.repos.size > 0) {
      this.restoreOwnersFromRepos();
    }
  } catch (error) {
    log(`Ошибка инициализации хранилища: ${error.message}`);
  }
}

    restoreOwnersFromRepos() {
    try {
      let restoredCount = 0;
      
      for (const [repoKey, repoData] of this.repos) {
        if (!repoData.trackedIndividually && repoData.fromOwner) {
          const owner = repoData.fromOwner;
          if (!this.owners.has(owner)) {
            this.owners.set(owner, {
              addedAt: repoData.addedAt || new Date().toISOString(),
              lastChecked: Date.now(),
              repoCount: 0
            });
            restoredCount++;
          }
        }
      }
      
      for (const owner of this.owners.keys()) {
        const ownerRepos = this.getReposByOwner(owner);
        this.updateOwnerReposCount(owner, ownerRepos.length);
      }
      
      if (restoredCount > 0) {
        this.save();
        log(`Восстановлено ${restoredCount} владельцев из репозиториев`);
      }
      
      return restoredCount;
    } catch (error) {
      log(`Ошибка восстановления владельцев: ${error.message}`);
      return 0;
    }
  }

  getRepoReleaseInfo(owner, repo) {
    const key = `${owner}/${repo}`.toLowerCase();
    if (!this.repos.has(key)) return null;
    
    const repoData = this.repos.get(key);
    return {
        lastReleaseTag: repoData.lastReleaseTag,
        lastReleaseTime: repoData.lastReleaseTime,
        lastReleaseName: repoData.lastReleaseName,
        lastReleaseUrl: repoData.lastReleaseUrl
    };
  }
  
  getFirstRepo() {
    const repos = this.getRepos();
    return repos.length > 0 ? repos[0][0] : null;
  }

  save() {
    try {
      const data = {
        repos: [...this.repos],
        owners: [...this.owners]
      };
      
      fs.writeFileSync(
        config.DB_FILE,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
      return true;
    } catch (error) {
      log(`Ошибка сохранения хранилища: ${error.message}`);
      return false;
    }
  }

  getRepos() {
    return [...this.repos];
  }

  addOwner(owner) {
    const ownerKey = owner.toLowerCase();
    if (!this.owners.has(ownerKey)) {
      this.owners.set(ownerKey, {
        addedAt: new Date().toISOString(),
        lastChecked: Date.now(),
        repoCount: 0
      });
      return this.save();
    }
    return false;
  }

  removeOwner(owner) {
    const ownerKey = owner.toLowerCase();
    const result = this.owners.delete(ownerKey);
    if (result) this.save();
    return result;
  }

  ownerExists(owner) {
    return this.owners.has(owner.toLowerCase());
  }

  getTrackedOwners() {
    return [...this.owners.keys()];
  }

  updateOwnerReposCount(owner, count) {
    const ownerKey = owner.toLowerCase();
    if (this.owners.has(ownerKey)) {
      const ownerData = this.owners.get(ownerKey);
      this.owners.set(ownerKey, {
        ...ownerData,
        repoCount: count,
        lastChecked: Date.now()
      });
      return this.save();
    }
    return false;
  }

  addRepo(owner, repo, data) {
    const key = `${owner}/${repo}`.toLowerCase();
    this.repos.set(key, {
      defaultBranch: data.defaultBranch || 'main',
      branch: data.branch || data.defaultBranch || 'main',
      addedAt: new Date().toISOString(),
      lastCommitSha: data.lastCommitSha,
      lastCommitTime: data.lastCommitTime,
      lastReleaseTag: data.lastReleaseTag || null,
      lastReleaseTime: data.lastReleaseTime || 0,
      trackedIndividually: true,
      ...data
    });
    return this.save();
  }

  addRepoFromOwner(owner, repo, data) {
    const key = `${owner}/${repo}`.toLowerCase();
    this.repos.set(key, {
      defaultBranch: data.defaultBranch || 'main',
      branch: data.branch || data.defaultBranch || 'main',
      addedAt: new Date().toISOString(),
      lastCommitSha: data.lastCommitSha,
      lastCommitTime: data.lastCommitTime,
      lastReleaseTag: data.lastReleaseTag || null,
      lastReleaseTime: data.lastReleaseTime || 0,
      trackedIndividually: false,
      fromOwner: owner.toLowerCase(),
      isEmpty: data.isEmpty || false,
      ...data
    });
    return this.save();
  }

  getReposByOwner(owner) {
    const ownerKey = owner.toLowerCase();
    return [...this.repos].filter(([key, data]) => {
      return key.startsWith(ownerKey + '/') && !data.trackedIndividually;
    });
  }

  isRepoIndividuallyTracked(owner, repo) {
    const key = `${owner}/${repo}`.toLowerCase();
    return this.repos.has(key) && this.repos.get(key).trackedIndividually;
  }

  removeRepo(owner, repo) {
    const key = `${owner}/${repo}`.toLowerCase();
    const result = this.repos.delete(key);
    if (result) this.save();
    return result;
  }

  updateRepoRelease(owner, repo, releaseData) {
    const key = `${owner}/${repo}`.toLowerCase();
    if (!this.repos.has(key)) return false;

    const repoData = this.repos.get(key);
    const newData = {
        ...repoData,
        lastReleaseTag: releaseData.tag_name,
        lastReleaseTime: new Date(releaseData.published_at || releaseData.created_at).getTime(),
        lastReleaseName: releaseData.name,
        lastReleaseUrl: releaseData.html_url
    };

    if (repoData.lastReleaseTag !== newData.lastReleaseTag) {
        this.repos.set(key, newData);
        return this.save();
    }
    return false;
  }

  updateRepoCommit(owner, repo, commitData) {
    const key = `${owner}/${repo}`.toLowerCase();
    if (!this.repos.has(key)) return false;

    const repoData = this.repos.get(key);
    const newData = {
      ...repoData,
      lastCommitSha: commitData.sha,
      lastCommitTime: new Date(commitData.commit.committer.date).getTime(),
      lastCommitMessage: commitData.commit.message
    };

    if (repoData.lastCommitSha !== newData.lastCommitSha) {
      this.repos.set(key, newData);
      return this.save();
    }
    return false;
  }

  repoExists(owner, repo) {
    return this.repos.has(`${owner}/${repo}`.toLowerCase());
  }
}

module.exports = new Storage();