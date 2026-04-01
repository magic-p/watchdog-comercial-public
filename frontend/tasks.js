function ownerKey(owner) {
  return String(owner || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeOwnerName(owner) {
  const base = String(owner || '').replace(/\s+/g, ' ').trim();
  if (!base) return OWNER_FALLBACK;
  const first = base.split(/\s(?:e|&|\+)\s|,|;|\/|\|/i)[0].trim();
  if (!first) return OWNER_FALLBACK;
  const key = ownerKey(first);
  if (key === 'a definir') return OWNER_FALLBACK;
  if (OWNER_CANONICAL[key]) return OWNER_CANONICAL[key];
  const firstToken = first.split(' ')[0].trim();
  const tokenKey = ownerKey(firstToken);
  return OWNER_CANONICAL[tokenKey] || first;
}

function ownerLooksMissing(rawOwner) {
  const base = String(rawOwner || '').replace(/\s+/g, ' ').trim();
  if (!base) return false;
  const key = ownerKey(base);
  return key === 'a definir' || key === '?' || key === '-';
}

function normalizePriorityRank(rank) {
  const n = Number(rank);
  return [1, 2, 3].includes(n) ? n : null;
}

function normalizePriorityRanks(list) {
  const used = new Set();
  list.forEach(task => {
    const r = normalizePriorityRank(task.priorityRank);
    if (r && !used.has(r)) {
      task.priorityRank = r;
      used.add(r);
    } else {
      task.priorityRank = null;
    }
  });
}

const TODO_STATUS_ALIASES = {
  ABERTO: 'PENDENTE',
  A_FAZER: 'PENDENTE',
  TODO: 'PENDENTE',
  TO_DO: 'PENDENTE',
  EM_ANDAMENTO: 'FAZENDO',
  FAZENDO_AGORA: 'FAZENDO',
  DONE: 'CONCLUIDO',
  COMPLETED: 'CONCLUIDO'
};
const TODO_STATUS_DONE = new Set(['CONCLUIDO', 'CONCLUIDA', 'ARQUIVADA']);

function canonicalTaskStatus(raw) {
  const status = String(raw || '').trim().toUpperCase() || 'PENDENTE';
  return TODO_STATUS_ALIASES[status] || status;
}

function isTaskDoneState(task) {
  const status = canonicalTaskStatus(task?.status || '');
  if (TODO_STATUS_DONE.has(status)) return true;
  if (String(task?.tier || '').trim().toLowerCase() === 'done') return true;
  if (task?.done === true) return true;
  return false;
}

function normalizeTask(task) {
  const status = canonicalTaskStatus(task?.status || '');
  const done = isTaskDoneState({ ...task, status });
  const tierRaw = String(task?.tier || '').trim().toLowerCase();
  const tier = done ? 'done' : ((tierRaw === '1' || tierRaw === 't1') ? 't1' : 't2');
  return {
    ...task,
    owner: normalizeOwnerName(task.owner),
    date: formatTaskDate(task.date) || String(task.date || '').trim(),
    priorityRank: normalizePriorityRank(task.priorityRank),
    status,
    done,
    tier,
    completedAt: done ? (task.completedAt || null) : null
  };
}

function tierMeta(task) {
  if (isTaskDoneState(task)) return { chipClass: 'green', chipLabel: 'Conclu\u00EDdo' };
  if (task.tier === 't1') return { chipClass: 'red', chipLabel: 'Tier 1 \u2022 A fazer' };
  return { chipClass: 'orange', chipLabel: 'Tier 2 \u2022 Fazendo' };
}


const PT_MONTH = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};
const PT_MONTH_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function weekBounds(ref = new Date()) {
  const d = new Date(ref);
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - mondayOffset);
  const start = d;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function nextWeekStart(ref = new Date()) {
  const { start } = weekBounds(ref);
  const next = new Date(start);
  next.setDate(start.getDate() + 7);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toInputDateValue(raw) {
  const d = parseTaskDate(raw);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function weekdayLabelPt(raw) {
  const d = parseTaskDate(raw);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

function isDateInCurrentWeek(raw) {
  const dt = parseTaskDate(raw);
  if (!dt) return false;
  const { start, end } = weekBounds();
  return dt >= start && dt <= end;
}

function parseTaskDate(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '-' || s === '?' || /^a definir$/i.test(s)) return null;

  // ISO format YYYY-MM-DD (retornado pelo Supabase)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(23, 59, 59, 999);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    d.setHours(23, 59, 59, 999);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const now = new Date();
    const d = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    d.setHours(23, 59, 59, 999);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{1,2})\/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)$/i);
  if (m) {
    const now = new Date();
    const day = Number(m[1]);
    const mon = PT_MONTH[m[2].toLowerCase()];
    const d = new Date(now.getFullYear(), mon, day);
    d.setHours(23, 59, 59, 999);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function formatTaskDate(raw) {
  const d = parseTaskDate(raw);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = PT_MONTH_LABEL[d.getMonth()];
  return `${dd}/${mm}`;
}
function isValidTaskDateInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, msg: 'Prazo obrigatório.' };
  if (!parseTaskDate(s)) return { ok: false, msg: 'Formato inválido. Use dd/mmm, dd/mm ou dd/mm/aaaa.' };
  return { ok: true, msg: `Prazo válido. Exibição padrão: ${formatTaskDate(s)}.` };
}

