/* The renderer only receives snapshots and sends narrowly scoped commands. */
const $ = id => document.getElementById(id);
const api = window.hustle;
const isWidget = new URLSearchParams(location.search).get('view') === 'widget';
const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
const doneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>';
const SHORTCUTS = ['switch', 'previous', 'pause', 'next', 'complete'];
const LISTS = ['work', 'study', 'hustle', 'life'];
let state, view = 'tasks', highlight = 0, filtered = [], taskSignature = '', historySignature = '';
let errorTimeout, settingsLoaded = false, newList = 'work';
let lastTaskId, dragId = null, dropIndex = null;
const clock = (ms, ceil = false) => {
  const seconds = Math.max(0, (ceil ? Math.ceil : Math.floor)(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
};
const category = list => [...LISTS, 'inbox'].includes(list) ? list : 'inbox';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  document.querySelectorAll('.header-tools [data-view]').forEach(node => node.classList.toggle('active', node.dataset.view === view));
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
  for (const key of SHORTCUTS) $(`shortcut-${key}`).value = s.shortcuts[key] || '';
  $('shortcut-help').textContent = state.platform === 'darwin' ? 'Mac：Control = ⌃，Alt = Option（⌥），不是 Command。可在其他应用中使用。' : '可在其他应用中使用。格式示例：Control+Alt+K。';
  settingsLoaded = true;
}

/* Switching tasks is the one moment worth a flourish: the old name lifts out, the new one
   rises in, and the pill rings once in the new task's colour. */
function swapTaskName(container, title, list) {
  const current = container.querySelector('span:last-child');
  if (current && current.textContent === title) return;
  const incoming = el('span', '', title);
  if (!current || reduceMotion) { container.replaceChildren(incoming); return; }
  current.classList.add('leaving');
  incoming.classList.add('entering');
  container.append(incoming);
  const clean = () => { current.remove(); incoming.classList.remove('entering'); if (isWidget) marquee(incoming); };
  incoming.addEventListener('animationend', clean, { once: true });
  setTimeout(clean, 500);
  if (isWidget) {
    const pill = $('pill');
    pill.style.setProperty('--ring', getComputedStyle(container.previousElementSibling).backgroundColor);
    pill.classList.remove('ring'); void pill.offsetWidth; pill.classList.add('ring');
  }
}

/* Text that does not fit gets a slow back-and-forth scroll instead of an ellipsis. Measured
   after layout, so it is re-checked every render and drops the scroll once the text fits. */
function marquee(node) {
  // Animation cleanup may run again after a later task switch removed this node.
  if (!node?.parentElement) return;
  // The moving element must sit inside a clipping parent: moving the clipper itself moves the
  // clip window along with the text, so nothing new is ever revealed.
  const clip = node.parentElement;
  const overflow = node.scrollWidth - clip.clientWidth;
  if (overflow > 2 && !reduceMotion) {
    if (node.dataset.shift !== String(overflow)) {
      node.dataset.shift = String(overflow);
      node.style.setProperty('--shift', `-${overflow}px`);
      node.style.setProperty('--marquee-duration', `${Math.max(4, 3 + overflow / 25)}s`);
      node.classList.remove('marquee'); void node.offsetWidth; node.classList.add('marquee');
    }
  } else if (node.classList.contains('marquee')) {
    node.classList.remove('marquee'); delete node.dataset.shift;
  }
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
    $('widget-task').querySelector('i').className = `dot ${category(task?.list)}`;
    swapTaskName($('widget-task').querySelector('.task-swap'), task?.title || '选择任务', task?.list);
    $('widget-task').title = `${task?.title || '选择任务'} · 点击打开切换器${state.notice ? `\n${state.notice}` : ''}`;
    $('widget-done').disabled = !task;
    $('widget-done').title = task ? `完成「${task.title}」，切到下一个 (${state.settings.shortcuts.complete})` : '先选择一个任务';
    $('widget-toggle').innerHTML = running ? pauseIcon : playIcon;
    $('widget-toggle').setAttribute('aria-label', running ? '暂停番茄' : round ? '继续番茄' : '开始番茄');
    $('widget-toggle').title = running ? '暂停番茄' : round ? '继续番茄' : '开始番茄';
    $('pill').classList.toggle('paused', Boolean(round && !running));
    $('pill').classList.toggle('complete', completed);
    $('pill').classList.toggle('locked', state.settings.locked);
    renderWidgetQueue();
    requestAnimationFrame(() => {
      marquee($('widget-task').querySelector('.task-swap>span:not(.leaving):not(.entering)'));
      $('widget-queue').querySelectorAll('.widget-queue-chip .clip>span').forEach(marquee);
    });
    lastTaskId = task?.id;
    return;
  }
  if (!settingsLoaded) fillSettings();
  for (const key of ['topmost','locked','sound']) $(key).checked = state.settings[key];
  $('notice').hidden = !state.notice;
  $('notice').querySelector('span').textContent = state.notice;
  $('round-summary').textContent = round ? `${running ? '本轮已专注' : '已暂停'} ${clock(round.elapsedMs)} / ${clock(round.durationMs)}` : completed ? '上一轮已完成，可开始下一轮' : '选择任务，开始一轮专注';
  $('panel-clock').textContent = clock(remaining, true);
  swapTaskName($('current-label'), task?.title || '先选择一个任务');
  $('toggle').textContent = running ? '暂停' : round ? '继续专注' : '开始专注';
  $('toggle').disabled = !task;
  $('complete').disabled = !task;
  $('complete').title = task ? `完成「${task.title}」，切到下一个 (${state.settings.shortcuts.complete})` : '先选择一个任务';
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
  lastTaskId = task?.id;
}

