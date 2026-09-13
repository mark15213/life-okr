/* The renderer only receives snapshots and sends narrowly scoped commands. */
const $ = id => document.getElementById(id);
const api = window.hustle;
const isWidget = new URLSearchParams(location.search).get('view') === 'widget';
const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
let state, view = 'tasks', highlight = 0, filtered = [], taskSignature = '', historySignature = '';
let errorTimeout, settingsLoaded = false;
const clock = (ms, ceil = false) => {
  const seconds = Math.max(0, (ceil ? Math.ceil : Math.floor)(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
};
const category = list => ['work','study','hustle','life'].includes(list) ? list : 'inbox';
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function fail(error) {
  if (isWidget) { void api.open(); return; }
  $('error').textContent = error.message || String(error);
  $('error').hidden = false;
  clearTimeout(errorTimeout); errorTimeout = setTimeout(() => { $('error').hidden = true; }, 6000);
}
async function run(fn) { try { return await fn(); } catch (e) { fail(e); return null; } }
async function command(type, value) {
  const next = await run(() => api.command(type, value));
  if (next) render(next);
  return next;
}
function setView(next) {
  if (isWidget) return;
  view = ['tasks','history','settings'].includes(next) ? next : 'tasks';
  document.querySelectorAll('.view').forEach(node => { node.hidden = node.id !== `${view}-view`; });
  document.querySelectorAll('nav button').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  if (view === 'settings') fillSettings();
  if (view === 'tasks') { $('search').focus(); $('search').select(); }
  if (state) render(state);
}
function fillSettings() {
  if (!state) return;
  const s = state.settings;
  $('server').value = s.server || '';
  $('minutes').value = s.minutes;
  for (const key of ['topmost','locked','sound']) $(key).checked = s[key];
  for (const key of ['switch','previous','pause']) $(`shortcut-${key}`).value = s.shortcuts[key];
  $('shortcut-help').textContent = state.platform === 'darwin' ? 'Mac：Control = ⌃，Alt = Option（⌥），不是 Command。可在其他应用中使用。' : '可在其他应用中使用。格式示例：Control+Alt+K。';
  settingsLoaded = true;
}
function render(next) {
  state = next;
  const round = state.current;
  const task = state.tasks.find(t => t.id === state.selectedId);
  const running = round?.status === 'running';
  const completed = !round && state.history[0]?.status === 'completed';
  const remaining = round ? round.durationMs - round.elapsedMs : state.settings.minutes * 60000;
  if (isWidget) {
    $('widget-clock').textContent = completed ? '已完成' : clock(remaining, true);
    $('widget-clock').title = round ? `本轮已专注 ${clock(round.elapsedMs)} / ${clock(round.durationMs)}${running ? '' : ' · 已暂停'}` : '查看任务与本轮记录';
    $('widget-task').querySelector('span').textContent = task?.title || '选择任务';
    $('widget-task').querySelector('i').className = `dot ${category(task?.list)}`;
    $('widget-task').title = `${task?.title || '选择任务'} · 点击切换${state.notice ? `\n${state.notice}` : ''}`;
    $('widget-toggle').innerHTML = running ? pauseIcon : playIcon;
    $('widget-toggle').setAttribute('aria-label', running ? '暂停番茄' : round ? '继续番茄' : '开始番茄');
    $('widget-toggle').title = running ? '暂停番茄' : round ? '继续番茄' : '开始番茄';
    $('pill').classList.toggle('paused', Boolean(round && !running));
    $('pill').classList.toggle('complete', completed);
    $('pill').classList.toggle('locked', state.settings.locked);
    return;
  }
  if (!settingsLoaded) fillSettings();
  for (const key of ['topmost','locked','sound']) $(key).checked = state.settings[key];
  $('notice').hidden = !state.notice;
  $('notice').querySelector('span').textContent = state.notice;
  $('round-summary').textContent = round ? `${running ? '本轮已专注' : '已暂停'} ${clock(round.elapsedMs)} / ${clock(round.durationMs)}` : completed ? '上一轮已完成，可开始下一轮' : '选择任务，开始一轮专注';
  $('panel-clock').textContent = clock(remaining, true);
  $('current-label').textContent = task?.title || '先选择一个任务';
  $('toggle').textContent = running ? '暂停' : round ? '继续专注' : '开始专注';
  $('toggle').disabled = !task;
  $('finish').hidden = !round;
  $('sync').disabled = state.syncing || !state.settings.server;
  $('sync').textContent = state.syncing ? '同步中…' : '刷新任务';
  $('connect').disabled = state.syncing;
  $('connect').textContent = state.syncing ? '连接中…' : '连接并同步';
  $('shortcut-errors').textContent = state.shortcutErrors.join('；');
  $('sync-status').textContent = state.syncedAt ? `上次同步 ${new Date(state.syncedAt).toLocaleString('zh-CN')}` : '尚未连接，可先创建本地任务';
  $('notification-status').textContent = state.notificationsSupported ? '系统通知和提示音受系统勿扰及通知权限控制。' : '当前系统不支持通知，完成状态仍会显示在浮标。';
  if (view === 'tasks') renderTasks();
  if (view === 'history') renderHistory();
}
function renderTasks() {
  const search = $('search').value.trim().toLocaleLowerCase();
  filtered = state.tasks.filter(t => t.title.toLocaleLowerCase().includes(search)).sort((a,b) => {
    const rank = t => t.id === state.selectedId ? -1 : state.recent.includes(t.id) ? state.recent.indexOf(t.id) : 999;
    return rank(a)-rank(b);
  });
  highlight = Math.max(0, Math.min(highlight, filtered.length-1));
  const signature = JSON.stringify([filtered.map(t => [t.id,t.title,t.list]), state.selectedId]);
  if (signature !== taskSignature) {
    taskSignature = signature;
    const fragment = document.createDocumentFragment();
    filtered.forEach((task,index) => {
      const row = el('button','task-row');
      row.dataset.id = task.id;
      row.id = `task-option-${index}`;
      row.setAttribute('role','option');
      row.setAttribute('aria-selected', String(task.id === state.selectedId));
      row.append(el('i', `dot ${category(task.list)}`));
      const name = el('span','task-name');
      name.append(el('span','task-title',task.title),el('span','task-meta'));
      row.append(name,el('span','task-time'));
      if (task.id === state.selectedId) row.append(el('span','current-badge','当前'));
      row.title = task.title;
      row.addEventListener('click', () => choose(task.id));
      fragment.append(row);
    });
    $('task-list').replaceChildren(fragment);
  }
  const totals = new Map(state.roundTotals.map(t => [t.taskId,t.durationMs]));
  Array.from($('task-list').children).forEach((row,index) => {
    const id = row.dataset.id;
    row.classList.toggle('highlighted', index === highlight);
    row.querySelector('.task-time').textContent = clock(totals.get(id) || 0);
    const stats = state.stats[id] || { today:0,total:0 };
    row.querySelector('.task-meta').textContent = `今日 ${clock(stats.today)} · 累计 ${clock(stats.total)}`;
  });
  $('empty').hidden = filtered.length > 0;
  $('empty').querySelector('strong').textContent = state.tasks.length ? '没有匹配的任务' : '从一个任务开始。';
  $('empty').querySelector('p').textContent = state.tasks.length ? '换个关键词，或添加一个本地任务。' : '创建本地任务，或在设置中连接看板，读取 TickTick 任务。';
}
async function choose(id) {
  const result = await command('select',id);
  if (result?.current) await run(() => api.hide());
}
function renderHistory() {
  const signature = JSON.stringify(state.history);
  if (signature === historySignature) return;
  historySignature = signature;
  const fragment = document.createDocumentFragment();
  if (!state.history.length) fragment.append(el('p','empty','完成第一轮番茄后，这里会保留你的时间分配。'));
  for (const round of state.history) {
    const card = el('article','history-card');
    const header = el('div','history-head');
    header.append(el('strong','',clock(round.elapsedMs)), el('span','',round.status === 'completed' ? '本轮完成' : '提前结束'));
    card.append(header,el('p','history-date',`${new Date(round.startedAt).toLocaleString('zh-CN')} → ${new Date(round.endedAt).toLocaleTimeString('zh-CN')}\n计划 ${clock(round.durationMs)} · 经过 ${clock(round.endedAt-round.startedAt)}（含暂停）`));
    const map = new Map();
    for (const s of round.segments) {
      const value = map.get(s.taskId) || { title:s.title,list:s.list,ms:0 };
      value.ms += s.durationMs; map.set(s.taskId,value);
    }
    for (const row of map.values()) {
      const line = el('div','history-task');
      line.append(el('i',`dot ${category(row.list)}`),el('span','',row.title),el('span','',clock(row.ms)));
      card.append(line);
    }
    fragment.append(card);
  }
  $('history-list').replaceChildren(fragment);
}

$(isWidget ? 'widget' : 'panel').hidden = false;
if (isWidget) {
  $('widget-clock').onclick = $('widget-task').onclick = () => run(() => api.open());
  $('widget-toggle').onclick = () => state.tasks.some(t=>t.id===state.selectedId) ? command('toggle') : run(() => api.open());
} else {
  $('hide-panel').onclick = () => run(() => api.hide());
  $('dismiss-notice').onclick = () => command('dismiss');
  document.querySelectorAll('nav button').forEach(node => { node.onclick = () => setView(node.dataset.view); });
  $('search').oninput = () => { highlight=0; renderTasks(); };
  $('toggle').onclick = () => command('toggle');
  $('finish').onclick = () => command('finish');
  $('sync').onclick = () => run(() => api.sync());
  $('add-form').onsubmit = async e => {
    e.preventDefault();
    if (await command('add',$('new-task').value)) { $('new-task').value=''; $('search').value=''; renderTasks(); }
  };
  $('connection-form').onsubmit = async e => {
    e.preventDefault();
    const code = $('code').value; $('code').value = '';
    const next = await run(() => api.connect($('server').value.trim(),code));
    if (next) { render(next); setView('tasks'); }
  };
  $('shortcut-form').onsubmit = async e => {
    e.preventDefault();
    const shortcuts = Object.fromEntries(['switch','previous','pause'].map(k=>[k,$(`shortcut-${k}`).value.trim()]));
    const next = await run(() => api.settings({shortcuts}));
    if (next) { render(next); fillSettings(); }
  };
  $('minutes').onchange = () => run(() => api.settings({minutes:Number($('minutes').value)}));
  for (const key of ['sound','locked','topmost']) $(key).onchange = () => run(() => api.settings({[key]:$(key).checked}));
  $('data-folder').onclick = () => run(() => api.dataFolder());
  document.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); void run(() => api.hide()); return; }
    if (view !== 'tasks' || (e.target instanceof HTMLInputElement && e.target !== $('search')) || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); highlight = Math.max(0,Math.min(filtered.length-1,highlight+(e.key === 'ArrowDown'?1:-1)));
      renderTasks(); $('task-list').children[highlight]?.scrollIntoView({block:'nearest'});
    } else if (e.key === 'Enter' && filtered[highlight] && (e.target === $('search') || e.target === document.body)) {
      e.preventDefault(); void choose(filtered[highlight].id);
    }
  });
}
api.onState(render);
api.onView(setView);
run(async () => { render(await api.get()); if (!isWidget) setView('tasks'); });
