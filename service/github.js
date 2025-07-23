const axios = require('axios');
const config = require('../config');
const { log, logError } = require('../utils/logger');
const NodeCache = require('node-cache');

const apiCache = new NodeCache({ stdTTL: 300 });
const apiRateLimit = {
  limit: 60,
  remaining: 60,
  reset: Math.floor(Date.now() / 1000) + 3600
};

async function makeRequest(url, params = {}) {
  try {
    if (apiRateLimit.remaining < 5) {
      const delay = Math.max(0, apiRateLimit.reset * 1000 - Date.now() + 1000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const cacheKey = `${url}-${JSON.stringify(params)}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const response = await axios.get(url, {
      params,
      headers: {
        'Authorization': `token ${config.GITHUB_TOKEN}`,
        'User-Agent': 'GitHub-Tracker-Bot'
      }
    });

    if (response.headers) {
      apiRateLimit.limit = parseInt(response.headers['x-ratelimit-limit']) || 60;
      apiRateLimit.remaining = parseInt(response.headers['x-ratelimit-remaining']) || 0;
      apiRateLimit.reset = parseInt(response.headers['x-ratelimit-reset']) || Math.floor(Date.now() / 1000) + 3600;
    }

    apiCache.set(cacheKey, response.data);
    return response.data;
  } catch (error) {
    logError(`GitHub API request failed: ${url} - ${error.message}`);
    throw error;
  }
}

async function isRepoAccessible(owner, repo) {
  try {
    await makeRequest(`https://api.github.com/repos/${owner}/${repo}`);
    return true;
  } catch (error) {
    return error.response?.status === 403 ? false : false;
  }
}

async function checkBranchExists(owner, repo, branch) {
  try {
    await makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`
    );
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchRepoData(owner, repo) {
  try {
    const [repoInfo, commits] = await Promise.all([
      makeRequest(`https://api.github.com/repos/${owner}/${repo}`),
      makeRequest(`https://api.github.com/repos/${owner}/${repo}/commits`, {
        per_page: 1
      })
    ]);

    return {
      lastCommitSha: commits[0]?.sha || '',
      lastCommitTime: commits[0] ? new Date(commits[0].commit.committer.date).getTime() : 0,
      defaultBranch: repoInfo.default_branch || 'main'
    };
  } catch (error) {
    logError(`Failed to fetch repo data: ${owner}/${repo} - ${error.message}`);
    throw error;
  }
}

async function fetchRepoBranches(owner, repo, limit = 15) {
  try {
    const data = await makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      { per_page: limit }
    );
    return data.map(b => b.name);
  } catch (error) {
    logError(`Failed to fetch branches: ${owner}/${repo} - ${error.message}`);
    return [];
  }
}

async function getBranchLastCommit(owner, repo, branch) {
  try {
    const data = await makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      { sha: branch, per_page: 1 }
    );
    return data[0];
  } catch (error) {
    logError(`Failed to get branch last commit: ${owner}/${repo}/${branch} - ${error.message}`);
    return null;
  }
}

async function getDefaultBranch(owner, repo) {
  try {
    const data = await makeRequest(
      `https://api.github.com/repos/${owner}/${repo}`
    );
    return data.default_branch;
  } catch (error) {
    logError(`Failed to get default branch: ${owner}/${repo} - ${error.message}`);
    return 'main';
  }
}

async function getTotalBranchesCount(owner, repo) {
  try {
    const data = await makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      { per_page: 1 }
    );
    // GitHub не возвращает общее количество, поэтому приблизительная оценка
    return data.length === 1 ? '50+' : data.length;
  } catch (error) {
    logError(`Failed to get branches count: ${owner}/${repo} - ${error.message}`);
    return '?';
  }
}

async function getTotalCommitsCount(owner, repo, branch) {
  try {
    const data = await makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      { sha: branch, per_page: 1 }
    );
    // Точное количество получить сложно без дополнительных запросов
    return data.length === 1 ? '100+' : data.length;
  } catch (error) {
    logError(`Failed to get commits count: ${owner}/${repo}/${branch} - ${error.message}`);
    return '?';
  }
}

async function fetchCommitsWithNumbers(owner, repo, branch, perPage = 5, page = 1) {
    try {
        const response = await makeRequest(
            `https://api.github.com/repos/${owner}/${repo}/commits`,
            {
                sha: branch,
                per_page: perPage,
                page: page
            }
        );
        
        // Если не можем получить общее количество, используем относительную нумерацию
        const firstNumber = (page - 1) * perPage + 1;
        
        return {
            commits: response || [],
            firstNumber: firstNumber,
            hasMore: response?.length === perPage
        };
    } catch (error) {
        logError(`Failed to fetch commits: ${owner}/${repo}/${branch} - ${error.message}`);
        return { commits: [], firstNumber: 1, hasMore: false };
    }
}

async function fetchCommitsByBranch(owner, repo, branch, perPage = 5, page = 1) {
    try {
        const response = await makeRequest(
            `https://api.github.com/repos/${owner}/${repo}/commits`,
            {
                sha: branch,
                per_page: perPage,
                page: page
            }
        );
        return response || [];
    } catch (error) {
        logError(`Failed to fetch commits: ${owner}/${repo}/${branch} - ${error.message}`);
        return [];
    }
}

module.exports = {
  makeRequest,
  isRepoAccessible,
  checkBranchExists,
  fetchCommitsByBranch,
  fetchRepoData,
  fetchRepoBranches,
  fetchCommitsWithNumbers,
  getBranchLastCommit,
  getDefaultBranch,
  getTotalBranchesCount,
  getTotalCommitsCount,
  apiRateLimit
};