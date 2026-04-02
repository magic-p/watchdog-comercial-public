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
  if (!s) return { ok: false, msg: 'Prazo obrigatÃ³rio.' };
  if (!parseTaskDate(s)) return { ok: false, msg: 'Formato invÃ¡lido. Use dd/mmm, dd/mm ou dd/mm/aaaa.' };
  return { ok: true, msg: `Prazo vÃ¡lido. ExibiÃ§Ã£o padrÃ£o: ${formatTaskDate(s)}.` };
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
  if (/^tarefa sem t[iÃ­]tulo$/i.test(title)) return false;
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
  return /^tarefa sem t[iÃ­]tulo$/i.test(title);
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
    _backendAlerts = null; // motor offline â€” usa fallback local
  } finally {
    _alertsRefreshInFlight = false;
    if (_alertsRefreshQueued && !_alertsRefreshTimer) {
      _scheduleAlertsRefresh(220, _alertsRefreshReason);
    }
  }
}
