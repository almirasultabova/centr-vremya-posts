const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'almirasultabova/centr-vremya-posts';
const BRANCH = 'main';

function ghGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPO}/contents/${path}?ref=${BRANCH}&t=${Date.now()}`,
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'centr-vremya-posts' }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject); req.end();
  });
}

function ghPut(path, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPO}/contents/${path}`,
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'centr-vremya-posts',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch(e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

async function loadReviews(month) {
  const res = await ghGet(`reviews/${month}.json`);
  if (res.status !== 200) return { data: {}, sha: null };
  const json = JSON.parse(res.body);
  const content = Buffer.from(json.content.replace(/\n/g, ''), 'base64').toString('utf8');
  return { data: JSON.parse(content), sha: json.sha };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'GET') {
    const month = (req.query && req.query.month) || 'june';
    try {
      const { data } = await loadReviews(month);
      res.status(200).json(data);
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const month = body.month || 'june';
      const incomingReviews = body.reviews || {};

      const { sha } = await loadReviews(month);
      const content = Buffer.from(JSON.stringify(incomingReviews, null, 2)).toString('base64');
      const payload = { message: `update reviews/${month}.json`, content, branch: BRANCH };
      if (sha) payload.sha = sha;

      const result = await ghPut(`reviews/${month}.json`, payload);
      if (result.status >= 400) {
        res.status(result.status).json({ error: 'GitHub write failed', detail: result.body });
      } else {
        res.status(200).json({ ok: true });
      }
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
