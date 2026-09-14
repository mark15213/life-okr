const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

(async () => {
  const requests = [];
  const record = { date: '2026-09-13', cigarettes: 0, exercises: 1, calories: 200, pushup_balance: 100,
    focus_minutes: 90, focus_minutes_ticktick: 0, tasks_completed: 3, tasks_completed_ticktick: 0, tokens_used: 1000 };
  const tasks = ['A', 'B'].map((title, i) => ({ id: `task-${i}`, title: `Project ${title}`, list: 'work', group: 'today', priority: 0, dueLabel: 'Today' }));
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ path: req.url, method: req.method, body: raw });
    res.setHeader('Content-Type', 'application/json');
    const route = req.url.split('?')[0];
    const authed = req.headers.cookie?.includes('desktop-test=ok');
    let data = {};
    if (route === '/api/auth/unlock') { res.setHeader('Set-Cookie', 'desktop-test=ok; HttpOnly; Path=/; SameSite=Lax'); data = { authenticated: true }; }
    else if (route === '/api/auth/session') data = { authenticated: Boolean(authed) };
    else if (req.method !== 'GET' && !authed) res.statusCode = 401;
    else if (route === '/api/records/today') data = { record, cumulativePushupBalance: 100 };
    else if (route === '/api/records') data = { records: [record] };
    else if (route === '/api/tokens' || route === '/api/records/categories') data = { entries: [] };
    else if (route === '/api/ticktick/tasks') data = { tasks };
    else if (route === '/api/vault') data = req.method === 'POST' ? { purchase: { id: 1, ...JSON.parse(raw), purchased_at: '2026-09-13' } } : { purchases: [] };
    else if (route === '/api/records/cigarette') record.cigarettes++;
    res.end(JSON.stringify(data));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const output = path.resolve(__dirname, '../test-output'); fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(output, 'dashboard-'));
  const { emptyState } = await import('../engine.mjs');
  const state = emptyState(); state.settings.server = `http://127.0.0.1:${server.address().port}`;
  state.settings.shortcuts = { switch: 'Control+Alt+Shift+K', previous: 'Control+Alt+Shift+J', pause: 'Control+Alt+Shift+P' };
  const cloudTask = `ticktick:${encodeURIComponent(state.settings.server)}:task-0`;
  state.history = [{ id: 'pending-upload', durationMs: 1800000, elapsedMs: 80000, status: 'ended', cloudServer: state.settings.server,
    segments: [{ taskId: cloudTask, title: 'Project A', startedAt: Date.now() - 100000, endedAt: Date.now() - 20000, durationMs: 80000 }] }];
  fs.writeFileSync(path.join(profile, 'focus-state.json'), JSON.stringify(state));
  const env = { ...process.env, HUSTLE_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let client;
  try {
    client = await electron.launch(process.env.HUSTLE_EXECUTABLE ? { executablePath: process.env.HUSTLE_EXECUTABLE, args: [], env } : { args: [path.resolve(__dirname, '..')], env });
    let dashboard;
    for (let i = 0; i < 100; i++) { dashboard = client.windows().find(w => w.url().includes('/web-dist/')); if (dashboard) break; await new Promise(r => setTimeout(r, 100)); }
    assert.ok(dashboard);
    const errors = []; dashboard.on('pageerror', e => errors.push(e.message));
    await dashboard.bringToFront();
    await dashboard.getByPlaceholder('Code', { exact: true }).fill('test-code');
    await dashboard.getByPlaceholder('Code', { exact: true }).press('Enter');
    await dashboard.getByText('Unlocked', { exact: true }).waitFor();
    await dashboard.getByRole('button', { name: /Smoke/ }).click();
    await dashboard.getByRole('button', { name: /Workout/ }).click();
    await dashboard.getByPlaceholder('Calories?').fill('250');
    await dashboard.getByRole('button', { name: 'Save', exact: true }).click();
    await dashboard.getByRole('button', { name: 'Log Past Data', exact: true }).click();
    await dashboard.getByPlaceholder('Minutes', { exact: true }).fill('15');
    await dashboard.getByRole('button', { name: 'Save Record', exact: true }).click();
    await dashboard.getByRole('button', { name: 'Open tasks', exact: true }).click();
    await dashboard.getByRole('button', { name: 'Start a focus session on Project A', exact: true }).click();
    const first = await dashboard.evaluate(() => window.hustle.get());
    await dashboard.getByRole('button', { name: 'Start a focus session on Project B', exact: true }).click();
    const second = await dashboard.evaluate(() => window.hustle.get());
    assert.equal(first.current.id, second.current.id);
    assert.notEqual(first.selectedId, second.selectedId);
    await dashboard.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.equal((await dashboard.evaluate(() => window.hustle.get())).current.status, 'paused');
    await dashboard.keyboard.press('Escape');
    await dashboard.getByRole('link', { name: '趋势与统计', exact: true }).click();
    await dashboard.waitForFunction(() => location.hash === '#/analytics');
    await dashboard.locator('svg.recharts-surface').first().waitFor();
    await dashboard.waitForTimeout(1000);
    await dashboard.screenshot({ path: path.join(output, 'dashboard-analytics.png') });
    await dashboard.getByRole('link', { name: '今日看板', exact: true }).click();
    await dashboard.getByRole('button', { name: /Vault/ }).click();
    await dashboard.getByPlaceholder('What did you buy?').fill('Test reward');
    await dashboard.getByPlaceholder('Cost', { exact: true }).fill('10');
    await dashboard.getByPlaceholder('Cost', { exact: true }).press('Enter');
    await dashboard.getByText('Test reward', { exact: true }).waitFor();
    for (const route of ['/api/records/cigarette', '/api/records/exercise', '/api/records/backfill', '/api/vault']) assert.ok(requests.some(r => r.path === route && r.method === 'POST'), route);
    assert.equal(requests.filter(r => r.path === '/api/ticktick/focus').length, 1, 'Pending native focus uploads once; browser creates no duplicate');
    assert.deepEqual(errors, []);
    console.log('PASS: full dashboard, shared cookie login, smoke/exercise/backfill/vault writes, analytics and shared desktop timer switching. Mock backend only.');
  } finally { if (client) await client.close(); server.closeAllConnections(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