function isTaskInCurrentWeek(task) {
  return isDateInCurrentWeek(task.date);
}

function stripLeadingBracketTag(text) {
  return String(text || '').replace(/^\s*\[[^\]]+\]\s*/, '').trim();
}

function alertTypeIcon(chip) {
  const t = String(chip || '').toUpperCase();
  if (t === 'TAREFA_SEM_DONO') return '\uD83D\uDC64';
  if (t === 'TAREFA_SEM_PRAZO') return '\uD83D\uDCC5';
  if (t === 'TAREFA_ATRASADA') return '\u23F0';
  if (t === 'ALERTA_ZUMBI') return '\uD83E\uDEA6';
  return '\u26A0';
}

function normalizeSingleOwner(input) {
  return normalizeOwnerName(input);
}

function rewriteOwnerPrefixedTaskTitle(title, previousOwner, nextOwner) {
  const rawTitle = String(title || '').trim();
  const oldFirst = normalizeOwnerName(previousOwner).split(' ')[0] || '';
  const newFirst = normalizeOwnerName(nextOwner).split(' ')[0] || '';
  if (!rawTitle || !oldFirst || !newFirst || oldFirst === newFirst) return rawTitle;
  const match = rawTitle.match(/^\s*([^:]{1,40}):(.*)$/);
  if (!match) return rawTitle;
  const prefixFirst = normalizeOwnerName(match[1]).split(' ')[0] || '';
  if (prefixFirst !== oldFirst) return rawTitle;
  return `${newFirst}: ${String(match[2] || '').trim()}`;
}

function hasMeaningfulTaskTitle(task) {
  const title = String(task?.task || '').replace(/\s+/g, ' ').trim();
  if (!title) return false;
  if (/^tarefa sem t[ií]tulo$/i.test(title)) return false;
  return true;
}

function sanitizeTasksForUi(list) {
  return (Array.isArray(list) ? list : [])
    .map(t => normalizeTask(t))
    .filter(t => hasMeaningfulTaskTitle(t));
}

function isInvalidTaskTitleText(raw) {
  const title = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!title) return true;
  return /^tarefa sem t[ií]tulo$/i.test(title);
}

function parseWarnDays(warn) {
  const s = String(warn || '').toLowerCase();
  const m = s.match(/(\d+)\s+dias?\s+sem\s+update/);
  if (!m) return null;
  return Number(m[1]);
}

function _parseBackendAlert(str, idx) {
  const m = str.match(/^\[CRITICO:\s*([A-Z_]+)\]\s*(.+)/);
  if (!m) return null;
  const chip = m[1];
  const text = m[2];
  const level = chip === 'TAREFA_SEM_PRAZO' ? 'orange' : 'red';
  return { key: `backend_${idx}_${chip}`, tag: `[CRITICO: ${chip}]`, chip, level, text };
}

