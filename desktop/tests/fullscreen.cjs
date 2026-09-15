const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
(async () => {
  if (process.platform !== 'darwin') return console.log('SKIP: macOS fullscreen Spaces test');
  const output = path.resolve(__dirname, '../test-output');
  fs.mkdirSync(output, { recursive: true });
  const fixture = path.join(output, 'fullscreen-check-native');
  await exec('swiftc', [path.join(__dirname, 'fixtures/fullscreen.swift'), '-o', fixture]);
  const profile = fs.mkdtempSync(path.join(output, 'fullscreen-profile-'));
  const env = { ...process.env, HUSTLE_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const client = await electron.launch(process.env.HUSTLE_EXECUTABLE
    ? { executablePath: process.env.HUSTLE_EXECUTABLE, args: [], env }
    : { args: [path.resolve(__dirname, '..')], env });
  try {
    let widget;
    for (let i = 0; i < 100; i++) {
      widget = client.windows().find(p => p.url().includes('view=widget'));
      if (widget) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(widget);
    await widget.evaluate(() => window.hustle.settings({ topmost: true, locked: false }));
    const pid = await client.evaluate(() => process.pid);
    const { stdout } = await exec(fixture, [String(pid)], { timeout: 20000 });
    const reports = stdout.trim().split('\n').map(line => JSON.parse(line));
    const fullscreen = reports.find(r => r.stage === 'FULLSCREEN');
    assert.equal(fullscreen.nativeFullscreen, true, 'Other process really entered native fullscreen');
    assert.ok(fullscreen.windows.some(w => w.layer > 0 && w.bounds.Width === 300 && w.bounds.Height === 98), 'Widget is on screen above another process’s native fullscreen window');
    assert.equal(await client.evaluate(({ app }) => app.dock.isVisible()), true);
    console.log('PASS: widget remains on screen in another app’s native fullscreen Space, with Dock visible.');
  } finally { await client.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
