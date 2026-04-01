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

function buildCriticalAlerts(list) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  list.forEach(t => {
    if (t.done) return;
    const owner = normalizeOwnerName(t.owner);
    const ownerMissing = ownerLooksMissing(t.owner);
    const title = t.task || 'Tarefa sem t\u00EDtulo';

    if (ownerMissing) {
      out.push({ key: `sem_dono_${t.id}`, tag: '[CRITICO: TAREFA_SEM_DONO]', chip: 'TAREFA_SEM_DONO', level: 'red', text: `(${t.id}) ${title} sem respons\u00E1vel definido.` });
    }

    const due = parseTaskDate(t.date);
    if (!due) {
      out.push({ key: `sem_prazo_${t.id}`, tag: '[CRITICO: TAREFA_SEM_PRAZO]', chip: 'TAREFA_SEM_PRAZO', level: 'orange', text: `(${t.id}) ${owner}: ${title} sem prazo definido.` });
    } else if (due < today) {
      out.push({ key: `atrasada_${t.id}`, tag: '[CRITICO: TAREFA_ATRASADA]', chip: 'TAREFA_ATRASADA', level: 'red', text: `(${t.id}) ${owner}: ${title} atrasada (prazo ${t.date}).` });
    }

    const warnDays = parseWarnDays(t.warn);
    const updatedAt = t.updatedAt ? new Date(t.updatedAt) : null;
    let zombie = false;
    let zombieInfo = 'sem hist\u00F3rico de atualiza\u00E7\u00E3o';

    if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
      const days = Math.floor((Date.now() - updatedAt.getTime()) / 86400000);
      if (days >= ZOMBIE_DAYS) {
        zombie = true;
        zombieInfo = `sem atualiza\u00E7\u00E3o h\u00E1 ${days} dias`;
      }
    } else if (typeof warnDays === 'number' && warnDays >= ZOMBIE_DAYS) {
      zombie = true;
      zombieInfo = `sem atualiza\u00E7\u00E3o h\u00E1 ${warnDays} dias`;
    }

    if (zombie) {
      out.push({ key: `zumbi_${t.id}`, tag: '[CRITICO: ALERTA_ZUMBI]', chip: 'ALERTA_ZUMBI', level: 'red', text: `(${t.id}) ${owner}: ${title} ${zombieInfo}.` });
    }
  });

  const uniq = [];
  const seen = new Set();
  out.forEach(a => {
    if (seen.has(a.key)) return;
    seen.add(a.key);
    uniq.push(a);
  });
  return uniq;
}

function renderCriticalAlerts() {
  const host = document.getElementById('criticalAlertsList');
  const topHost = document.getElementById('criticalAlertTop');
  const badge = document.getElementById('alertCount');
  if (!host) return;

  const alerts = (_backendAlerts !== null) ? _backendAlerts : buildCriticalAlerts(tasks);
  if (badge) badge.textContent = String(alerts.length);

  if (!alerts.length) {
    if (topHost) topHost.innerHTML = '';
    host.innerHTML = '<div class="alert-item"><div class="alert-stripe orange"></div><div><span class="status-chip orange">Sem Cr\u00EDtico</span><div class="alert-title">Nenhum alerta cr\u00EDtico aberto.</div></div></div>';
    return;
  }

  if (topHost) {
    const a = alerts[0];
    topHost.innerHTML = `
      <div class="alert-item" style="margin-bottom:10px">
        <div class="alert-stripe ${a.level}"></div>
        <div>
          <span class="status-chip ${a.level}"><span class="alert-chip-icon">${alertTypeIcon(a.chip)}</span>${esc(a.chip)}</span>
          <div class="alert-title">#1 agora: ${esc(stripLeadingBracketTag(a.text))}</div>
        </div>
      </div>`;
  }

  host.innerHTML = alerts.slice(1).map(a => `
    <div class="alert-item">
      <div class="alert-stripe ${a.level}"></div>
      <div>
        <span class="status-chip ${a.level}"><span class="alert-chip-icon">${alertTypeIcon(a.chip)}</span>${esc(a.chip)}</span>
        <div class="alert-title">${esc(stripLeadingBracketTag(a.text))}</div>
      </div>
      </div>`).join('');
}