async function fetchBackendAlerts(reason = 'unknown') {
  if (isMaintenanceActive()) return;
  if (REQUIRE_LOGIN_FOR_READ && !_hasAuthSession()) {
    _backendAlerts = null;
    renderCriticalAlerts();
    return;
  }
  if (_alertsRefreshInFlight) {
    _alertsRefreshQueued = true;
    _alertsRefreshReason = _mergeRefreshReason(_alertsRefreshReason, reason);
    return;
  }
  _alertsRefreshInFlight = true;
  try {
    const r = await _fetchWithAuthRetry(`${API_URL}/api/computed/alerts?reason=${encodeURIComponent(String(reason || 'unknown'))}`, {
      headers: {},
      signal: AbortSignal.timeout(3000)
    }, { reason: `alerts_${reason}` });
    let j = null;
    try { j = await r.json(); } catch {}
    if (_consumeMaintenancePayload(j)) { _backendAlerts = null; return; }
    if (!r.ok) { _backendAlerts = null; return; }
    _backendAlerts = (j.alerts || []).map(_parseBackendAlert).filter(Boolean);
    renderCriticalAlerts();
  } catch {
    _backendAlerts = null; // motor offline — usa fallback local
  } finally {
    _alertsRefreshInFlight = false;
    if (_alertsRefreshQueued && !_alertsRefreshTimer) {
      _scheduleAlertsRefresh(220, _alertsRefreshReason);
    }
  }
}

function _applyDashboardBootstrapPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.maintenance && typeof payload.maintenance === 'object') {
    setMaintenanceState(payload.maintenance, { toast: false, keepWriteError: true });
  }
  if (payload.booked_meta && typeof payload.booked_meta === 'object') {
    BOOKED_META_SRC = payload.booked_meta;
    _kpis = (BOOKED_META_SRC && BOOKED_META_SRC.kpis) ? BOOKED_META_SRC.kpis : {};
  }
  if (payload.intel && typeof payload.intel === 'object') {
    INTEL_SRC = payload.intel;
  }
  if (payload.data_health && typeof payload.data_health === 'object') {
    DATA_HEALTH_SRC = payload.data_health;
  }
  if (payload.campanhas && typeof payload.campanhas === 'object') {
    CAMPANHAS_SRC = payload.campanhas;
  }
  if (payload.operational && typeof payload.operational === 'object') {
    setOperationalState(payload.operational);
  }
  if (Array.isArray(payload.tasks)) {
    const remoteTasks = payload.tasks.map(t => normalizeTask(t || {}));
    const nextTasks = _mergePendingTaskMutations(remoteTasks);
    tasks = sanitizeTasksForUi(nextTasks);
    if (tasks.length) _lastGoodSupabaseTasks = tasks.map(t => ({ ...t }));
    enforceWeeklyTop3(tasks);
  }
  if (Array.isArray(payload.alerts)) {
    _backendAlerts = payload.alerts.map(_parseBackendAlert).filter(Boolean);
  }
  _dashboardBootstrapCache = payload;
  renderTasks();
  renderCriticalAlerts();
  renderIntel();
  renderKpis();
  renderBookedMeta();
  renderWins();
  renderDataHealth();
  return true;
}

async function _fetchDashboardBootstrap(silent = false, reason = 'dashboard_bootstrap') {
  if (isMaintenanceActive()) return false;
  if (REQUIRE_LOGIN_FOR_READ && !_hasAuthSession()) return false;
  try {
    const resp = await _fetchWithAuthRetry(
      `${API_URL}/api/dashboard/bootstrap?reason=${encodeURIComponent(String(reason || 'unknown'))}`,
      {
        headers: {},
        signal: AbortSignal.timeout(5000),
      },
      { reason: `dashboard_bootstrap_${reason}` },
    );
    let payload = null;
    try {
      payload = await resp.json();
    } catch (parseErr) {
      console.error('[Dashboard bootstrap] invalid JSON:', parseErr);
    }
    if (_consumeMaintenancePayload(payload, { toast: !silent, keepWriteError: true })) return false;
    if (!resp.ok || !payload || !payload.ok) {
      const msg = (payload && payload.error) || ('Erro ' + resp.status);
      console.error('[Dashboard bootstrap] read error:', msg, payload);
      if (!silent) toast('Dashboard indisponivel: ' + _authFailureMessage(payload, msg), 'error');
      return false;
    }
    _applyDashboardBootstrapPayload(payload);
    if (!silent) toast('Dashboard autenticado carregado', 'ok');
    return true;
  } catch (err) {
    console.error('[Dashboard bootstrap] exception:', err);
    if (!silent) toast('Dashboard indisponivel: ' + (err?.message || String(err)), 'error');
    return false;
  }
}