/* A slim strip under the pill: the next three in the queue, always there, one click to switch. */
function renderWidgetQueue() {
  const list = $('widget-queue');
  const queue = state.queue || [];
  const signature = JSON.stringify(queue.map(t => [t.id, t.title, t.list]));
  if (list.dataset.signature === signature) return;
  list.dataset.signature = signature;
  const fragment = document.createDocumentFragment();
  if (!queue.length) fragment.append(el('span', 'widget-queue-empty', state.tasks.length ? '队列已空' : '还没有任务'));
  queue.forEach((task, index) => {
    const chip = el('button', 'widget-queue-chip');
    chip.setAttribute('role', 'option');
    chip.style.setProperty('--i', index);
    const clip = el('span', 'clip'); clip.append(el('span', '', task.title));
    chip.append(el('i', `dot ${category(task.list)}`), clip);
    chip.title = `${index === 0 ? '下一个' : `第 ${index + 1} 个`}：${task.title}\n点击切换`;
    chip.onclick = e => { e.stopPropagation(); void command('select', task.id); };
    fragment.append(chip);
  });
  list.replaceChildren(fragment);
}

/* Rows keep their identity across renders so a reorder can be animated with FLIP:
   measure where each row was, rebuild, measure again, and play the difference. */
function renderTasks() {
  const search = $('search').value.trim().toLocaleLowerCase();
  filtered = state.tasks.filter(t => t.title.toLocaleLowerCase().includes(search));
  highlight = Math.max(0, Math.min(highlight, filtered.length-1));
  const signature = JSON.stringify([filtered.map(t => [t.id,t.title,t.list]), state.selectedId]);
  const listNode = $('task-list');
  if (signature !== taskSignature) {
    taskSignature = signature;
    const before = new Map(Array.from(listNode.children, row => [row.dataset.id, row.getBoundingClientRect().top]));
    const fragment = document.createDocumentFragment();
    filtered.forEach((task,index) => {
      const row = el('div','task-row');
      row.dataset.id = task.id;
      row.id = `task-option-${index}`;
      row.setAttribute('role','option');
      row.setAttribute('aria-selected', String(task.id === state.selectedId));
      row.tabIndex = -1;
      row.draggable = !search;
      row.append(el('span','grip','⋮⋮'));
      row.append(el('i', `dot ${category(task.list)}`));
      const name = el('span','task-name');
      name.append(el('span','task-title',task.title),el('span','task-meta'));
      row.append(name,el('span','task-time'));
      if (task.id === state.selectedId) row.append(el('span','current-badge','当前'));
      const done = el('button','row-done');
      done.innerHTML = doneIcon; done.title = `完成「${task.title}」`; done.setAttribute('aria-label', `完成 ${task.title}`);
      done.onclick = e => { e.stopPropagation(); void completeRow(row, task.id); };
      row.append(done);
      row.title = task.title;
      row.addEventListener('click', () => choose(task.id));
      row.addEventListener('dragstart', e => { dragId = task.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); });
      row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging'); clearDropMarks(); });
      fragment.append(row);
    });
    listNode.replaceChildren(fragment);
    if (before.size && !reduceMotion) {
      for (const row of listNode.children) {
        const was = before.get(row.dataset.id);
        if (was === undefined) { row.classList.add('arrived'); continue; }
        const delta = was - row.getBoundingClientRect().top;
        if (Math.abs(delta) < 1) continue;
        row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      const current = listNode.querySelector('[aria-selected=true]');
      if (current && state.selectedId !== lastTaskId) { current.classList.remove('pulse'); void current.offsetWidth; current.classList.add('pulse'); }
    }
  }
  const totals = new Map(state.roundTotals.map(t => [t.taskId,t.durationMs]));
  Array.from(listNode.children).forEach((row,index) => {
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
function clearDropMarks() {
  dropIndex = null;
  $('task-list').querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before','drop-after'));
}
async function completeRow(row, id) {
  if (!reduceMotion) {
    row.classList.add('leaving-done');
    await new Promise(resolve => setTimeout(resolve, 260));
  }
  await command('complete', id);
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
  $('widget-done').onclick = () => command('complete');
} else {
  $('hide-panel').onclick = () => run(() => api.hide());
  $('dismiss-notice').onclick = () => command('dismiss');
  document.querySelectorAll('[data-view]').forEach(node => { node.onclick = () => setView(node.dataset.view === view ? 'tasks' : node.dataset.view); });
  $('search').oninput = () => { highlight=0; renderTasks(); };
  $('toggle').onclick = () => command('toggle');
  $('finish').onclick = () => command('finish');
  $('complete').onclick = () => command('complete');
  $('sync').onclick = () => run(() => api.sync());
  document.querySelectorAll('.list-chip').forEach(chip => {
    chip.onclick = () => {
      newList = chip.dataset.list;
      document.querySelectorAll('.list-chip').forEach(c => { const on = c === chip; c.classList.toggle('is-on', on); c.setAttribute('aria-pressed', String(on)); });
      $('new-task').focus();
    };
  });
  $('add-form').onsubmit = async e => {
    e.preventDefault();
    if (await command('add', { title: $('new-task').value, list: newList })) { $('new-task').value=''; $('search').value=''; renderTasks(); }
  };
  // Drag a row to change its place in the queue. The drop marker follows the pointer's half of the row.
  const listNode = $('task-list');
  listNode.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.task-row');
    if (!row || row.dataset.id === dragId) return;
    const rect = row.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    clearDropMarks();
    row.classList.add(after ? 'drop-after' : 'drop-before');
    const rows = Array.from(listNode.children).filter(r => r.dataset.id !== dragId);
    dropIndex = rows.indexOf(row) + (after ? 1 : 0);
  });
  listNode.addEventListener('dragleave', e => { if (!listNode.contains(e.relatedTarget)) clearDropMarks(); });
  listNode.addEventListener('drop', e => {
    e.preventDefault();
    if (dragId && dropIndex !== null) void command('move', { id: dragId, index: dropIndex });
    clearDropMarks();
  });
  $('connection-form').onsubmit = async e => {
    e.preventDefault();
    const code = $('code').value; $('code').value = '';
    const next = await run(() => api.connect($('server').value.trim(),code));
    if (next) { render(next); setView('tasks'); }
  };
  $('shortcut-form').onsubmit = async e => {
    e.preventDefault();
    const shortcuts = Object.fromEntries(SHORTCUTS.map(k=>[k,$(`shortcut-${k}`).value.trim()]));
    const next = await run(() => api.settings({shortcuts}));
    if (next) { render(next); fillSettings(); }
  };
  $('minutes').onchange = () => run(() => api.settings({minutes:Number($('minutes').value)}));
  for (const key of ['sound','locked','topmost']) $(key).onchange = () => run(() => api.settings({[key]:$(key).checked}));
  $('data-folder').onclick = () => run(() => api.dataFolder());
  $('open-dashboard').onclick = () => run(() => api.dashboard());
  document.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); void run(() => api.hide()); return; }
    if (view !== 'tasks' || (e.target instanceof HTMLInputElement && e.target !== $('search')) || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); highlight = Math.max(0,Math.min(filtered.length-1,highlight+(e.key === 'ArrowDown'?1:-1)));
      renderTasks(); listNode.children[highlight]?.scrollIntoView({block:'nearest'});
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && state?.selectedId) {
      e.preventDefault(); void command('complete');
    } else if (e.key === 'Enter' && filtered[highlight] && (e.target === $('search') || e.target === document.body)) {
      e.preventDefault(); void choose(filtered[highlight].id);
    }
  });
}
api.onState(render);
api.onView(setView);
run(async () => { render(await api.get()); if (!isWidget) setView('tasks'); });
