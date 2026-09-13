const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage,
  Notification, powerMonitor, screen, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const storage = require('./storage.cjs');

app.setName('Hustle');
app.setAppUserModelId('com.lifeokr.hustle');
// Isolated profiles make smoke tests independent from the user's real records.
if (process.env.HUSTLE_TEST_PROFILE) app.setPath('userData', path.resolve(process.env.HUSTLE_TEST_PROFILE));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else boot().catch(error => { console.error(error); app.quit(); });

async function boot() {
  const { FocusEngine, emptyState, restoreState, totals, statistics } = await import('./engine.mjs');
  await app.whenReady();
  const file = path.join(app.getPath('userData'), 'focus-state.json');
  const loaded = storage.read(file, restoreState, emptyState);
  const engine = new FocusEngine(loaded.state);
  let notice = loaded.error || (loaded.recovered ? '已恢复上次番茄，当前已暂停。点击继续即可接着专注。' : '');
  let quitting = false, syncing = false, savingFailed = false;
  let shortcutErrors = [];
  let timer, checkpoint, syncTimer, moveTimer;
  app.on('before-quit', () => {
    quitting = true; clearInterval(timer); clearInterval(checkpoint); clearInterval(syncTimer);
    clearTimeout(moveTimer); engine.pause(); persist();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  const page = path.join(__dirname, 'renderer', 'index.html');
  const trustedURL = pathToFileURL(page).href;
  const apiSession = session.fromPartition('persist:hustle-api');
  apiSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  const safe = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
    nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false };
  const widget = new BrowserWindow({ width: 272, height: 64, frame: false, transparent: true,
    resizable: false, maximizable: false, fullscreenable: false, show: false, skipTaskbar: true,
    alwaysOnTop: engine.state.settings.topmost, hasShadow: false, webPreferences: safe });
  const panel = new BrowserWindow({ width: 490, height: 740, minWidth: 420, minHeight: 620,
    title: 'Hustle · Focus', backgroundColor: '#ffffff', show: false, autoHideMenuBar: true,
    webPreferences: safe });
  panel.setMenuBarVisibility(false);
  for (const win of [widget, panel]) {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    win.webContents.on('render-process-gone', () => {
      engine.pause(); persist(); notice = '界面意外退出，番茄已暂停。';
      if (!quitting) win.reload();
    });
    win.on('close', e => {
      if (!quitting) {
        e.preventDefault(); win.hide();
        if (win === panel && !engine.state.settings.closeHintSeen) {
          engine.state.settings.closeHintSeen = true;
          notice = '主窗口已收起，计时继续。可从浮标或托盘重新打开。';
          widget.showInactive(); persist();
        }
      }
    });
  }

  function clampPosition(position) {
    const area = screen.getDisplayNearestPoint({ x: Math.round(position.x), y: Math.round(position.y) }).workArea;
    return { x: Math.round(Math.max(area.x, Math.min(position.x, area.x + area.width - 272))),
      y: Math.round(Math.max(area.y, Math.min(position.y, area.y + area.height - 64))) };
  }
  const area = screen.getPrimaryDisplay().workArea;
  const stored = engine.state.settings.position;
  const initial = stored && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? stored : { x: area.x + area.width - 300, y: area.y + 32 };
  widget.setPosition(...Object.values(clampPosition(initial)));
  widget.setMovable(!engine.state.settings.locked);
  if (process.platform === 'darwin') widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widget.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (widget.isDestroyed()) return;
      const [x, y] = widget.getPosition();
      const next = clampPosition({ x, y });
      const area = screen.getDisplayNearestPoint(next).workArea;
      if (Math.abs(next.x - area.x) < 20) next.x = area.x;
      if (Math.abs(next.x + 272 - area.x - area.width) < 20) next.x = area.x + area.width - 272;
      if (x !== next.x || y !== next.y) widget.setPosition(next.x, next.y);
      engine.state.settings.position = next; persist();
    }, 250);
  });
  function relocate() {
    const [x, y] = widget.getPosition();
    const p = clampPosition({ x, y }); widget.setPosition(p.x, p.y);
  }
  screen.on('display-removed', relocate);
  screen.on('display-metrics-changed', relocate);

  function snapshot() {
    return { ...engine.state, roundTotals: totals(engine.state.current),
      stats: statistics(engine.state), notice, shortcutErrors, syncing,
      notificationsSupported: Notification.isSupported(), platform: process.platform };
  }
  function broadcast() {
    const value = snapshot();
    for (const win of [widget, panel]) if (!win.isDestroyed() && !win.webContents.isLoadingMainFrame()) win.webContents.send('focus:state', value);
    const round = engine.state.current;
    tray?.setToolTip(`Hustle${round ? ` · ${Math.ceil((round.durationMs - round.elapsedMs) / 60000)} 分钟 · ${engine.task()?.title ?? '已暂停'}` : ' · 选择任务开始'}`.slice(0, 120));
  }
  function persist() {
    try { storage.save(file, engine.state); savingFailed = false; }
    catch {
      if (!savingFailed) engine.pause();
      savingFailed = true;
      notice = '本地保存失败，计时已暂停。请检查磁盘空间或目录权限后重试。';
    }
  }
  function update() { pulse(); persist(); broadcast(); refreshMenu(); }
  function openPanel(view = 'tasks') {
    panel.show(); panel.focus(); panel.webContents.send('focus:view', view);
  }
  function pulse() {
    engine.tick();
    const finished = engine.completed;
    engine.completed = null;
    if (finished) {
      notice = `本轮已完成 · 实际专注 ${Math.round(finished.elapsedMs / 60000)} 分钟`;
      // Persist the completed state before notifying: restoring never repeats the notification.
      persist();
      if (Notification.isSupported()) {
        const notification = new Notification({ title: 'Hustle · 本轮已完成',
          body: `${Math.round(finished.elapsedMs / 60000)} 分钟 · ${totals(finished).length} 个任务，点击查看时间分配`,
          silent: !engine.state.settings.sound });
        notification.on('click', () => openPanel('history'));
        notification.on('failed', () => { notice = '本轮已完成。系统通知未送达，可在系统设置中检查通知权限。'; broadcast(); });
        notification.show();
      }
      widget.showInactive(); refreshMenu();
    }
    return finished;
  }
  function action(fn) {
    try { pulse(); fn(); update(); }
    catch (error) { notice = error.message; broadcast(); }
  }
  function registerShortcuts() {
    globalShortcut.unregisterAll(); shortcutErrors = [];
    const callbacks = { switch: () => panel.isVisible() && panel.isFocused() ? panel.hide() : openPanel(),
      previous: () => action(() => engine.previous()), pause: () => action(() => engine.toggle()) };
    for (const [name, callback] of Object.entries(callbacks)) {
      const key = engine.state.settings.shortcuts[name];
      try { if (!globalShortcut.register(key, callback)) shortcutErrors.push(`${key} 已被占用，请在设置中改绑`); }
      catch { shortcutErrors.push(`${key} 无法注册，请在设置中改绑`); }
    }
  }

  // Native image avoids external assets or network dependencies for the tray.
  const pixels = Buffer.alloc(24 * 24 * 4);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const i = (y * 24 + x) * 4;
    const ring = Math.abs(Math.hypot(x - 11.5, y - 11.5) - 8.5) < 1.5;
    const hand = (x >= 11 && x <= 12 && y >= 5 && y <= 12) || (y >= 11 && y <= 12 && x >= 11 && x <= 17);
    pixels[i] = pixels[i+1] = pixels[i+2] = 100;
    pixels[i+3] = ring || hand ? 255 : 0;
  }
  const trayImage = nativeImage.createFromBitmap(pixels, { width: 24, height: 24 });
  if (process.platform === 'darwin') trayImage.setTemplateImage(true);
  const tray = new Tray(trayImage);
  function refreshMenu() {
    const settings = engine.state.settings;
    const menu = Menu.buildFromTemplate([
      { label: '打开任务切换器', click: () => openPanel() },
      { label: widget.isVisible() ? '隐藏浮标' : '显示浮标', click: () => { widget.isVisible() ? widget.hide() : widget.showInactive(); refreshMenu(); } },
      { label: engine.state.current?.status === 'running' ? '暂停番茄' : '开始 / 继续', click: () => action(() => engine.toggle()) },
      { label: '始终置顶', type: 'checkbox', checked: settings.topmost, click: item => action(() => { settings.topmost = item.checked; widget.setAlwaysOnTop(item.checked); }) },
      { label: '锁定位置', type: 'checkbox', checked: settings.locked, click: item => action(() => { settings.locked = item.checked; widget.setMovable(!item.checked); }) },
      { label: '历史记录', click: () => openPanel('history') },
      { label: '设置', click: () => openPanel('settings') },
      { type: 'separator' }, { label: '退出 Hustle（暂停并保存）', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
    return menu;
  }
  tray.on('click', () => openPanel());
  widget.webContents.on('context-menu', () => refreshMenu().popup({ window: widget }));

  function validSender(event) {
    return [widget.webContents, panel.webContents].includes(event.sender) && event.senderFrame === event.sender.mainFrame && event.senderFrame.url.split('?')[0] === trustedURL;
  }
  const handle = (channel, handler) => ipcMain.handle(channel, async (event, payload) => {
    if (!validSender(event)) throw new Error('Untrusted sender');
    try { return { ok: true, value: await handler(payload) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  handle('focus:get', () => snapshot());
  handle('focus:open', () => openPanel());
  handle('focus:hide', () => panel.hide());
  handle('focus:command', ({ type, value } = {}) => {
    pulse();
    switch (type) {
      case 'select': engine.select(value); break;
      case 'start': engine.start(); break;
      case 'toggle': engine.toggle(); break;
      case 'finish': engine.finish(); break;
      case 'previous': engine.previous(); break;
      case 'add': engine.addTask(value); break;
      case 'dismiss': notice = ''; break;
      default: throw new Error('未知操作');
    }
    if (['start','toggle'].includes(type) && engine.state.current?.status === 'running') notice = '';
    update(); return snapshot();
  });
  handle('focus:settings', changes => {
    if (!changes || typeof changes !== 'object') throw new Error('设置无效');
    const s = engine.state.settings;
    if ('minutes' in changes) {
      if (![15,25,30,45,60].includes(changes.minutes)) throw new Error('时长无效');
      s.minutes = changes.minutes;
    }
    for (const key of ['sound', 'topmost', 'locked']) if (typeof changes[key] === 'boolean') s[key] = changes[key];
    if (changes.shortcuts) {
      const entries = Object.entries(changes.shortcuts);
      for (const [name, value] of entries) {
        if (!['switch','previous','pause'].includes(name) || typeof value !== 'string' || !/^(Control|Command|Alt|Shift)(\+(Control|Command|Alt|Shift))*\+[A-Z0-9]$/.test(value)) throw new Error('快捷键格式示例：Control+Alt+K');
      }
      const next = { ...s.shortcuts, ...changes.shortcuts };
      if (new Set(Object.values(next)).size !== 3) throw new Error('三个快捷键不能相同');
      s.shortcuts = next; registerShortcuts();
    }
    widget.setAlwaysOnTop(s.topmost); widget.setMovable(!s.locked); update(); return snapshot();
  });

  function serverURL(value) {
    const u = new URL(value);
    if (u.username || u.password || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) throw new Error('请使用 HTTPS 看板地址（本机可用 http://localhost）');
    if (u.pathname !== '/' || u.search || u.hash) throw new Error('请输入看板根地址，不要包含路径');
    return u.origin;
  }
  async function request(server, route, options = {}) {
    const response = await apiSession.fetch(`${server}${route}`, { ...options, credentials: 'include',
      redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (response.status === 401) throw new Error('连接已过期或解锁码不正确，请在设置中重新连接');
    if (!response.ok) throw new Error(`看板请求失败（${response.status}），缓存任务仍可使用`);
    return response.json();
  }
  async function sync(server) {
    const body = await request(server, '/api/ticktick/tasks');
    pulse();
    const removed = engine.syncTasks(body.tasks, server);
    notice = removed ? '当前任务已完成或移除，番茄已暂停。请选择任务后继续。' : '任务已同步，可离线使用。';
  }
  handle('focus:connect', async ({ server, code } = {}) => {
    if (syncing) throw new Error('正在同步，请稍候');
    server = serverURL(server);
    if (typeof code !== 'string' || !code || code.length > 500) throw new Error('请输入解锁码');
    // Different server accounts must not silently remap cached external task identities.
    if (engine.state.settings.server && server !== engine.state.settings.server && engine.state.current) throw new Error('请先结束当前番茄，再切换看板地址');
    syncing = true; broadcast();
    try {
      await request(server, '/api/auth/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      await sync(server);
      engine.state.settings.server = server;
      update(); return snapshot();
    } finally { syncing = false; broadcast(); }
  });
  async function refresh() {
    if (syncing || !engine.state.settings.server) return;
    syncing = true; broadcast();
    try { await sync(serverURL(engine.state.settings.server)); update(); }
    catch (error) { notice = error.message; }
    finally { syncing = false; broadcast(); }
  }
  handle('focus:sync', async () => { await refresh(); return snapshot(); });
  handle('focus:data-folder', () => shell.openPath(app.getPath('userData')));

  registerShortcuts();
  await Promise.all([widget.loadFile(page, { query: { view: 'widget' } }), panel.loadFile(page)]);
  widget.showInactive();
  if (!engine.state.tasks.length || loaded.error || shortcutErrors.length) openPanel(engine.state.tasks.length ? 'settings' : 'tasks');
  refreshMenu(); broadcast();
  timer = setInterval(() => { pulse(); broadcast(); }, 250);
  checkpoint = setInterval(() => { if (engine.state.current?.status === 'running') { pulse(); persist(); } }, 2000);
  syncTimer = setInterval(refresh, 5 * 60000);
  const pauseForSystem = () => { pulse(); engine.pause(); notice = '系统已锁定或休眠，番茄已暂停。回来后请点击继续。'; update(); };
  powerMonitor.on('suspend', pauseForSystem);
  powerMonitor.on('lock-screen', pauseForSystem);
  powerMonitor.on('shutdown', () => { engine.pause(); persist(); });
  app.on('second-instance', () => openPanel());
  app.on('activate', () => openPanel());
  app.on('window-all-closed', () => {});
}