let tasks = [];
let _backendAlerts = null; // null = não carregado ainda; [] = carregado (motor offline ou sem alertas)
let taskView = 'open';
let sortCol = 'date';
let sortDir = 1;
let ownerFilter = null;
let winsCollapsed = true;
let bookedCollapsed = true;
let intelCollapsed = true;
let healthCollapsed = true;
let _lastGoodSupabaseTasks = [];
let _supabaseRefreshInFlight = false;
let _initialAuthStateResolved = false;
let _pendingTaskMutations = new Map();
let _taskFormBusy = false;
let _tasksRefreshTimer = null;
let _tasksRefreshQueued = false;
let _tasksRefreshQueuedSilent = true;
let _tasksRefreshReason = 'unknown';
let _alertsRefreshTimer = null;
let _alertsRefreshInFlight = false;
let _alertsRefreshQueued = false;
let _alertsRefreshReason = 'unknown';
let _lastAuthRefreshUserKey = '';
let _lastAuthRefreshAt = 0;
let _authBootstrapUserKey = '';
let _authBootstrapUntil = 0;

function _normalizeRefreshReason(reason) {
  const parts = String(reason || '')
    .split('+')
    .map(s => String(s || '').trim())
    .filter(Boolean)
    .filter(s => s !== 'unknown');
  return parts.length ? parts.join('+') : 'unknown';
}

function _mergeRefreshReason(current, next) {
  const parts = new Set();
  for (const value of [current, next]) {
    for (const part of String(value || '').split('+')) {
      const clean = String(part || '').trim();
      if (clean && clean !== 'unknown') parts.add(clean);
    }
  }
  return parts.size ? Array.from(parts).join('+') : 'unknown';
}

function _sessionUserKey(session) {
  return String(session?.user?.id || session?.user?.email || '').trim().toLowerCase();
}

function _queueTasksRefresh(silent = true, reason = 'unknown') {
  const hadQueued = _tasksRefreshQueued;
  _tasksRefreshQueued = true;
  _tasksRefreshQueuedSilent = hadQueued ? (_tasksRefreshQueuedSilent && !!silent) : !!silent;
  _tasksRefreshReason = hadQueued ? _mergeRefreshReason(_tasksRefreshReason, reason) : _normalizeRefreshReason(reason);
}

function _scheduleTasksRefresh(silent = true, delay = 180, reason = 'unknown') {
  if (REQUIRE_LOGIN_FOR_READ && !_sbSession) return;
  _queueTasksRefresh(silent, reason);
  if (_supabaseRefreshInFlight) return;
  if (_tasksRefreshTimer) clearTimeout(_tasksRefreshTimer);
  _tasksRefreshTimer = setTimeout(async () => {
    _tasksRefreshTimer = null;
    if (!_tasksRefreshQueued) return;
    const runSilent = _tasksRefreshQueuedSilent;
    const runReason = _tasksRefreshReason;
    _tasksRefreshQueued = false;
    _tasksRefreshQueuedSilent = true;
    _tasksRefreshReason = 'unknown';
    await _refreshTasksFromApi(runSilent, runReason);
  }, Math.max(0, delay));
}

