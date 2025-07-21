const axios = require('axios');
const config = require('../config');
const { log, logError } = require('../utils/logger');

let apiRateLimit = {
  remaining: 60,
  reset: 0
};

async function makeRequest(url) {
  try {
    if (apiRateLimit.remaining < 5) {
      throw new Error(`GitHub API limit reached. Resets at: ${new Date(apiRateLimit.reset * 1000)}`);
    }

    const response = await axios.get(url, {
      headers: {
        'Authorization': `token ${config.GITHUB_TOKEN}`,
        'User-Agent': 'GitHub-Tracker-Bot'
      }
    });

    // Обновляем лимиты
    if (response.headers['x-ratelimit-remaining']) {
      apiRateLimit = {
        remaining: parseInt(response.headers['x-ratelimit-remaining']),
        reset: parseInt(response.headers['x-ratelimit-reset'])
      };
    }

    return response.data;
  } catch (error) {
    logError(error, 'GitHub API request failed');
    throw error;
  }
}

async function fetchRepoBranches(owner, repo) {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${owner}/${repo}/branches`,
            {
                headers: {
                    'Authorization': `token ${config.GITHUB_TOKEN}`,
                    'User-Agent': 'GitHub-Tracker-Bot'
                },
                params: {
                    per_page: 50 // Лимит GitHub API
                }
            }
        );
        
        return response.data.map(b => b.name).sort();
    } catch (error) {
        logError(error, `Failed to fetch branches: ${owner}/${repo}`);
        throw error;
    }
}

async function getDefaultBranch(owner, repo) {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${owner}/${repo}`,
            {
                headers: {
                    'Authorization': `token ${config.GITHUB_TOKEN}`,
                    'User-Agent': 'GitHub-Tracker-Bot'
                }
            }
        );
        return response.data.default_branch;
    } catch (error) {
        logError(error, `Failed to get default branch: ${owner}/${repo}`);
        return null;
    }
}

async function getBranchLastCommit(owner, repo, branch) {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=1`,
            {
                headers: {
                    'Authorization': `token ${config.GITHUB_TOKEN}`,
                    'User-Agent': 'GitHub-Tracker-Bot'
                }
            }
        );
        return response.data[0];
    } catch (error) {
        logError(error, `Failed to get branch last commit: ${owner}/${repo}/${branch}`);
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
    logError(error, `Failed to fetch repo data: ${owner}/${repo}`);
    throw error;
  }
}

module.exports = {
  fetchRepoData,
  apiRateLimit,
  getDefaultBranch,
  fetchRepoBranches,
  getBranchLastCommit
};