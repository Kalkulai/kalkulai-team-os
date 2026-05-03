// Local smoke-test for /api/webhooks/github/pr-merged.
// Builds a synthetic merged-PR payload, HMAC-signs it, posts it to the
// target URL. Reads GITHUB_WEBHOOK_SECRET and optional VERCEL_BYPASS_TOKEN
// from env. Run: node scripts/test-webhook.js [url] [linear-id]
//
// Examples:
//   node scripts/test-webhook.js
//   node scripts/test-webhook.js http://localhost:3000 KAL-99
//   node scripts/test-webhook.js https://kalkulai-team-os.vercel.app KAL-1
//
// Default Linear-ID is KAL-99 which is unlikely to exist -> webhook returns
// "skipped: issue KAL-99 not found" without mutating any real Linear issue.

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const TARGET = process.argv[2] || 'http://localhost:3000';
const LINEAR_ID = process.argv[3] || 'KAL-99';
const SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const BYPASS = process.env.VERCEL_BYPASS_TOKEN;

if (!SECRET) {
  console.error('GITHUB_WEBHOOK_SECRET not set in env');
  process.exit(1);
}

const branch = `feature/${LINEAR_ID.toLowerCase()}-smoke-test`;
const payload = {
  action: 'closed',
  pull_request: {
    merged: true,
    head: { ref: branch },
    title: `${LINEAR_ID}: smoke-test PR`,
    html_url: 'https://github.com/Kalkulai/kalkulai/pull/0',
  },
};

const body = JSON.stringify(payload);
const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');

const url = new URL(`${TARGET}/api/webhooks/github/pr-merged`);
const lib = url.protocol === 'https:' ? https : http;

const headers = {
  'Content-Type': 'application/json',
  'Content-Length': Buffer.byteLength(body),
  'X-GitHub-Event': 'pull_request',
  'X-Hub-Signature-256': sig,
};
if (BYPASS) headers['x-vercel-protection-bypass'] = BYPASS;

const req = lib.request(
  {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers,
  },
  (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      console.log(`HTTP ${res.statusCode}`);
      try {
        console.log(JSON.stringify(JSON.parse(data), null, 2));
      } catch {
        console.log(data.slice(0, 500));
      }
    });
  }
);
req.on('error', (e) => {
  console.error('request error:', e.message);
  process.exit(1);
});
req.write(body);
req.end();
