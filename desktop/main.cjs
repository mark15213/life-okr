const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage,
  Notification, powerMonitor, screen, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const storage = require('./storage.cjs');
const { focusUploads } = require('./focus-upload.cjs');
const { DEFAULT_SERVER, serverURL, validateRequest } = require('./api.cjs');

app.setName('Hustle');
app.setAppUserModelId('com.lifeokr.hustle');
// Isolated profiles make smoke tests independent from the user's real records.
if (process.env.HUSTLE_TEST_PROFILE) app.setPath('userData', path.resolve(process.env.HUSTLE_TEST_PROFILE));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else boot().catch(error => { console.error(error); app.quit(); });

async function boot() {
  const { FocusEngine, emptyState, restoreState, totals, statistics, SHORTCUT_NAMES, TASK_LISTS } = await import('./engine.mjs');
  const WIDGET = { width: 300, height: 98 };
  await app.whenReady();
  const appIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  const file = path.join(app.getPath('userData'), 'focus-state.json');
  const loaded = storage.read(file, restoreState, emptyState);
  loaded.state.settings.server ||= DEFAULT_SERVER;
  const engine = new FocusEngine(loaded.state);
  let notice = loaded.error || (loaded.recovered ? '已恢复上次番茄，当前已暂停。点击继续即可接着专注。' : '');
  let quitting = false, syncing = false, savingFailed = false;
  let shortcutErrors = [];
  let timer, checkpoint, syncTimer, moveTimer;
  let uploadingFocus = false;
  app.on('before-quit', () => {
    quitting = true; clearInterval(timer); clearInterval(checkpoint); clearInterval(syncTimer);
    clearTimeout(moveTimer); engine.pause(); persist();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  const page = path.join(__dirname, 'renderer', 'index.html');
  const trustedURL = pathToFileURL(page).href;
  const dashboardPage = path.join(__dirname, 'web-dist', 'index.html');
  const dashboardURL = pathToFileURL(dashboardPage).href;
  const apiSession = session.fromPartition('persist:hustle-api');
  apiSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  const safe = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
    nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false };
  const widget = new BrowserWindow({ width: WIDGET.width, height: WIDGET.height, frame: false, transparent: true,
    resizable: false, maximizable: false, fullscreenable: false, show: false, skipTaskbar: true,
    // A non-activating macOS panel can join another app's native fullscreen Space.
    // A normal window cannot do that while Hustle remains a foreground Dock app.
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    alwaysOnTop: engine.state.settings.topmost, hasShadow: false, webPreferences: safe });
  const panel = new BrowserWindow({ width: 440, height: 620, minWidth: 400, minHeight: 540,
    title: 'Hustle', icon: appIcon, backgroundColor: '#ffffff', show: false, autoHideMenuBar: true,
    webPreferences: safe });
  const dashboard = new BrowserWindow({ width: 1280, height: 900, minWidth: 800, minHeight: 600, title: 'Hustle', icon: appIcon, show: false, autoHideMenuBar: true, webPreferences: safe });
  panel.setMenuBarVisibility(false);
  for (const win of [widget, panel, dashboard]) {
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
    return { x: Math.round(Math.max(area.x, Math.min(position.x, area.x + area.width - WIDGET.width))),
      y: Math.round(Math.max(area.y, Math.min(position.y, area.y + area.height - WIDGET.height))) };
  }
  const area = screen.getPrimaryDisplay().workArea;
  const stored = engine.state.settings.position;
  const initial = stored && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? stored : { x: area.x + area.width - WIDGET.width - 28, y: area.y + 32 };
  widget.setPosition(...Object.values(clampPosition(initial)));
  applyWidgetSettings();
  if (process.platform === 'darwin') {
    widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // The workspace transition can make the app a background UI element.
    // Restore its Dock presence after configuring the floating window.
    await app.dock.show();
    app.dock.setIcon(appIcon);
  }
  function applyWidgetSettings() {
    // macOS fullscreen apps live in separate Spaces; use a level above their windows.
    widget.setAlwaysOnTop(engine.state.settings.topmost, process.platform === 'darwin' ? 'screen-saver' : 'floating');
    widget.setMovable(!engine.state.settings.locked);
  }
  // After any move the pill snaps to a nearby screen edge and its place is remembered.
  function settle() {
    if (widget.isDestroyed()) return;
    const [x, y] = widget.getPosition();
    const next = clampPosition({ x, y });
    const area = screen.getDisplayNearestPoint(next).workArea;
    if (Math.abs(next.x - area.x) < 20) next.x = area.x;
    if (Math.abs(next.x + WIDGET.width - area.x - area.width) < 20) next.x = area.x + area.width - WIDGET.width;
    if (x !== next.x || y !== next.y) widget.setPosition(next.x, next.y);
    engine.state.settings.position = next; persist();
  }
  widget.on('moved', () => { clearTimeout(moveTimer); moveTimer = setTimeout(settle, 250); });
  // The clock is dragged by hand (a native drag region would swallow its click), so the
  // renderer reports the gesture and the main process moves the window with the cursor.
  let dragOrigin = null;
  function dragWidget(phase) {
    if (engine.state.settings.locked) { dragOrigin = null; return; }
    const cursor = screen.getCursorScreenPoint();
    if (phase === 'start') {
      const [x, y] = widget.getPosition();
      dragOrigin = { cursor, window: { x, y } };
      clearTimeout(moveTimer);
    } else if (phase === 'move' && dragOrigin) {
      const p = clampPosition({ x: dragOrigin.window.x + cursor.x - dragOrigin.cursor.x, y: dragOrigin.window.y + cursor.y - dragOrigin.cursor.y });
      widget.setPosition(p.x, p.y);
    } else if (phase === 'end') {
      dragOrigin = null; clearTimeout(moveTimer); settle();
    }
  }
  function relocate() {
    const [x, y] = widget.getPosition();
    const p = clampPosition({ x, y }); widget.setPosition(p.x, p.y);
  }
  screen.on('display-removed', relocate);
  screen.on('display-metrics-changed', relocate);

  function snapshot() {
    return { ...engine.state, roundTotals: totals(engine.state.current), queue: engine.queue(),
      stats: statistics(engine.state), notice, shortcutErrors, syncing,
      notificationsSupported: Notification.isSupported(), platform: process.platform };
  }
  function broadcast() {
    const value = snapshot();
    for (const win of [widget, panel, dashboard]) if (!win.isDestroyed() && !win.webContents.isLoadingMainFrame()) win.webContents.send('focus:state', value);
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
  function update() { pulse(); if (engine.state.current && !engine.state.current.cloudServer) engine.state.current.cloudServer = engine.state.settings.server; persist(); broadcast(); refreshMenu(); void uploadFocus(); }
  function openDashboard() { dashboard.show(); dashboard.focus(); }
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
      widget.showInactive(); refreshMenu(); void uploadFocus();
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
      previous: () => action(() => engine.previous()), pause: () => action(() => engine.toggle()),
      next: () => action(() => engine.next()), complete: () => void completeTask().catch(error => { notice = error.message; broadcast(); }) };
    for (const [name, callback] of Object.entries(callbacks)) {
      const key = engine.state.settings.shortcuts[name];
      try { if (!globalShortcut.register(key, callback)) shortcutErrors.push(`${key} 已被占用，请在设置中改绑`); }
      catch { shortcutErrors.push(`${key} 无法注册，请在设置中改绑`); }
    }
  }

  // macOS uses the alpha mask and selects the color for light/dark menu bars.
  const trayImage = process.platform === 'darwin'
    ? nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'))
    : appIcon.resize({ width: 24, height: 24 });
  if (process.platform === 'darwin') trayImage.setTemplateImage(true);
  const tray = new Tray(trayImage);
  tray.setToolTip('Hustle · 任务与番茄');
  function refreshMenu() {
    const settings = engine.state.settings;
    const menu = Menu.buildFromTemplate([
      { label: '打开完整看板', click: openDashboard },
      { label: '打开任务切换器', click: () => openPanel() },
      { label: widget.isVisible() ? '隐藏浮标' : '显示浮标', click: () => { if (widget.isVisible()) widget.hide(); else widget.showInactive(); refreshMenu(); } },
      { label: engine.state.current?.status === 'running' ? '暂停番茄' : '开始 / 继续', click: () => action(() => engine.toggle()) },
      { label: '下一个任务', click: () => action(() => engine.next()) },
      { label: '完成当前任务', click: () => void completeTask().catch(error => { notice = error.message; broadcast(); }) },
      { label: '始终置顶', type: 'checkbox', checked: settings.topmost, click: item => action(() => { settings.topmost = item.checked; applyWidgetSettings(); }) },
      { label: '锁定位置', type: 'checkbox', checked: settings.locked, click: item => action(() => { settings.locked = item.checked; widget.setMovable(!item.checked); }) },
      { label: '历史记录', click: () => openPanel('history') },
      { label: '设置', click: () => openPanel('settings') },
      { type: 'separator' }, { label: '退出 Hustle（暂停并保存）', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
    return menu;
  }
  tray.on('click', openDashboard);
  widget.webContents.on('context-menu', () => refreshMenu().popup({ window: widget }));

  function validSender(event) {
    const expected = event.sender === dashboard.webContents ? dashboardURL : trustedURL;
    return [widget.webContents, panel.webContents, dashboard.webContents].includes(event.sender) && event.senderFrame === event.sender.mainFrame && event.senderFrame.url.split(/[?#]/)[0] === expected;
  }
  const handle = (channel, handler) => ipcMain.handle(channel, async (event, payload) => {
    if (!validSender(event)) throw new Error('Untrusted sender');
    try { return { ok: true, value: await handler(payload) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  handle('focus:get', () => snapshot());
  handle('focus:open', () => openPanel());
  handle('focus:dashboard', openDashboard);
  handle('dashboard:request', async input => {
    const req = validateRequest(input);
    const server = serverURL(engine.state.settings.server);
    const response = await apiSession.fetch(server + req.path, {
      method: req.method, body: req.body, headers: { 'Content-Type': 'application/json' },
      credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    const body = await response.text();
    if (Buffer.byteLength(body) > 10000000) throw new Error('响应过大');
    if (response.ok && req.path.split('?')[0] === '/api/ticktick/tasks' && req.method === 'GET') {
      pulse(); engine.syncTasks(JSON.parse(body).tasks, server); update();
    }
    if (response.ok && req.method !== 'GET' && req.path.startsWith('/api/ticktick/tasks')) await refresh();
    return { status: response.status, body };
  });
  handle('focus:task', async id => {
    if (typeof id !== 'string') throw new Error('任务无效');
    let task = engine.state.tasks.find(t => t.externalId === id && !t.archived);
    if (!task) { await refresh(); task = engine.state.tasks.find(t => t.externalId === id && !t.archived); }
    if (!task) throw new Error('任务已移除，请刷新后重试');
    pulse(); engine.select(task.id); if (!engine.state.current) engine.start();
    update(); return snapshot();
  });
  handle('focus:hide', () => panel.hide());
  handle('focus:drag', phase => { if (['start', 'move', 'end'].includes(phase)) dragWidget(phase); });
  // A TickTick task is closed on the server first; only then does it leave the local queue,
  // so a failed request never makes a task vanish here while it stays open in the cloud.
  async function completeTask(id = engine.state.selectedId) {
    pulse();
    const task = engine.task(id);
    if (!task) throw new Error('先选择一个任务');
    if (task.source === 'ticktick') {
      if (!engine.state.settings.server) throw new Error('请先在设置中连接看板');
      await request(serverURL(engine.state.settings.server), `/api/ticktick/tasks/${encodeURIComponent(task.externalId)}/complete`, { method: 'POST' });
    }
    pulse(); engine.complete(id);
    notice = `已完成「${task.title.slice(0, 40)}」${engine.task() ? ` · 切到「${engine.task().title.slice(0, 40)}」` : ''}`;
    update();
    if (task.source === 'ticktick') dashboard.webContents.send('dashboard:refresh');
    return snapshot();
  }
  // A new task goes into the connected dashboard (TickTick) so it lands in the database like
  // everything else; only without a connection does it stay a local, this-machine-only task.
  async function addTask(title, list = 'work') {
    title = typeof title === 'string' ? title.trim().slice(0, 200) : '';
    if (!title) throw new Error('请输入任务名称');
    if (!TASK_LISTS.includes(list)) throw new Error('请选择任务分类');
    // The default server address is filled in before any login, so a past sync is the real sign of a connection.
    if (!engine.state.settings.server || !engine.state.syncedAt) { engine.addTask(title, list); return; }
    if (syncing) throw new Error('正在同步，请稍候');
    const server = serverURL(engine.state.settings.server);
    syncing = true; broadcast();
    try {
      const created = await request(server, '/api/ticktick/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, list }) });
      try { await sync(server); } catch { /* the task was created; a failed re-fetch only delays the list */ }
      const id = `ticktick:${encodeURIComponent(server)}:${created.task.id}`;
      // A freshly added task is what you meant to do next, so it goes to the front of the queue.
      if (engine.state.tasks.some(t => t.id === id)) engine.move(id, 0);
      else engine.state.tasks.unshift({ id, externalId: created.task.id, title: created.task.title.slice(0, 500), list: created.task.list ?? list, source: 'ticktick' });
      dashboard.webContents.send('dashboard:refresh');
    } finally { syncing = false; }
  }
  handle('focus:command', async ({ type, value } = {}) => {
    pulse();
    switch (type) {
      case 'select': engine.select(value); break;
      case 'start': engine.start(); break;
      case 'toggle': engine.toggle(); break;
      case 'finish': engine.finish(); break;
      case 'previous': engine.previous(); break;
      case 'next': engine.next(); break;
      case 'move': engine.move(value?.id, value?.index); break;
      case 'add': await addTask(typeof value === 'string' ? value : value?.title, typeof value === 'string' ? undefined : value?.list); break;
      case 'complete': return completeTask(typeof value === 'string' ? value : undefined);
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
        if (!SHORTCUT_NAMES.includes(name) || typeof value !== 'string' || !/^(Control|Command|Alt|Shift)(\+(Control|Command|Alt|Shift))*\+[A-Z0-9]$/.test(value)) throw new Error('快捷键格式示例：Control+Alt+K');
      }
      const next = { ...s.shortcuts, ...changes.shortcuts };
      if (new Set(Object.values(next)).size !== SHORTCUT_NAMES.length) throw new Error('快捷键不能重复');
      s.shortcuts = next; registerShortcuts();
    }
    applyWidgetSettings(); update(); return snapshot();
  });

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
    // A routine sync succeeding is the expected case, so it no longer announces itself.
    if (removed) notice = '当前任务已完成或移除，番茄已暂停。请选择任务后继续。';
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
      engine.state.settings.server = server;
      persist();
      dashboard.webContents.send('dashboard:refresh');
      await sync(server);
      const moved = await migrateLocalTasks(server);
      if (moved) notice = `已把 ${moved} 个本机任务写入看板。`;
      update(); return snapshot();
    } finally { syncing = false; broadcast(); }
  });
  async function uploadFocus() {
    if (uploadingFocus || savingFailed || quitting) return;
    uploadingFocus = true;
    try {
      let changed = false;
      for (const round of engine.state.history) {
        if (!round.cloudServer || round.cloudServer !== engine.state.settings.server || round.cloudUploaded) continue;
        const records = focusUploads(round);
        for (const record of records) {
          if (round.cloudSent?.includes(record.sessionId)) continue;
          await request(serverURL(round.cloudServer), '/api/ticktick/focus', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record),
          });
          (round.cloudSent ||= []).push(record.sessionId); engine.state.focusNeedsSync = true; persist(); changed = true;
        }
        round.cloudUploaded = true; persist();
      }
      if (changed || engine.state.focusNeedsSync) {
        await request(serverURL(engine.state.settings.server), '/api/ticktick/sync', { method: 'POST' });
        engine.state.focusNeedsSync = false; persist();
        notice = '专注记录已同步到看板。'; dashboard.webContents.send('dashboard:refresh'); broadcast();
      }
    } catch {
      notice = '专注已保存在本机，云端同步未完成；连接恢复后会自动重试。'; broadcast();
    } finally { uploadingFocus = false; }
  }
  // Tasks created before the panel wrote to the dashboard exist only in this machine's file.
  // Once connected, each one is created in TickTick and swapped for its cloud twin in place:
  // same queue slot, same selection, and its focus time stays attached under the new id.
  async function migrateLocalTasks(server) {
    const locals = engine.state.tasks.filter(t => t.source === 'local');
    if (!locals.length) return 0;
    let moved = 0;
    for (const task of locals) {
      const list = TASK_LISTS.includes(task.list) ? task.list : 'work';
      const created = await request(server, '/api/ticktick/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: task.title, list }) });
      const id = `ticktick:${encodeURIComponent(server)}:${created.task.id}`;
      const twin = { id, externalId: created.task.id, title: created.task.title.slice(0, 500), list: created.task.list ?? list, source: 'ticktick' };
      engine.state.tasks = engine.state.tasks.filter(t => t.id !== id).map(t => t.id === task.id ? twin : t);
      if (engine.state.selectedId === task.id) engine.state.selectedId = id;
      engine.state.recent = engine.state.recent.map(t => t === task.id ? id : t);
      for (const round of [...engine.state.history, ...(engine.state.current ? [engine.state.current] : [])]) {
        for (const segment of round.segments) if (segment.taskId === task.id) segment.taskId = id;
      }
      moved += 1; persist();
    }
    return moved;
  }
  async function refresh() {
    if (syncing || !engine.state.settings.server) return;
    syncing = true; broadcast();
    try {
      const server = serverURL(engine.state.settings.server);
      await sync(server);
      const moved = await migrateLocalTasks(server);
      if (moved) { notice = `已把 ${moved} 个本机任务写入看板。`; dashboard.webContents.send('dashboard:refresh'); }
      update();
    }
    catch (error) { notice = error.message; }
    finally { syncing = false; broadcast(); }
  }
  handle('focus:sync', async () => { await refresh(); return snapshot(); });
  handle('focus:data-folder', () => shell.openPath(app.getPath('userData')));

  registerShortcuts();
  await Promise.all([widget.loadFile(page, { query: { view: 'widget' } }), panel.loadFile(page), dashboard.loadFile(dashboardPage)]);
  widget.showInactive();
  openDashboard();
  if (loaded.error || shortcutErrors.length) openPanel('settings');
  refreshMenu(); broadcast();
  // A dashboard that has synced before is refreshed right away, which also uploads any tasks still local.
  if (engine.state.syncedAt) void refresh();
  timer = setInterval(() => { pulse(); broadcast(); }, 250);
  checkpoint = setInterval(() => { if (engine.state.current?.status === 'running') { pulse(); persist(); } }, 2000);
  syncTimer = setInterval(() => { void refresh(); void uploadFocus(); }, 5 * 60000);
  const pauseForSystem = () => { pulse(); engine.pause(); notice = '系统已锁定或休眠，番茄已暂停。回来后请点击继续。'; update(); };
  powerMonitor.on('suspend', pauseForSystem);
  powerMonitor.on('lock-screen', pauseForSystem);
  powerMonitor.on('shutdown', () => { engine.pause(); persist(); });
  app.on('second-instance', openDashboard);
  app.on('activate', openDashboard);
  app.on('window-all-closed', () => {});
}
