const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function waitState(page, predicate) {
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    const state = await page.evaluate(()=>window.hustle.get());
    if (predicate(state)) return state;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error(`State wait timed out: ${JSON.stringify(await page.evaluate(()=>window.hustle.get()))}`);
}

(async () => {
  const output = path.resolve(__dirname, '../test-output');
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(output, 'profile-'));
  let client;
  const requests = [];
  const remote = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('Content-Type','application/json');
    if (req.url === '/api/auth/unlock') {
      res.setHeader('Set-Cookie','life-okr-session=test-session; HttpOnly; SameSite=Lax; Path=/');
      res.end(JSON.stringify({authenticated:true}));
    } else if (req.url === '/api/ticktick/tasks' && req.headers.cookie?.includes('life-okr-session=test-session')) {
      if (req.method === 'POST') {
        // Tasks the panel created offline are written to the dashboard once it connects.
        let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
          const {title,list} = JSON.parse(body);
          const task = {id:`remote-${remote.length+1}`,title,list};
          remote.push(task); res.statusCode=201; res.end(JSON.stringify({task}));
        });
        return;
      }
      res.end(JSON.stringify({tasks:[{id:'remote-a',title:'Synced task',list:'study'},...remote]}));
    } else { res.statusCode=401; res.end('{}'); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const { emptyState } = await import('../engine.mjs');
  const initial = emptyState();
  initial.settings.server = `http://127.0.0.1:${server.address().port}`;
  initial.settings.shortcuts = { switch: 'Control+Alt+Shift+K', previous: 'Control+Alt+Shift+J', pause: 'Control+Alt+Shift+P', next: 'Control+Alt+Shift+N', complete: 'Control+Alt+Shift+D' };
  fs.writeFileSync(path.join(profile, 'focus-state.json'), JSON.stringify(initial));
  const env = {...process.env,HUSTLE_TEST_PROFILE:profile};
  const launchOptions = process.env.HUSTLE_EXECUTABLE
    ? { executablePath: process.env.HUSTLE_EXECUTABLE, args: [], env }
    : { args: [path.resolve(__dirname,'..')], env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    client = await electron.launch(launchOptions);
    let panel, widget;
    for (let i=0;i<40;i++) {
      panel = client.windows().find(p=>p.url().includes('/renderer/index.html')&&!p.url().includes('view=widget'));
      widget = client.windows().find(p=>p.url().includes('view=widget'));
      if (panel && widget) break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(panel && widget,'Both native windows created');
    if (process.platform === 'darwin') {
      assert.equal(await client.evaluate(({app}) => app.dock.isVisible()), true, 'Dock icon remains visible after workspace setup');
      assert.equal(await client.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=widget')).isVisibleOnAllWorkspaces()), true, 'Floating window remains visible across workspaces');
    }
    // Pin must remain draggable, including when clearing the old pin's position lock.
    await widget.evaluate(() => window.hustle.settings({ topmost: false, locked: true }));
    await widget.waitForFunction(() => document.querySelector('#widget-pin').getAttribute('aria-pressed') === 'false');
    await widget.locator('#widget-pin').evaluate(button => button.click());
    await waitState(widget, s => s.settings.topmost && !s.settings.locked);
    assert.deepEqual(await client.evaluate(({BrowserWindow}) => {
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=widget'));
      return [w.isAlwaysOnTop(), w.isMovable()];
    }), [true, true], 'Pinned widget stays on top and remains draggable');
    await widget.locator('#widget-pin').evaluate(button => button.click());
    await waitState(widget, s => !s.settings.topmost && !s.settings.locked);
    assert.equal(await client.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=widget')).isAlwaysOnTop()), false);
    const errors=[];
    panel.on('pageerror',e=>errors.push(e.message));
    await panel.waitForSelector('#new-task');
    for (const title of ['Project A','Project B','Project C']) {
      await panel.fill('#new-task',title); await panel.click('#add-form button[type=submit]');
      await panel.waitForFunction(t=>Array.from(document.querySelectorAll('.task-title')).some(n=>n.textContent===t),title);
    }
    const tasks = await panel.evaluate(async()=> (await window.hustle.get()).tasks);
    const a = tasks.find(t=>t.title==='Project A').id;
    const b = tasks.find(t=>t.title==='Project B').id;
    await panel.evaluate(id=>window.hustle.command('select',id),a);
    await panel.click('#toggle');
    await waitState(panel,s=>s.current?.elapsedMs>500);
    const original = await panel.evaluate(async()=> (await window.hustle.get()).current.id);
    await panel.evaluate(id=>window.hustle.command('select',id),b);
    await waitState(panel,s=>s.roundTotals.length===2);
    await panel.evaluate(()=>window.hustle.command('toggle'));
    const paused = await panel.evaluate(()=>window.hustle.get());
    assert.equal(paused.current.id,original);
    assert.equal(paused.current.status,'paused');
    assert.equal(paused.roundTotals.length,2);
    assert.equal(paused.roundTotals.reduce((n,s)=>n+s.durationMs,0),paused.current.elapsedMs);
    await panel.evaluate(id=>window.hustle.command('select',id),a);
    assert.equal((await panel.evaluate(()=>window.hustle.get())).current.status,'paused');
    const registered = await client.evaluate(({globalShortcut})=>['Control+Alt+Shift+K','Control+Alt+Shift+J','Control+Alt+Shift+P'].map(k=>globalShortcut.isRegistered(k)));
    assert.deepEqual(registered,[true,true,true]);
    // Queue order is C, B, A; the arrow keys walk it and Enter switches to the highlighted row.
    await panel.evaluate(() => document.activeElement?.blur());
    await panel.press('body','ArrowDown');
    await panel.press('body','Enter');
    assert.equal((await panel.evaluate(()=>window.hustle.get())).selectedId,b);
    await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/renderer/index.html')&&!w.webContents.getURL().includes('view=widget')).show());
    await panel.evaluate(()=>window.hustle.command('finish'));
    await panel.click('[data-view=settings]');
    await panel.fill('#server',`http://127.0.0.1:${server.address().port}`);
    await panel.fill('#code','test-code'); await panel.click('#connect');
    await waitState(panel,s=>s.tasks.some(t=>t.title==='Synced task'));
    // Connecting uploads the three offline tasks, which now carry dashboard identities.
    await waitState(panel,s=>s.tasks.every(t=>t.source==='ticktick'));
    assert.equal(remote.length,3);
    const uploaded = await panel.evaluate(async()=> (await window.hustle.get()).tasks);
    const a2 = uploaded.find(t=>t.title==='Project A').id;
    assert.notEqual(a2,a);
    assert.equal(await panel.inputValue('#code'),'');
    assert.ok(requests.includes('/api/ticktick/tasks'));
    const unsafe = await panel.evaluate(async()=> {
      try { await window.hustle.connect('http://example.com','code'); return 'accepted'; }
      catch(e){ return e.message; }
    });
    assert.notEqual(unsafe,'accepted');
    const round = (await panel.evaluate(()=>window.hustle.get())).history[0];
    assert.equal(round.status,'ended');
    await panel.evaluate(id=>window.hustle.command('select',id),a2);
    await panel.evaluate(()=>window.hustle.command('start'));
    // Exercise native power monitor events without locking the user's computer.
    await client.evaluate(({powerMonitor})=>powerMonitor.emit('lock-screen'));
    assert.equal((await panel.evaluate(()=>window.hustle.get())).current.status,'paused');
    const controlBounds = await panel.locator('#toggle').boundingBox();
    const viewportHeight = await panel.evaluate(()=>window.innerHeight);
    assert.ok(controlBounds.y+controlBounds.height<=viewportHeight,'Timer controls stay visible');
    await panel.bringToFront();
    await panel.screenshot({path:path.join(output,'task-panel.png')});
    await widget.screenshot({path:path.join(output,'widget.png'),omitBackground:true});
    await client.close(); client=null;
    client = await electron.launch(launchOptions);
    const reopened = await client.firstWindow();
    await reopened.waitForLoadState('load');
    await reopened.waitForFunction(()=>Boolean(window.hustle));
    const restored = await reopened.evaluate(()=>window.hustle.get());
    if (process.platform === 'darwin') {
      assert.equal(await client.evaluate(({app}) => app.dock.isVisible()), true, 'Dock icon remains visible after restart');
    }
    assert.equal(restored.current.status,'paused');
    assert.equal(restored.history.length,1); assert.ok(restored.tasks.some(t=>t.title==='Synced task'));
    assert.deepEqual(errors,[]);
    console.log('PASS: native windows, keyboard selection, global shortcut registration, shared timer, pause, local history, HTTP-only auth cookie sync, offline cache, sleep event and restart recovery.');
    console.log(`Screenshots: ${output}`);
  } finally {
    if(client) await client.close();
    server.closeAllConnections();
    server.close();
    // Profiles are left in ignored test-output for inspection; real user data is untouched.
  }
})().catch(e=>{ console.error(e); process.exitCode=1; });