function buildDataHealthFallback(list) {
  const all = Array.isArray(list) ? list : [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const open = all.filter(t => !t.done);
  const duplicateBuckets = new Map();
  open.forEach(t => {
    const owner = normalizeOwnerName(t.owner);
    const title = String(t.task || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(w => w.length >= 4)
      .slice(0, 8)
      .join(' ');
    if (!title) return;
    const key = `${owner}::${title}`;
    if (!duplicateBuckets.has(key)) duplicateBuckets.set(key, []);
    duplicateBuckets.get(key).push(t.id);
  });
  return {
    gerado_em: new Date().toLocaleString('pt-BR'),
    tarefas: {
      total: all.length,
      pendentes: open.length,
      concluidas: all.filter(t => t.done).length,
      atrasadas: open.filter(t => {
        const due = parseTaskDate(t.date);
        return due && due < today;
      }).length,
      sem_historico: open.filter(t => !t.updatedAt).length,
      owner_autopreenchido: 0,
      prazo_autopreenchido: 0,
      titulos_invalidos: all.filter(t => isInvalidTaskTitleText(t.task)).length,
      grupos_duplicidade: [...duplicateBuckets.values()].filter(ids => ids.length > 1),
    },
    fluxo: {
      placeholder_bloqueado_total: 0,
      placeholder_remoto_ignorado_total: 0,
      deletes_remotos_aplicados_total: 0,
    },
    publicacao: {
      paridade_ok: 0,
      paridade_mismatch: 0,
      paridade_missing: 0,
      arquivos: [],
    },
  };
}

function getDataHealthSnapshot() {
  const fallback = buildDataHealthFallback(tasks);
  if (!DATA_HEALTH_SRC) return fallback;
  const fromFile = JSON.parse(JSON.stringify(DATA_HEALTH_SRC));
  fromFile.tarefas = Object.assign({}, fromFile.tarefas || {}, {
    total: fallback.tarefas.total,
    pendentes: fallback.tarefas.pendentes,
    concluidas: fallback.tarefas.concluidas,
    atrasadas: fallback.tarefas.atrasadas,
    sem_historico: fallback.tarefas.sem_historico,
    titulos_invalidos: fallback.tarefas.titulos_invalidos,
    grupos_duplicidade: fallback.tarefas.grupos_duplicidade,
  });
  return fromFile;
}

function renderDataHealth() {
  const host = document.getElementById('dataHealthList');
  const stamp = document.getElementById('dataHealthStamp');
  if (!host) return;
  const snap = getDataHealthSnapshot();
  if (stamp) stamp.textContent = snap?.gerado_em || '-';
  const tarefas = snap?.tarefas || {};
  const fluxo = snap?.fluxo || {};
  const pub = snap?.publicacao || {};
  const duplicateGroups = Array.isArray(tarefas.grupos_duplicidade) ? tarefas.grupos_duplicidade : [];
  const metaChips = [
    `${pub.paridade_mismatch || 0} mismatch público`,
    `${pub.paridade_missing || 0} arquivo público faltando`,
    `${fluxo.placeholder_bloqueado_total || 0} placeholders barrados`,
    `${fluxo.placeholder_remoto_ignorado_total || 0} placeholders remotos ignorados`,
    `${fluxo.deletes_remotos_aplicados_total || 0} deletes remotos aplicados`,
  ];
  host.innerHTML = `
    <div class="health-list">
      <div class="health-grid">
        <div class="health-item">
          <div class="health-label">Pendentes</div>
          <div class="health-value">${Number(tarefas.pendentes || 0)}</div>
          <div class="health-sub">Em aberto agora</div>
        </div>
        <div class="health-item">
          <div class="health-label">Atrasadas</div>
          <div class="health-value">${Number(tarefas.atrasadas || 0)}</div>
          <div class="health-sub">Prazo já vencido</div>
        </div>
        <div class="health-item">
          <div class="health-label">Sem histórico</div>
          <div class="health-value">${Number(tarefas.sem_historico || 0)}</div>
          <div class="health-sub">Sem atualização registrada</div>
        </div>
        <div class="health-item">
          <div class="health-label">Dono autopreenchido</div>
          <div class="health-value">${Number(tarefas.owner_autopreenchido || 0)}</div>
          <div class="health-sub">Preenchido automaticamente com Lili</div>
        </div>
        <div class="health-item">
          <div class="health-label">Prazo autopreenchido</div>
          <div class="health-value">${Number(tarefas.prazo_autopreenchido || 0)}</div>
          <div class="health-sub">Prazo automático aplicado</div>
        </div>
        <div class="health-item">
          <div class="health-label">Duplicidade provável</div>
          <div class="health-value">${duplicateGroups.length}</div>
          <div class="health-sub">${duplicateGroups.slice(0, 2).map(ids => ids.join(', ')).join(' • ') || 'Sem pares suspeitos'}</div>
        </div>
      </div>
      <div class="health-meta">
        ${metaChips.map(chip => `<span class="intel-summary-chip">${esc(chip)}</span>`).join('')}
      </div>
      <div class="health-note">Este bloco serve como check-up rápido da base: o que está atrasado, sem histórico, provável duplicado e se a publicação pública está espelhada corretamente.</div>
    </div>`;
}

function applyCollapsibleState(bodyId, buttonId, collapsed) {
  const body = document.getElementById(bodyId);
  const button = document.getElementById(buttonId);
  if (!body || !button) return;
  body.classList.toggle('collapsed', collapsed);
  body.classList.toggle('section-collapsed', collapsed);
  button.textContent = collapsed ? 'Mostrar' : 'Ocultar';
}

function enforceWeeklyTop3(list) {
  list.forEach(t => {
    if (t.priorityRank && t.done) t.priorityRank = null;
  });
  normalizePriorityRanks(list);
}

function localWeeklyWins(list) {
  const { start, end } = weekBounds();
  const wins = [];

  list.forEach(t => {
    if (!t.done || !t.completedAt) return;
    const dt = new Date(t.completedAt);
    if (Number.isNaN(dt.getTime()) || dt < start || dt > end) return;

    const due = parseTaskDate(t.date);
    const onTime = !!(due && dt <= due);
    wins.push({
      emoji: onTime ? '\u2705' : '\uD83C\uDFAF',
      titulo: `${normalizeOwnerName(t.owner)}: ${t.task}`,
      desc: onTime ? 'Conclu\u00EDda no prazo do ciclo semanal.' : 'Conclu\u00EDda no ciclo semanal (segunda a domingo).',
      dri: normalizeOwnerName(t.owner),
      data: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      tipo: onTime ? 'ENTREGA_NO_PRAZO' : 'ENTREGA_CONCLUIDA',
    });
  });

  return wins.slice(0, 5);
}

function renderTopPriorities() {
  const host = document.getElementById('top3List');
  if (!host) return;
  const weekly = tasks.filter(t => !t.done && t.priorityRank);
  const map = new Map(weekly.map(t => [t.priorityRank, t]));
  const rows = [1, 2, 3].map(rank => {
    const t = map.get(rank);
    if (!t) {
      return `
        <div class="pri-item">
          <div class="pri-num">${rank}</div>
          <div>
            <span class="status-chip blue">Aguardando sele\u00E7\u00E3o</span>
            <div class="pri-title">Selecione uma tarefa na coluna Top 3 da tabela</div>
            <div class="pri-why"><span class="lbl"></span><span>Defina a ordem ${rank} entre tarefas com prazo nesta semana (seg-dom).</span></div>
          </div>
        </div>`;
    }
    const statusChip = t.done ? { cls: 'green', lbl: 'Conclu\u00EDdo' } : t.tier === 't1' ? { cls: 'red', lbl: 'A fazer' } : { cls: 'orange', lbl: 'Fazendo' };
    const detail = t.comment ? esc(t.comment) : `Respons&aacute;vel: ${esc(t.owner)}  Prazo: ${esc(t.date || '')}`;
    const impact = t.warn ? esc(t.warn) : `Acompanhamento di\u00E1rio por ${esc(t.owner)}.`;
    return `
      <div class="pri-item">
        <div class="pri-num">${rank}</div>
        <div>
          <span class="status-chip ${statusChip.cls}">${statusChip.lbl}</span>
          <div class="pri-title">(${esc(t.id)}) ${esc(t.task)}</div>
          <div class="pri-why"><span class="lbl"></span><span>${detail}</span></div>
          <div class="pri-impact"><span class="lbl"></span><span>${impact}</span></div>
        </div>
      </div>`;
  });
  host.innerHTML = rows.join('');
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

function setTaskFormBusy(busy, mode = null) {
  _taskFormBusy = !!busy;
  const submitBtn = document.getElementById('taskSubmitBtn');
  const deleteBtn = document.getElementById('taskDeleteBtn');
  const cancelBtn = document.querySelector('#taskOverlay .ghost');
  if (submitBtn) {
    submitBtn.disabled = _taskFormBusy;
    if (_taskFormBusy) {
      submitBtn.dataset.prevLabel = submitBtn.dataset.prevLabel || submitBtn.textContent;
      submitBtn.textContent = mode === 'create' ? 'Criando...' : 'Salvando...';
    } else if (submitBtn.dataset.prevLabel) {
      submitBtn.textContent = submitBtn.dataset.prevLabel;
      delete submitBtn.dataset.prevLabel;
    }
  }
  if (deleteBtn) {
    deleteBtn.disabled = _taskFormBusy;
    if (_taskFormBusy && mode === 'delete') {
      deleteBtn.dataset.prevLabel = deleteBtn.dataset.prevLabel || deleteBtn.textContent;
      deleteBtn.textContent = 'Excluindo...';
    } else if (deleteBtn.dataset.prevLabel) {
      deleteBtn.textContent = deleteBtn.dataset.prevLabel;
      delete deleteBtn.dataset.prevLabel;
    }
  }
  if (cancelBtn) cancelBtn.disabled = _taskFormBusy;
}

function openTaskModal(mode = 'create', id = null) {
  taskFormMode = mode === 'edit' ? 'edit' : 'create';
  editingTaskId = (taskFormMode === 'edit') ? id : null;

  const overlay = document.getElementById('taskOverlay');
  const title = document.getElementById('taskModalTitle');
  const submitBtn = document.getElementById('taskSubmitBtn');
  const taskInput = document.getElementById('taskTask');
  const ownerSelect = document.getElementById('taskOwner');
  const dateInput = document.getElementById('taskDate');
  const err = document.getElementById('taskFormError');
  if (!overlay || !title || !submitBtn || !taskInput || !ownerSelect || !dateInput || !err) return;

  const current = (taskFormMode === 'edit') ? tasks.find(t => t.id === id) : null;

  title.textContent = current ? 'Editar tarefa' : 'Nova tarefa';
  submitBtn.textContent = current ? 'Salvar alterações' : 'Criar tarefa';

  const options = buildOwnerOptions(current ? current.owner : '');
  ownerSelect.innerHTML = '<option value="">Selecione</option>' + options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');

  taskInput.value = current ? (current.task || '') : '';
  ownerSelect.value = current ? (normalizeOwnerName(current.owner) === OWNER_FALLBACK ? '' : normalizeOwnerName(current.owner)) : '';
  dateInput.value = current ? toInputDateValue(current.date || '') : '';
  const commentInput = document.getElementById('taskComment');
  if (commentInput) commentInput.value = current ? (current.comment || '') : '';
	  err.textContent = '';
  setTaskFormBusy(false);

	  const deleteBtn = document.getElementById('taskDeleteBtn');
	    if (deleteBtn) {
	      deleteBtn.style.display = taskFormMode === 'edit' ? 'inline-flex' : 'none';
	      deleteBtn.onclick = async () => {
        if (_taskFormBusy) return;
	        if (!editingTaskId) return;
	        const t = tasks.find(x => x.id === editingTaskId);
	        if (!t) return;
	        if (!confirm(`Excluir a tarefa "${t.task}"?`)) return;
        setTaskFormBusy(true, 'delete');
        try {
	          const ok = await apiPatchConfirm(
	            { id: editingTaskId, deleted: true },
	            'Tarefa excluída (SSOT ok)',
	            'Falha ao excluir no SSOT (motor offline)'
	          );
	          if (!ok) return;
	          _rememberTaskMutation('delete', { id: editingTaskId });
	          tasks = tasks.filter(x => x.id !== editingTaskId);
	          save();
	          if (_sbSession) _scheduleTasksRefresh(true, 120, 'task_delete');
	          closeTaskModal();
	          renderTasks();
        } finally {
          setTaskFormBusy(false);
        }
	      };
	    }

  refreshTaskDateHint();
  overlay.classList.add('open');
  setTimeout(() => taskInput.focus(), 20);
}

function closeTaskModal() {
  const overlay = document.getElementById('taskOverlay');
  const form = document.getElementById('taskForm');
  const err = document.getElementById('taskFormError');
  if (overlay) overlay.classList.remove('open');
  if (form) form.reset();
  if (err) err.textContent = '';
  taskFormMode = 'create';
  editingTaskId = null;
}

function refreshTaskDateHint() {
  const dateInput = document.getElementById('taskDate');
  const hint = document.getElementById('taskDateHint');
  if (!dateInput || !hint) return;
  const check = isValidTaskDateInput(dateInput.value);
  hint.textContent = check.ok
    ? `Prazo selecionado: ${weekdayLabelPt(dateInput.value)}. Exibição na lista: ${formatTaskDate(dateInput.value)}.`
    : check.msg;
  hint.classList.remove('ok', 'err');
  hint.classList.add(check.ok ? 'ok' : 'err');
}

async function submitTaskForm(e) {
  e.preventDefault();
  if (_taskFormBusy) return;
  const taskInput = document.getElementById('taskTask');
  const ownerSelect = document.getElementById('taskOwner');
  const dateInput = document.getElementById('taskDate');
  const commentInput = document.getElementById('taskComment');
  const err = document.getElementById('taskFormError');
  if (!taskInput || !ownerSelect || !dateInput || !err) return;

  const taskName = String(taskInput.value || '').trim();
  const owner = normalizeSingleOwner(ownerSelect.value);
  const dateRaw = String(dateInput.value || '').trim();
  const dueCheck = isValidTaskDateInput(dateRaw);

  if (!taskName) {
    err.textContent = 'Descrição da tarefa é obrigatória.';
    return;
  }
  if (isInvalidTaskTitleText(taskName)) {
    err.textContent = 'Título da tarefa é obrigatório.';
    return;
  }
  if (!ownerSelect.value) {
    err.textContent = 'Selecione um responsável.';
    return;
  }
  if (!dueCheck.ok) {
    err.textContent = dueCheck.msg;
    refreshTaskDateHint();
    return;
  }

	  const commentVal = commentInput ? (String(commentInput.value || '').trim() || null) : null;
  setTaskFormBusy(true, taskFormMode === 'edit' ? 'edit' : 'create');
  try {
	    if (taskFormMode === 'edit' && editingTaskId) {
	      const task = tasks.find(t => t.id === editingTaskId);
	      if (!task) return;
	      const prev = { ...task };
	      const rewrittenTaskName = rewriteOwnerPrefixedTaskTitle(taskName, prev.owner, owner);
	      task.task = rewrittenTaskName;
	      task.owner = owner;
	      task.date = dateRaw;
	      task.comment = commentVal;
	      task.updatedAt = new Date().toISOString();
	      if (task.done) {
	        task.tier = 'done';
	        task.tierLabel = 'Concluído';
	      }
	      const ok = await applyPatchWithRollback(
	        { id: task.id, task: task.task, owner: task.owner, previousOwner: prev.owner, date: task.date, comment: commentVal },
	        () => Object.assign(task, prev),
	        'Tarefa atualizada (SSOT ok)',
	        'Falha ao salvar no SSOT (motor offline)'
	      );
	      if (!ok) { renderTasks(); return; }
	      _rememberTaskMutation('upsert', task);
	    } else {
	      const _nums = tasks.map(t => parseInt(String(t.id).replace(/^t0*/,''),10)).filter(n=>!isNaN(n));
	      const _next = (_nums.length ? Math.max(..._nums) : 0) + 1;
	      const newTask = {
	        id: 't' + String(_next).padStart(3, '0'),
	        task: taskName,
	        comment: commentVal,
	        owner,
	        date: dateRaw,
	        tier: 't1',
	        tierLabel: 'A fazer',
	        warn: null,
	        done: false,
	        priorityRank: null,
	        updatedAt: new Date().toISOString(),
	      };
	      tasks.push(newTask);
	      const ok = await applyCreateWithRollback(
	        newTask,
	        () => { tasks = tasks.filter(t => t.id !== newTask.id); },
	        'Tarefa adicionada (SSOT ok)',
	        'Falha ao criar no SSOT (motor offline)'
	      );
	      if (!ok) { renderTasks(); return; }
	      _rememberTaskMutation('upsert', newTask);
	    }

	    enforceWeeklyTop3(tasks);
	    save();
	    closeTaskModal();
	    renderTasks();
  } finally {
    setTaskFormBusy(false);
  }
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
function _sortDateVal(s) {
  if (!s) return 99999999;
  const m = String(s).match(/^(\d{1,2})\/([a-zA-Z]{3})/i);
  if (m) {
    const mo = PT_MONTH[m[2].toLowerCase()] || 0;
    return 20260000 + mo * 100 + parseInt(m[1], 10);
  }
  const d = new Date(s);
  return isNaN(d) ? 99999999 : d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
}

function sortedTasks(list) {
  return [...list].sort((a, b) => {
    let va, vb, tie = 0;
    switch (sortCol) {
      case 'owner':
        va = (a.owner||'').toLowerCase(); vb = (b.owner||'').toLowerCase();
        tie = _sortDateVal(a.date) - _sortDateVal(b.date);
        break;
      case 'tier':
        va = a.done ? 99 : (a.tier==='t1'||a.tier===1 ? 1 : 2);
        vb = b.done ? 99 : (b.tier==='t1'||b.tier===1 ? 1 : 2);
        break;
      case 'priority':
        va = a.priorityRank || 99; vb = b.priorityRank || 99;
        break;
      default: // date
        va = _sortDateVal(a.date); vb = _sortDateVal(b.date);
        tie = (a.owner||'').toLowerCase() < (b.owner||'').toLowerCase() ? -1 : 1;
    }
    if (va < vb) return -1 * sortDir;
    if (va > vb) return sortDir;
    return tie;
  });
}

function updateSortHeaders() {
  document.querySelectorAll('th[data-sort]').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    if (th.dataset.sort === sortCol) {
      th.classList.add('sort-active');
      arrow.textContent = sortDir === 1 ? '↑' : '↓';
    } else {
      th.classList.remove('sort-active');
      arrow.textContent = '↕';
    }
  });
}

function buildOwnerFilters() {
  const bar = document.getElementById('ownerFilterBar');
  if (!bar) return;

  // Count open tasks per owner
  const counts = {};
  tasks.forEach(t => {
    if (t.done) return;
    const owner = normalizeOwnerName(t.owner) || 'Sem dono';
    counts[owner] = (counts[owner] || 0) + 1;
  });

  // All unique owners (open + done), sorted by open-task count desc
  const allOwners = [...new Set(tasks.map(t => normalizeOwnerName(t.owner) || 'Sem dono'))]
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

  // Preserve the selected filter across transient reloads.
  if (ownerFilter && !allOwners.includes(ownerFilter)) allOwners.unshift(ownerFilter);

  const totalOpen = tasks.filter(t => !t.done).length;

  bar.innerHTML = '';

  // Label
  const lbl = document.createElement('span');
  lbl.className = 'owner-filter-label';
  lbl.textContent = 'Filtrar:';
  bar.appendChild(lbl);

  // "Todos" pill
  const allPill = document.createElement('button');
  allPill.type = 'button';
  allPill.className = 'owner-pill' + (ownerFilter === null ? ' active' : '');
  allPill.innerHTML = `Todos <span class="pill-count">${totalOpen}</span>`;
  allPill.setAttribute('aria-pressed', ownerFilter === null ? 'true' : 'false');
  allPill.addEventListener('click', () => { ownerFilter = null; saveUiState(); buildOwnerFilters(); renderTasks(); });
  bar.appendChild(allPill);

  // One pill per owner
  allOwners.forEach(owner => {
    const openCount = counts[owner] || 0;
    if (openCount === 0 && owner !== ownerFilter) return; // hide owners with no open tasks (unless active)
    const firstName = owner.split(' ')[0];
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'owner-pill' + (ownerFilter === owner ? ' active' : '');
    pill.setAttribute('aria-pressed', ownerFilter === owner ? 'true' : 'false');
    pill.title = owner;
    pill.innerHTML = `${esc(firstName)} <span class="pill-count">${openCount}</span>`;
    pill.addEventListener('click', () => {
      ownerFilter = (ownerFilter === owner) ? null : owner;
      saveUiState();
      buildOwnerFilters();
      renderTasks();
    });
    bar.appendChild(pill);
  });
}

function renderTasks() {
  const openBody = document.getElementById('tbodyOpen');
  const doneBody = document.getElementById('tbodyDone');
  if (!openBody || !doneBody) return;

  openBody.innerHTML = '';
  doneBody.innerHTML = '';
  updateSortHeaders();
  buildOwnerFilters();
  const nextWeekBoundary = nextWeekStart();
  const nextWeekLabel = nextWeekBoundary.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  let insertedNextWeekDivider = false;

  sortedTasks(tasks).forEach(t => {
    t.owner = normalizeOwnerName(t.owner);
    if (ownerFilter && t.owner !== ownerFilter) return;
    t.date = formatTaskDate(t.date) || String(t.date || '').trim();
    const due = parseTaskDate(t.date);
    const isOverdue = !!(due && !t.done && due < new Date(new Date().setHours(0, 0, 0, 0)));
    const priorityClass = t.priorityRank ? ` priority-${t.priorityRank}` : '';
    const tr = document.createElement('tr');
    tr.className = 'todo-row' + (t.done ? ' done' : '') + (isOverdue ? ' overdue' : '') + priorityClass;
    const meta = [];
    if (t.priorityRank) meta.push(`<span class="task-meta-chip top${t.priorityRank}">Top ${t.priorityRank}</span>`);
    if (isOverdue) meta.push(`<span class="task-meta-chip overdue">Atrasada</span>`);
    if (t.updatedAt) {
      const dt = new Date(t.updatedAt);
      if (!Number.isNaN(dt.getTime())) meta.push(`<span class="task-meta-chip">Atualizada ${dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>`);
    }
    tr.innerHTML = `
      <td><div class="chk-wrap">
        <input type="checkbox" class="chk" data-id="${t.id}" ${t.done ? 'checked' : ''} />
      </div></td>
      <td>
        <div class="task-id">${esc(t.id)}</div>
        <div class="todo-task">${esc(t.task)}</div>
        ${t.comment ? `<div class="todo-comment">Obs: ${esc(t.comment)}</div>` : ''}
        ${t.warn    ? `<div class="todo-warn">${esc(t.warn)}</div>` : ''}
        ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
      </td>
      <td><span class="todo-cell-compact todo-owner">${esc(t.owner)}</span></td>
      <td><span class="todo-cell-compact todo-date">${esc(t.date)}</span></td>
      <td>
        <select class="tier-select ${t.done ? 'done' : t.tier}" data-tier-id="${t.id}">
          <option value="t1" ${(!t.done && t.tier==='t1') ? 'selected' : ''}>A fazer</option>
          <option value="t2" ${(!t.done && t.tier==='t2') ? 'selected' : ''}>Fazendo</option>
          <option value="done" ${t.done ? 'selected' : ''}>Conclu\u00EDdo</option>
        </select>
      </td>
      <td>
        <select class="tier-select" data-priority-id="${t.id}" ${t.done ? 'disabled' : ''}>
          <option value="" ${!t.priorityRank ? 'selected' : ''}>-</option>
          <option value="1" ${t.priorityRank===1 ? 'selected' : ''}>Top 1</option>
          <option value="2" ${t.priorityRank===2 ? 'selected' : ''}>Top 2</option>
          <option value="3" ${t.priorityRank===3 ? 'selected' : ''}>Top 3</option>
        </select>
      </td>
      <td><button type="button" class="row-edit-btn" data-edit-id="${t.id}">Editar</button></td>
	    `;

    if (t.done) {
      doneBody.appendChild(tr);
      return;
    }

    if (!insertedNextWeekDivider && sortCol === 'date' && sortDir === 1 && due && due >= nextWeekBoundary) {
      const divider = document.createElement('tr');
      divider.className = 'todo-week-separator';
      divider.innerHTML = `
        <td colspan="7">
          <div class="todo-week-separator-line">
            <span class="todo-week-separator-badge">
              <span class="todo-week-separator-dot"></span>
              Próxima semana · ${esc(nextWeekLabel)}
            </span>
          </div>
        </td>
      `;
      openBody.appendChild(divider);
      insertedNextWeekDivider = true;
    }

    openBody.appendChild(tr);
  });

  document.querySelectorAll('.tier-select[data-tier-id]').forEach(sel => {
    sel.addEventListener('change', async e => {
      const id = e.target.dataset.tierId;
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      const prev = { ...task };
      const v = e.target.value;
      if (v === 'done') {
        task.done = true;
        task.tier = 'done';
        task.tierLabel = 'Conclu\u00EDdo';
        task.priorityRank = null;
        task.completedAt = new Date().toISOString();
        task.updatedAt = new Date().toISOString();
      } else {
        task.done = false;
        task.completedAt = null;
        task.updatedAt = new Date().toISOString();
        task.tier = v;
        task.tierLabel = v === 't1' ? 'A fazer' : 'Fazendo';
      }
      const ok = await applyPatchWithRollback(
        { id: task.id, done: task.done, tier: task.tier },
        () => Object.assign(task, prev),
        'Status atualizado (SSOT ok)',
        'Falha ao salvar status no SSOT'
      );
      if (!ok) { renderTasks(); return; }
      _rememberTaskMutation('upsert', task);
      enforceWeeklyTop3(tasks);
      save(); renderTasks();
    });
  });

  document.querySelectorAll('select[data-priority-id]').forEach(sel => {
    sel.addEventListener('change', async e => {
      const id = e.target.dataset.priorityId;
      const task = tasks.find(t => t.id === id);
      if (!task || task.done) return;
      const prev = { ...task };
      const prevRanks = tasks.map(t => ({ id: t.id, priorityRank: t.priorityRank }));
      const chosen = e.target.value ? Number(e.target.value) : null;
      if (chosen) {
        tasks.forEach(other => {
          if (other.id !== id && other.priorityRank === chosen) other.priorityRank = null;
        });
      }
      task.priorityRank = chosen;
      task.updatedAt = new Date().toISOString();
      const ok = await applyPatchWithRollback(
        { id: task.id, priorityRank: task.priorityRank },
        () => {
          Object.assign(task, prev);
          prevRanks.forEach(pr => {
            const t = tasks.find(x => x.id === pr.id);
            if (t) t.priorityRank = pr.priorityRank;
          });
        },
        'Prioridade atualizada (SSOT ok)',
        'Falha ao salvar prioridade no SSOT'
      );
      if (!ok) { renderTasks(); return; }
      _rememberTaskMutation('upsert', task);
      enforceWeeklyTop3(tasks);
      save(); renderTasks();
    });
  });

  document.querySelectorAll('.chk').forEach(cb => {
    cb.addEventListener('change', async e => {
      const id = e.target.dataset.id;
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      const prev = { ...task };
      task.done = e.target.checked;
      task.updatedAt = new Date().toISOString();
      if (task.done) {
        task.tier = 'done';
        task.tierLabel = 'Conclu\u00EDdo';
        task.priorityRank = null;
        task.completedAt = new Date().toISOString();
        task.updatedAt = new Date().toISOString();
      } else {
        const s = SEED.find(s => s.id === id);
        task.completedAt = null;
        task.tier      = s ? (s.tier === 'done' ? 't2' : s.tier) : 't2';
        task.tierLabel = s ? (s.tier === 't1' ? 'A fazer' : 'Fazendo') : 'A fazer';
      }
      const ok = await applyPatchWithRollback(
        { id: task.id, done: task.done, tier: task.tier },
        () => Object.assign(task, prev),
        'Conclusão salva (SSOT ok)',
        'Falha ao salvar conclusão no SSOT'
      );
      if (!ok) { renderTasks(); counter(); return; }
      _rememberTaskMutation('upsert', task);
      enforceWeeklyTop3(tasks);
      save(); renderTasks(); counter();
    });
  });

  document.querySelectorAll('button[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.dataset.editId;
      editTask(id);
    });
  });
  const openCounter = document.getElementById('openCounter');
  const doneCounter = document.getElementById('doneCounter');
  if (openCounter) openCounter.textContent = String(tasks.filter(t => !t.done).length);
  if (doneCounter) doneCounter.textContent = String(tasks.filter(t => t.done).length);

  setTaskView(taskView);
  renderTopPriorities();
  renderCriticalAlerts();
  renderDataHealth();
  renderWins();
  counter();
}