function _scheduleAlertsRefresh(delay = 220, reason = 'unknown') {
  _alertsRefreshQueued = true;
  _alertsRefreshReason = _mergeRefreshReason(_alertsRefreshReason, reason);
  if (_alertsRefreshInFlight) return;
  if (_alertsRefreshTimer) clearTimeout(_alertsRefreshTimer);
  _alertsRefreshTimer = setTimeout(async () => {
    _alertsRefreshTimer = null;
    if (!_alertsRefreshQueued) return;
    _alertsRefreshQueued = false;
    const runReason = _alertsRefreshReason;
    _alertsRefreshReason = 'unknown';
    await fetchBackendAlerts(runReason);
  }, Math.max(0, delay));
}

function _clearExpiredTaskMutations() {
  const now = Date.now();
  for (const [taskId, entry] of _pendingTaskMutations.entries()) {
    if (!entry || !entry.expiresAt || entry.expiresAt <= now) _pendingTaskMutations.delete(taskId);
  }
}

function _rememberTaskMutation(kind, task) {
  if (REQUIRE_LOGIN_FOR_READ && _sbSession) return;
  if (!task || !task.id) return;
  _clearExpiredTaskMutations();
  _pendingTaskMutations.set(task.id, {
    kind,
    task: task ? normalizeTask({ ...task }) : null,
    expiresAt: Date.now() + 60000,
  });
}

function _mergePendingTaskMutations(list) {
  if (REQUIRE_LOGIN_FOR_READ && _sbSession) {
    return sanitizeTasksForUi(Array.isArray(list) ? list : []);
  }
  _clearExpiredTaskMutations();
  const merged = new Map((Array.isArray(list) ? list : []).map(t => [t.id, normalizeTask({ ...t })]));
  for (const [taskId, entry] of _pendingTaskMutations.entries()) {
    if (!entry) continue;
    if (entry.kind === 'delete') {
      merged.delete(taskId);
      continue;
    }
    if (entry.kind === 'upsert' && entry.task) merged.set(taskId, normalizeTask({ ...entry.task }));
  }
  return sanitizeTasksForUi(Array.from(merged.values()));
}

function _clearPendingMutationsForTaskIds(ids) {
  if (REQUIRE_LOGIN_FOR_READ && _sbSession) return;
  if (!Array.isArray(ids) || !ids.length) return;
  ids.forEach(id => {
    if (id) _pendingTaskMutations.delete(id);
  });
}

const UI_STATE_KEY = 'watchdog_ui';
const UI_STATE_VERSION = 2;
function saveUiState() {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      version: UI_STATE_VERSION,
      ownerFilter, taskView, sortCol, sortDir,
      winsCollapsed, bookedCollapsed, intelCollapsed, healthCollapsed
    }));
  } catch (e) {}
}
function loadUiState() {
  try {
    const s = JSON.parse(localStorage.getItem(UI_STATE_KEY) || 'null');
    if (!s) return;
    if (Number(s.version || 0) !== UI_STATE_VERSION) return;
    if (s.ownerFilter !== undefined) {
      const normalizedFilter = normalizeOwnerName(s.ownerFilter);
      ownerFilter = normalizedFilter === OWNER_FALLBACK ? null : normalizedFilter;
    }
    if (s.taskView)  taskView  = s.taskView;
    if (s.sortCol)   sortCol   = s.sortCol;
    if (s.sortDir)   sortDir   = s.sortDir;
    if (typeof s.winsCollapsed === 'boolean') winsCollapsed = s.winsCollapsed;
    if (typeof s.bookedCollapsed === 'boolean') bookedCollapsed = s.bookedCollapsed;
    if (typeof s.intelCollapsed === 'boolean') intelCollapsed = s.intelCollapsed;
    if (typeof s.healthCollapsed === 'boolean') healthCollapsed = s.healthCollapsed;
  } catch (e) {}
}

