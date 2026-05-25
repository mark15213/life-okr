/**
 * One-shot helper to obtain TickTick OAuth access_token + refresh_token.
 *
 * Usage:
 *   TICKTICK_CLIENT_ID=xxx TICKTICK_CLIENT_SECRET=yyy npx tsx scripts/ticktick-oauth-bootstrap.ts
 *
 * Requires that the TickTick app's redirect URI is registered as:
 *   http://localhost:8000/callback
 *
 * Flow:
 *  1. Starts an HTTP server on localhost:8000.
 *  2. Prints an authorize URL — open it in your browser, approve, get redirected.
 *  3. Server captures ?code=..., POSTs to /oauth/token, prints access_token + refresh_token.
 *  4. Server shuts down.
 */
import * as http from 'node:http';

const CLIENT_ID = process.env.TICKTICK_CLIENT_ID;
const CLIENT_SECRET = process.env.TICKTICK_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Set TICKTICK_CLIENT_ID and TICKTICK_CLIENT_SECRET in env');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:8000/callback';
const SCOPE = 'tasks:read tasks:write';
const STATE = Math.random().toString(36).slice(2);

const authorizeUrl = `https://ticktick.com/oauth/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&scope=${encodeURIComponent(SCOPE)}&state=${STATE}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`;

console.log('\n=== TickTick OAuth bootstrap ===\n');
console.log('Open this URL in your browser:\n');
console.log('  ' + authorizeUrl);
console.log('\nWaiting for callback on http://localhost:8000/callback ...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost:8000');
  if (url.pathname !== '/callback') {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  if (err) {
    console.error(`❌ Authorization denied: ${err}`);
    res.statusCode = 400;
    res.end(`Authorization error: ${err}. You can close this tab.`);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.statusCode = 400;
    res.end('No code in callback');
    return;
  }
  if (state !== STATE) {
    console.error(`❌ State mismatch (csrf check). Expected ${STATE}, got ${state}`);
    res.statusCode = 400;
    res.end('State mismatch');
    server.close();
    process.exit(1);
  }

  console.log('✓ Received code from TickTick — exchanging for tokens…');

  try {
    const tokenRes = await fetch('https://ticktick.com/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        scope: SCOPE,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) {
      console.error(`❌ Token exchange failed: ${tokenRes.status} ${text}`);
      res.statusCode = 500;
      res.end('Token exchange failed; check terminal.');
      server.close();
      process.exit(1);
    }
    const tok = JSON.parse(text);
    console.log('\n✅ Success! Add the following to your .env.local:\n');
    console.log(`TICKTICK_ACCESS_TOKEN="${tok.access_token}"`);
    console.log(`TICKTICK_REFRESH_TOKEN="${tok.refresh_token ?? '(none returned)'}"`);
    console.log(`\n(expires_in = ${tok.expires_in}s, scope = ${tok.scope ?? SCOPE})\n`);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>✅ Done</h1><p>Check your terminal for the tokens. You can close this tab.</p>');
    setTimeout(() => { server.close(); process.exit(0); }, 500);
  } catch (e) {
    console.error('❌ Exception during token exchange:', e);
    res.statusCode = 500;
    res.end('Exception during token exchange; check terminal.');
    server.close();
    process.exit(1);
  }
});

server.listen(8000, '127.0.0.1');