function counter() {
  const d = tasks.filter(t => t.done).length;
  const n = tasks.length;
  document.getElementById('taskCounter').textContent =
    `${n} tarefa${n!==1?'s':''} \u2022 ${d} conclu\u00EDda${d!==1?'s':''}`;
}

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

function formatBRL(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR');
}

function renderKpis() {
  const kpis  = (BOOKED_META_SRC && BOOKED_META_SRC.kpis) ? BOOKED_META_SRC.kpis : {};
  const month = (BOOKED_META_SRC && BOOKED_META_SRC.month) ? BOOKED_META_SRC.month : null;

  const elEscolas = document.getElementById('kpiMetaEscolas');
  if (elEscolas && kpis.meta_anual_escolas)
    elEscolas.textContent = kpis.meta_anual_escolas.toLocaleString('pt-BR');

  const elMensal = document.getElementById('kpiMetaMensal');
  const elMensalEyebrow = document.getElementById('kpiMetaMensalEyebrow');
  if (elMensal && kpis.meta_mensal_escolas)
    elMensal.textContent = kpis.meta_mensal_escolas.toLocaleString('pt-BR');
  if (elMensalEyebrow && month)
    elMensalEyebrow.textContent = 'Meta ' + month.charAt(0).toUpperCase() + month.slice(1);

  const elSdr    = document.getElementById('kpiEfetividadeSDR');
  const elSdrSub = document.getElementById('kpiEfetividadeSDRSub');
  const metaSdr  = kpis.sdr_meta_pct || 12;
  const atual    = kpis.efetividade_sdr_pct;
  if (elSdr) {
    if (atual != null) {
      elSdr.textContent = atual.toFixed(2).replace('.', ',') + '%';
      elSdr.className   = 'kpi-value ' + (atual >= metaSdr ? '' : 'alert');
    } else {
      elSdr.textContent = '\u2014';
      elSdr.className   = 'kpi-value';
    }
  }
  if (elSdrSub) {
    const gap = atual != null
      ? ' \u2022 gap de ' + (metaSdr - atual).toFixed(2).replace('.', ',') + ' pp'
      : '';
    elSdrSub.innerHTML = `<span class="up">&uarr; meta ${metaSdr}%</span>${gap}`;
  }

  const elDateSub = document.getElementById('todosHdSub');
  if (elDateSub) {
    const now  = new Date();
    const opts = { day: '2-digit', month: 'short', year: 'numeric' };
    elDateSub.textContent = 'Daily Gest\u00E3o Comercial \u2014 ' +
      now.toLocaleDateString('pt-BR', opts);
  }
}