function setTaskView(view) {
  taskView = (view === 'done') ? 'done' : (view === 'priority') ? 'priority' : 'open';
  const openPane     = document.getElementById('openPane');
  const donePane     = document.getElementById('donePane');
  const priorityPane = document.getElementById('priorityPane');
  const tabOpen      = document.getElementById('tabOpen');
  const tabDone      = document.getElementById('tabDone');
  const tabPriority  = document.getElementById('tabPriority');

  if (openPane)     openPane.classList.toggle('active',     taskView === 'open');
  if (donePane)     donePane.classList.toggle('active',     taskView === 'done');
  if (priorityPane) priorityPane.classList.toggle('active', taskView === 'priority');

  if (tabOpen) {
    tabOpen.classList.toggle('active', taskView === 'open');
    tabOpen.setAttribute('aria-selected', taskView === 'open' ? 'true' : 'false');
  }
  if (tabDone) {
    tabDone.classList.toggle('active', taskView === 'done');
    tabDone.setAttribute('aria-selected', taskView === 'done' ? 'true' : 'false');
  }
  if (tabPriority) {
    tabPriority.classList.toggle('active', taskView === 'priority');
    tabPriority.setAttribute('aria-selected', taskView === 'priority' ? 'true' : 'false');
  }
  if (taskView === 'priority') _renderPriorityPane && _renderPriorityPane();
}



function buildOwnerOptions(selectedOwner = '') {
  const owners = [...DRI_OPTIONS];
  const selected = normalizeOwnerName(selectedOwner);
  if (selected && selected !== OWNER_FALLBACK && !owners.includes(selected)) owners.unshift(selected);
  return [...new Set(owners)];
}


function load() {
  if (REQUIRE_LOGIN_FOR_READ && !_sbSession) {
    tasks = sanitizeTasksForUi(DEMO_SEED.map(s => ({ ...s })));
    enforceWeeklyTop3(tasks);
    return;
  }
  if (REQUIRE_LOGIN_FOR_READ && _sbSession) {
    tasks = [];
    enforceWeeklyTop3(tasks);
    return;
  }
  if (HAS_BACKEND_TODOS) {
    tasks = sanitizeTasksForUi(SEED.map(s => ({ ...s })));
    enforceWeeklyTop3(tasks);
    return;
  }

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && Array.isArray(raw)) {
      const map = {};
      raw.forEach(t => map[t.id] = t);
      tasks = SEED.map(s => {
        const sv = map[s.id];
        if (!sv) return normalizeTask({ ...s });
        const done = !!sv.done;
        const tier = sv.tier || s.tier;
        const tierLabel = sv.tierLabel || s.tierLabel;
        return normalizeTask({ ...s, ...sv,
          done,
          tier: done ? 'done' : (tier === 'done' ? 't2' : tier),
          tierLabel: done ? 'Concluído' : (tier === 't1' ? 'A fazer' : 'Fazendo') });
      });
      raw.forEach(t => {
        if (!SEED.find(s => s.id === t.id)) tasks.push(normalizeTask(t));
      });
      tasks = sanitizeTasksForUi(tasks);
    } else {
      tasks = sanitizeTasksForUi(SEED.map(s => ({ ...s })));
    }
  } catch {
    tasks = sanitizeTasksForUi(SEED.map(s => ({ ...s })));
  }
  enforceWeeklyTop3(tasks);
  if (tasks.length) _lastGoodSupabaseTasks = tasks.map(t => ({ ...t }));
}

function save() {
  // Em runtime autenticado, tarefas nao usam localStorage como fonte ou cache de convergencia.
  if (!REQUIRE_LOGIN_FOR_READ && !HAS_BACKEND_TODOS) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
}

function applyChatCreatedTasks(createdTasks) {
  if (!Array.isArray(createdTasks) || !createdTasks.length) return;
  const map = {};
  tasks.forEach(t => { map[t.id] = normalizeTask(t); });
  createdTasks.forEach(raw => {
    const normalized = normalizeTask(raw || {});
    if (!normalized.id) return;
    map[normalized.id] = normalized;
  });
  tasks = sanitizeTasksForUi(Object.values(map));
  enforceWeeklyTop3(tasks);
  save();
  renderTasks();
}
/*  RENDER  */
function renderDashboardDataFromCurrentState() {
  load();
  renderKpis();
  renderTasks();
  renderBookedMeta();
  renderWins();
  renderIntel();
}

