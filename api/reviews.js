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
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ ok: res.statusCode === 200, body: d }));
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
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'centr-vremya-posts', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

async function loadReviews(month) {
  const res = await ghGet(`reviews/${month}.json`);
  if (!res.ok) return { data: {}, sha: null };
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
    const month = req.query.month || 'june';
    const { data } = await loadReviews(month);
    res.status(200).json(data);
    return;
  }

  if (req.method === 'POST') {
    const { month, idx, status, comment } = req.body;
    const { data: reviews, sha } = await loadReviews(month);
    const key = String(idx);
    if (!reviews[key]) reviews[key] = {};
    if (status !== undefined) reviews[key].status = status;
    if (comment !== undefined) reviews[key].comment = comment;
    reviews[key].updated = new Date().toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
    const content = Buffer.from(JSON.stringify(reviews, null, 2)).toString('base64');
    const body = { message: `update reviews/${month}.json`, content, branch: BRANCH };
    if (sha) body.sha = sha;
    await ghPut(`reviews/${month}.json`, body);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