function renderBookedMeta() {
  const stretch = document.getElementById('bookedStretch');
  const monthLabel = document.getElementById('bookedMonthLabel');
  const body = document.getElementById('bookedBucketsBody');
  const opsAlert = document.getElementById('bookedOpsAlert');
  if (!stretch || !monthLabel || !body || !opsAlert) return;

  if (!BOOKED_META_SRC || typeof BOOKED_META_SRC.target !== 'number') {
    stretch.textContent = 'Sem dados';
    monthLabel.textContent = 'Meta Oficial (Stretch) - aguardando backend';
    opsAlert.classList.add('show');
    opsAlert.textContent = 'CRITICO: sem dados do backend para metas mensais e RR/SDR/DIA.';
    body.innerHTML = '<tr><td colspan="5">Sem dados de meta stretch carregados.</td></tr>';
    return;
  }

  const month = BOOKED_META_SRC.month || 'M\u00EAs atual';
  monthLabel.textContent = `Meta Oficial (Stretch) - ${month}`;
  stretch.textContent = formatBRL(BOOKED_META_SRC.target);

  const buckets = Array.isArray(BOOKED_META_SRC.buckets) ? BOOKED_META_SRC.buckets : [];
  const missing = buckets.filter(b => typeof b.rr_sdr_dia_target !== 'number');
  if (missing.length > 0) {
    opsAlert.classList.add('show');
    opsAlert.textContent = `CRITICO: RR/SDR/DIA alvo ausente em ${month} para: ${missing.map(b => b.label || 'Baldinho').join(', ')}.`;
  } else {
    opsAlert.classList.remove('show');
    opsAlert.textContent = '';
  }

  body.innerHTML = buckets.map(b => {
    const rr = (typeof b.rr_sdr_dia_target === 'number')
      ? String(b.rr_sdr_dia_target).replace('.', ',')
      : 'AUSENTE';
    return `<tr>
      <td>${esc(b.label || 'Baldinho')}</td>
      <td>${formatBRL(b.target || 0)}</td>
      <td>${(typeof b.schools_target === 'number') ? Number(b.schools_target).toLocaleString('pt-BR') : '-'}</td>
      <td>${(typeof b.rr_target === 'number') ? Number(b.rr_target).toLocaleString('pt-BR') : '-'}</td>
      <td>${rr}</td>
    </tr>`;
  }).join('');
}

