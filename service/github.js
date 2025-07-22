const axios = require('axios');
const config = require('../config');
const { log, logError } = require('../utils/logger');

const apiRateLimit = {
  limit: 60,
  remaining: 60,
  reset: Math.floor(Date.now() / 1000) + 3600
};

async function makeRequest(url) {
  try {
    if (apiRateLimit.remaining < 5) {
      const delay = Math.max(0, apiRateLimit.reset * 1000 - Date.now() + 1000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const response = await axios.get(url, {
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

    return response.data;
  } catch (error) {
    logError(`GitHub API request failed: ${url} - ${error.message}`);
    throw error;
  }
}

async function getBranchLastCommit(owner, repo, branch) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      {
        params: {
          sha: branch,
          per_page: 1
        },
        headers: {
          'Authorization': `token ${config.GITHUB_TOKEN}`,
          'User-Agent': 'GitHub-Tracker-Bot'
        }
      }
    );

    if (response.status === 404 || !response.data[0]) {
      throw new Error(`Репозиторий или ветка не найдены: ${owner}/${repo}/${branch}`);
    }

    return response.data[0];
  } catch (error) {
    logError(`Failed to get branch last commit: ${owner}/${repo}/${branch} - ${error.message}`);
    return null;
  }
}

async function fetchRepoData(owner, repo) {
  try {
    const [repoInfo, commits] = await Promise.all([
      makeRequest(`https://api.github.com/repos/${owner}/${repo}`),
      makeRequest(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`)
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

module.exports = {
  fetchRepoData,
  getBranchLastCommit,
  apiRateLimit,
  makeRequest
};