const fs = require('fs');
const path = require('path');

// Manually parse env
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const firstEquals = trimmed.indexOf('=');
      if (firstEquals !== -1) {
        const key = trimmed.substring(0, firstEquals).trim();
        const val = trimmed.substring(firstEquals + 1).trim();
        if (key && val) {
          process.env[key] = val;
        }
      }
    }
  });
}

const masterAppId = process.env.WOOVI_MASTER_APP_ID;
console.log('Master App ID loaded:', masterAppId ? `${masterAppId.substring(0, 15)}...` : 'not found');

if (!masterAppId) {
  process.exit(1);
}

const isSandbox = masterAppId.includes('sandbox') || masterAppId.includes('plugin_sb');
const wooviUrl = isSandbox
  ? 'https://api.woovi-sandbox.com/api/v1/subaccount'
  : 'https://api.woovi.com/api/v1/subaccount';

console.log('Calling Woovi API GET:', wooviUrl);

fetch(wooviUrl, {
  method: 'GET',
  headers: {
    'Authorization': masterAppId,
  },
})
.then(async (res) => {
  console.log('Status Code:', res.status);
  const json = await res.json();
  console.log('Response:', JSON.stringify(json, null, 2));
})
.catch((err) => {
  console.error('Fetch error:', err);
});