/*  EXPORT  */

function editTask(id) {
  openTaskModal('edit', id);
}

function addTask() {
  if (IS_READONLY) return;
  if (isMaintenanceActive()) {
    toast(maintenanceMessage(), 'err');
    return;
  }
  openTaskModal('create');
}

function toast(msg, tone) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('ok', 'err');
  if (tone === 'ok' || tone === 'err') el.classList.add(tone);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/*  RENDER WINS  */
function renderWins() {
  const el = document.getElementById('winsList');
  if (!el) return;
  /* Regra dura: wins exibidos sempre pertencem à semana corrente (segunda a domingo). */
  const backendWins = (BOOKED_META_SRC && Array.isArray(BOOKED_META_SRC.wins))
    ? BOOKED_META_SRC.wins.filter(w => isDateInCurrentWeek(w.data))
    : [];
  const localWins = localWeeklyWins(tasks);
  const merged = [...localWins, ...backendWins, ...WINS].filter(w => isDateInCurrentWeek(w.data));
  const seen = new Set();
  const source = merged.filter(w => {
    const k = `${w.titulo}|${w.dri}|${w.data}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  el.innerHTML = source.map(w => `
    <div class="win-item">
      <div class="win-emoji">${w.emoji}</div>
      <div class="win-body">
        <div class="win-title">${esc(stripLeadingBracketTag(w.titulo))}</div>
        <div class="win-desc">${esc(w.desc)}</div>
        <div class="win-foot">
          <span class="win-dri">${esc(w.dri)}</span>
          <span class="win-date">${esc(w.data)}</span>
        </div>
      </div>
    </div>`).join('');
  const badge = document.getElementById('winsCount');
  if (badge) badge.textContent = source.length;
}

function renderIntel() {
  const summaryEl      = document.getElementById('intelSummaryList');
  const criticasEl     = document.getElementById('criticasList');
  const criticasArchEl = document.getElementById('criticasArchivedList');
  const aprendizadosEl = document.getElementById('aprendizadosList');
  const arquivadosEl   = document.getElementById('aprendizadosArchivedList');
  if (!summaryEl || !criticasEl || !criticasArchEl || !aprendizadosEl || !arquivadosEl) return;

  const intelSource = (REQUIRE_LOGIN_FOR_READ && !_sbSession) ? DEMO_INTEL : INTEL_SRC;
  if (!intelSource) {
    const msg = '<span style="color:var(--t3);font-size:12px">intel_ssot.js não carregado.</span>';
    summaryEl.innerHTML = msg;
    criticasEl.innerHTML = msg;
    criticasArchEl.innerHTML = msg;
    aprendizadosEl.innerHTML = msg;
    arquivadosEl.innerHTML = msg;
    return;
  }

  const summaries = (intelSource.resumos_tematicos || []).slice(0, 4);
  if (!summaries.length) {
    summaryEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Sem resumos temáticos disponíveis.</span>';
  } else {
    summaryEl.innerHTML = `<div class="intel-summary-list">${summaries.map(row => {
      const chips = [
        row.contagem_aprendizados ? `<span class="intel-summary-chip">${esc(row.contagem_aprendizados)} aprendizados</span>` : '',
        row.contagem_alertas_abertos ? `<span class="intel-summary-chip">${esc(row.contagem_alertas_abertos)} riscos abertos</span>` : '',
        row.ultima_atualizacao ? `<span class="intel-summary-chip">${esc(row.ultima_atualizacao)}</span>` : '',
      ].filter(Boolean).join('');
      const refs = [];
      if (Array.isArray(row.aprendizados_ids) && row.aprendizados_ids.length) refs.push(`Insights: ${row.aprendizados_ids.slice(0, 3).map(esc).join(', ')}`);
      if (Array.isArray(row.alertas_ids) && row.alertas_ids.length) refs.push(`Alertas: ${row.alertas_ids.slice(0, 2).map(esc).join(', ')}`);
      return `<div class="intel-summary-item">
        <div class="intel-summary-top">
          <div class="intel-summary-title">${esc(row.titulo || row.tema || 'Tema')}</div>
          <div class="intel-summary-meta">${chips}</div>
        </div>
        <div class="intel-summary-text">${esc(row.resumo_executivo || '')}</div>
        ${refs.length ? `<div class="intel-summary-links">${refs.map(esc).join(' • ')}</div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  // --- Alertas ativos ---
  const criticas = (intelSource.criticas_ativas || []).filter(c => !c.status || c.status === 'aberta');
  if (!criticas.length) {
    criticasEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Nenhum alerta ativo no momento.</span>';
  } else {
    criticasEl.innerHTML = criticas.map(c => {
      const stripeCls = c.prioridade === 'critica' ? '' : c.prioridade === 'alta' ? 'alta' : 'media';
      const chipCls   = stripeCls;
      const label     = c.prioridade === 'critica' ? 'Crítico' : c.prioridade === 'alta' ? 'Alta' : 'Média';
      return `<div class="critica-item">
        <div class="critica-stripe ${stripeCls}"></div>
        <div class="critica-body">
          <div class="critica-title">${esc(c.titulo)}</div>
          <div class="critica-text">${esc(c.critica)}</div>
          ${c.acao_sugerida ? `<div class="critica-acao">→ ${esc(c.acao_sugerida)}</div>` : ''}
          <div class="critica-footer">
            <span class="critica-chip ${chipCls}">${label}</span>
            ${c.id ? `<span class="intel-id alerta">ID: ${esc(c.id)}</span>` : ''}
            ${c.dri ? `<span class="critica-dri">DRI: ${esc(c.dri)}</span>` : ''}
            <span class="critica-dri">${esc(c.data || '')}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // --- Insights da Claudete (ativos) ---
  const aprendizados = (intelSource.aprendizados || [])
    .filter(a => !a.status || a.status === 'ativo')
    .slice().reverse().slice(0, 6);
  if (!aprendizados.length) {
    aprendizadosEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Sem aprendizados registrados.</span>';
  } else {
    aprendizadosEl.innerHTML = aprendizados.map(a => {
      const stripeCls = a.confianca === 'alta' ? '' : a.confianca === 'media' ? 'media' : 'baixa';
      const tags = (a.aplicavel_a || []).map(t => `<span class="aprendizado-tag">${esc(t)}</span>`).join('');
      return `<div class="aprendizado-item">
        <div class="aprendizado-stripe ${stripeCls}"></div>
        <div class="aprendizado-body">
        <div class="aprendizado-insight">${esc(a.insight)}</div>
        ${a.evidencia ? `<div class="aprendizado-evidencia">&#128202; ${esc(a.evidencia)}</div>` : ''}
        ${a.acao_sugerida ? `<div class="aprendizado-acao">→ ${esc(a.acao_sugerida)}</div>` : ''}
        ${a.fonte ? `<div class="aprendizado-evidencia" style="color:var(--t4);margin-top:3px">Fonte: ${esc(a.fonte)}</div>` : ''}
        ${a.id ? `<div class="aprendizado-evidencia" style="margin-top:3px"><span class="intel-id insight">ID: ${esc(a.id)}</span></div>` : ''}
          ${tags ? `<div class="aprendizado-tags">${tags}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // --- Alertas arquivados ---
  const criticasArch = (intelSource.criticas_ativas || []).filter(c => c.status && c.status !== 'aberta');
  if (!criticasArch.length) {
    criticasArchEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Sem alertas arquivados.</span>';
  } else {
    criticasArchEl.innerHTML = criticasArch.map(c => {
      const stripeCls = c.prioridade === 'critica' ? '' : c.prioridade === 'alta' ? 'alta' : 'media';
      const chipCls   = stripeCls;
      const label     = c.prioridade === 'critica' ? 'Crítico' : c.prioridade === 'alta' ? 'Alta' : 'Média';
      const statusTxt = c.status ? `Status: ${c.status}` : '';
      return `<div class="critica-item">
        <div class="critica-stripe ${stripeCls}"></div>
        <div class="critica-body">
          <div class="critica-title">${esc(c.titulo)}</div>
          <div class="critica-text">${esc(c.critica)}</div>
          ${c.acao_sugerida ? `<div class="critica-acao">→ ${esc(c.acao_sugerida)}</div>` : ''}
          <div class="critica-footer">
            <span class="critica-chip ${chipCls}">${label}</span>
            ${c.id ? `<span class="intel-id alerta">ID: ${esc(c.id)}</span>` : ''}
            ${c.dri ? `<span class="critica-dri">DRI: ${esc(c.dri)}</span>` : ''}
            <span class="critica-dri">${esc(c.data || '')}</span>
          </div>
          ${statusTxt ? `<div class="critica-dri" style="margin-top:4px">`+esc(statusTxt)+`</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // --- Insights arquivados ---
  const arquivados = (intelSource.aprendizados || [])
    .filter(a => a.status && a.status !== 'ativo')
    .slice().reverse().slice(0, 10);
  if (!arquivados.length) {
    arquivadosEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Sem aprendizados arquivados.</span>';
  } else {
    arquivadosEl.innerHTML = arquivados.map(a => {
      const stripeCls = a.confianca === 'alta' ? '' : a.confianca === 'media' ? 'media' : 'baixa';
      const tags = (a.aplicavel_a || []).map(t => `<span class="aprendizado-tag">${esc(t)}</span>`).join('');
      const statusTxt = a.status ? `Status: ${a.status}` : '';
      return `<div class="aprendizado-item">
        <div class="aprendizado-stripe ${stripeCls}"></div>
        <div class="aprendizado-body">
        <div class="aprendizado-insight">${esc(a.insight)}</div>
        ${a.evidencia ? `<div class="aprendizado-evidencia">&#128202; ${esc(a.evidencia)}</div>` : ''}
        ${a.acao_sugerida ? `<div class="aprendizado-acao">→ ${esc(a.acao_sugerida)}</div>` : ''}
        ${a.fonte ? `<div class="aprendizado-evidencia" style="color:var(--t4);margin-top:3px">Fonte: ${esc(a.fonte)}</div>` : ''}
        ${a.id ? `<div class="aprendizado-evidencia" style="margin-top:3px"><span class="intel-id insight">ID: ${esc(a.id)}</span></div>` : ''}
        ${statusTxt ? `<div class="aprendizado-evidencia" style="margin-top:3px">`+esc(statusTxt)+`</div>` : ''}
          ${tags ? `<div class="aprendizado-tags">${tags}</div>` : ''}
        </div>
      </div>`;
    }).join('');
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
  // No GitHub Pages: SSOT vem do Supabase (após login), não de arquivo local.
  // Mostrar "ok" quando logado, "aguardando login" quando não.
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