function finishInitialAuthState(session = null) {
  if (_initialAuthStateResolved) return;
  _initialAuthStateResolved = true;

  const pp = document.getElementById('publicPill');
  if (session) {
    _authBootstrapUserKey = _sessionUserKey(session);
    _authBootstrapUntil = Date.now() + 15000;
    if (pp) pp.style.display = 'none';
    _onAuthLogin(session, { silent: true, refreshReason: 'initial_session' });
    return;
  }

  renderDashboardDataFromCurrentState();
  _scheduleAlertsRefresh(0, 'initial_state');
  if (pp && REQUIRE_LOGIN_FOR_READ) pp.style.display = 'inline-flex';
  if (REQUIRE_LOGIN_FOR_READ) {
    toast('Modo público: tarefas fictícias (literatura). Faça login para ver as reais.', 'err');
  } else if (!HAS_BACKEND_TODOS) {
    toast('SSOT não carregou — modo fallback ativo', 'err');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (IS_READONLY) {
    document.body.classList.add('readonly');
    const rp = document.getElementById('readonlyPill');
    if (rp) rp.style.display = 'flex';
    const ms = document.getElementById('motorStatus');
    if (ms) ms.style.display = 'none';
  }
  const pp = document.getElementById('publicPill');
  const deferProtectedRender = REQUIRE_LOGIN_FOR_READ && _sbConfigured;
  if (pp && REQUIRE_LOGIN_FOR_READ && !_sbSession && !deferProtectedRender) pp.style.display = 'inline-flex';
  // Option C: o shell publico usa demo sanitizada; dado real vem apenas da API autenticada.
  setSsotStatus(!REQUIRE_LOGIN_FOR_READ ? HAS_BACKEND_TODOS : !!_sbSession);
  _updateSysStatus();
  refreshOperationalHealth('dom_ready');
  document.getElementById('headerDate').textContent =
    new Date().toLocaleDateString('pt-BR',
      {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  loadUiState();
  setTaskView(taskView);
  if (!deferProtectedRender) {
    renderDashboardDataFromCurrentState();
  }

  document.querySelectorAll('.intel-tab[data-intel-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-intel-tab');
      document.querySelectorAll('.intel-tab[data-intel-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('#aprendizadosList, #aprendizadosArchivedList').forEach(p => {
        const isActive = (target === 'ativos' && p.id === 'aprendizadosList') ||
          (target === 'arquivados' && p.id === 'aprendizadosArchivedList');
        p.classList.toggle('active', isActive);
      });
    });
  });

  document.querySelectorAll('.intel-tab[data-alerta-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-alerta-tab');
      document.querySelectorAll('.intel-tab[data-alerta-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('#criticasList, #criticasArchivedList').forEach(p => {
        const isActive = (target === 'ativos' && p.id === 'criticasList') ||
          (target === 'arquivados' && p.id === 'criticasArchivedList');
        p.classList.toggle('active', isActive);
      });
    });
  });

  const winsToggle = document.getElementById('winsToggle');
  const winsList = document.getElementById('winsList');
  if (winsToggle && winsList) {
    applyCollapsibleState('winsList', 'winsToggle', winsCollapsed);
    winsToggle.addEventListener('click', () => {
      winsCollapsed = !winsCollapsed;
      applyCollapsibleState('winsList', 'winsToggle', winsCollapsed);
      saveUiState();
    });
  }

  const bookedToggle = document.getElementById('bookedToggle');
  const bookedBody = document.getElementById('bookedBody');
  if (bookedToggle && bookedBody) {
    applyCollapsibleState('bookedBody', 'bookedToggle', bookedCollapsed);
    bookedToggle.addEventListener('click', () => {
      bookedCollapsed = !bookedCollapsed;
      applyCollapsibleState('bookedBody', 'bookedToggle', bookedCollapsed);
      saveUiState();
    });
  }

  /* intelToggle: seção Claudete sempre expandida — botão oculto no HTML */
  const intelToggle = document.getElementById('intelToggle');
  const intelSection = document.getElementById('intelSection');
  if (intelToggle && intelSection) {
    // Garante que a seção não fique colapsada por estado salvo anteriormente
    intelSection.classList.remove('section-collapsed', 'collapsed');
    intelToggle.style.display = 'none';
  }

  const healthToggle = document.getElementById('healthToggle');
  const healthBody = document.getElementById('dataHealthList');
  if (healthToggle && healthBody) {
    applyCollapsibleState('dataHealthList', 'healthToggle', healthCollapsed);
    healthToggle.addEventListener('click', () => {
      healthCollapsed = !healthCollapsed;
      applyCollapsibleState('dataHealthList', 'healthToggle', healthCollapsed);
      saveUiState();
    });
  }

  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      if (sortCol === th.dataset.sort) { sortDir *= -1; }
      else { sortCol = th.dataset.sort; sortDir = 1; }
      saveUiState();
      renderTasks();
    });
  });

  /* Motor status (só relevante quando local) */
  if (IS_LOCAL) {
    fetch(`${API_URL}/api/todos/patch`, { method: 'OPTIONS' })
      .then(() => setMotorStatus(true))
      .catch(() => setMotorStatus(false));
  }

  /* Supabase auth init */
  if (_sb) {
    /* Detecta erros de autenticação no hash da URL (ex: link expirado) */
    const _hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (_hashParams.get('error') === 'access_denied') {
      const _errCode = _hashParams.get('error_code') || '';
      const _errMsg  = _errCode === 'otp_expired'
        ? 'Link de acesso expirado. Clique em "Entrar" para solicitar um novo.'
        : 'Erro de autenticação: ' + (_hashParams.get('error_description') || _errCode);
      setTimeout(() => toast(_errMsg, 'error'), 300);
      /* Limpa o hash feio da URL */
      window.history.replaceState(null, '', window.location.pathname);
    }

    _sb.auth.getSession().then(({ data }) => {
      finishInitialAuthState(data.session || null);
    });
    _sb.auth.onAuthStateChange((_event, session) => {
      if (_event === 'INITIAL_SESSION') {
        finishInitialAuthState(session || null);
        return;
      }
      if (_event === 'SIGNED_IN' && !_initialAuthStateResolved && session) {
        finishInitialAuthState(session);
        return;
      }
      if (_event === 'SIGNED_OUT' || !session) {
        _onAuthLogout({ skipRemoteSignOut: true });
        return;
      }
      const userKey = _sessionUserKey(session);
      const sameUser = !!_sbSession && (_sessionUserKey(_sbSession) === _sessionUserKey(session));
      if (_event === 'TOKEN_REFRESHED') {
        _sbSession = session;
        return;
      }
      if (_event === 'SIGNED_IN' && userKey && userKey === _authBootstrapUserKey && Date.now() <= _authBootstrapUntil) {
        _sbSession = session;
        return;
      }
      if (sameUser) {
        _sbSession = session;
        return;
      }
      const refreshReason = _event === 'SIGNED_IN' ? 'auth_login' : `auth_event_${String(_event || 'unknown').toLowerCase()}`;
      _onAuthLogin(session, { silent: _event !== 'SIGNED_IN', refreshReason });
    });
  } else {
    document.getElementById('authPill').style.display = 'none';
    _initialAuthStateResolved = true;
    if (REQUIRE_LOGIN_FOR_READ) {
      toast('Modo público: tarefas fictícias (literatura). Faça login para ver as reais.', 'err');
    } else if (!HAS_BACKEND_TODOS) {
      toast('SSOT não carregou — modo fallback ativo', 'err');
    }
  }

  const exportOverlay = document.getElementById('overlay');
  const taskOverlay = document.getElementById('taskOverlay');
  const taskForm = document.getElementById('taskForm');
  const taskDate = document.getElementById('taskDate');

  if (exportOverlay) {
    exportOverlay.addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });
  }
  if (taskOverlay) {
    taskOverlay.addEventListener('click', function(e) {
      if (e.target === this) closeTaskModal();
    });
  }
  if (taskForm) taskForm.addEventListener('submit', submitTaskForm);
  if (taskDate) {
    taskDate.addEventListener('input', refreshTaskDateHint);
    taskDate.addEventListener('blur', refreshTaskDateHint);
  }
});

/* ── Supabase Auth ─────────────────────────────────────────── */
