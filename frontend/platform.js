/* ── Supabase client ───────────────────────────────────────── */
const _sbKey = window.SUPABASE_PUBLISHABLE_KEY || window.SUPABASE_ANON_KEY || '';
const _sbConfigured = !!(window.SUPABASE_URL && _sbKey);
const _sb = _sbConfigured
  ? supabase.createClient(window.SUPABASE_URL, _sbKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;
let _sbSession = null;
let _sbRealtimeChannel = null;
let _lastWriteError = '';
let _sessionRefreshPromise = null;
let _lastSessionRefreshAttemptAt = 0;
const _SESSION_MIN_VALIDITY_MS = 90_000;
const _SESSION_REFRESH_THROTTLE_MS = 10_000;

function _setWriteError(msg) {
  _lastWriteError = msg || '';
}

function _getWriteError(fallback) {
  return _lastWriteError || fallback;
}

function _hasAuthSession() {
  return !!_sbSession?.access_token;
}

function _sessionExpiresAtMs(session) {
  const exp = Number(session?.expires_at || 0);
  return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
}

function _sessionExpiresSoon(session, minValidityMs = _SESSION_MIN_VALIDITY_MS) {
  const expiresAt = _sessionExpiresAtMs(session);
  if (!expiresAt) return false;
  return (expiresAt - Date.now()) <= Math.max(5_000, Number(minValidityMs) || _SESSION_MIN_VALIDITY_MS);
}

async function _readCurrentSession() {
  if (!_sb) return _sbSession;
  try {
    const { data, error } = await _sb.auth.getSession();
    if (error) throw error;
    if (data?.session) {
      _sbSession = data.session;
      return data.session;
    }
    _sbSession = null;
    return null;
  } catch (err) {
    console.warn('[Auth] getSession falhou:', String(err?.message ?? err));
    return _sbSession;
  }
}

async function _ensureFreshSession(reason = 'unknown', opts = {}) {
  if (!_sb) return _sbSession;
  const force = !!opts.force;
  const minValidityMs = Number(opts.minValidityMs) || _SESSION_MIN_VALIDITY_MS;
  let session = _sbSession;
  if (!session) session = await _readCurrentSession();
  if (!session) return null;
  const needsRefresh = force || _sessionExpiresSoon(session, minValidityMs);
  if (!needsRefresh) return session;
  if (_sessionRefreshPromise) return _sessionRefreshPromise;
  const now = Date.now();
  if (!force && (now - _lastSessionRefreshAttemptAt) < _SESSION_REFRESH_THROTTLE_MS) {
    return _sbSession || session;
  }
  _lastSessionRefreshAttemptAt = now;
  _sessionRefreshPromise = (async () => {
    try {
      const { data, error } = await _sb.auth.refreshSession();
      if (error) throw error;
      if (data?.session) {
        _sbSession = data.session;
        return data.session;
      }
    } catch (err) {
      console.warn(`[Auth] refreshSession falhou (${reason}):`, String(err?.message ?? err));
    } finally {
      _sessionRefreshPromise = null;
    }
    return _readCurrentSession();
  })();
  return _sessionRefreshPromise;
}

async function _sessionAuthHeaders(extra = {}, reason = 'unknown', opts = {}) {
  const session = await _ensureFreshSession(reason, opts);
  if (!session?.access_token) return { ...extra };
  return { ...extra, 'Authorization': `Bearer ${session.access_token}` };
}

async function _fetchWithAuthRetry(url, fetchOptions = {}, authOptions = {}) {
  const baseHeaders = fetchOptions.headers || {};
  const reason = String(authOptions.reason || 'protected_fetch');
  const headers = await _sessionAuthHeaders(baseHeaders, reason, authOptions);
  let response = await fetch(url, { ...fetchOptions, headers });
  if (response.status !== 401 || !_sb) return response;
  const retryHeaders = await _sessionAuthHeaders(
    baseHeaders,
    _mergeRefreshReason(reason, 'retry_401'),
    { ...authOptions, force: true, minValidityMs: 30_000 },
  );
  const oldAuth = String(headers.Authorization || '');
  const newAuth = String(retryHeaders.Authorization || '');
  if (!newAuth || newAuth === oldAuth) return response;
  return fetch(url, { ...fetchOptions, headers: retryHeaders });
}

function _authFailureMessage(payload, fallback = 'Faça login novamente para continuar.') {
  const raw = String(payload?.error || '').trim();
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (normalized.includes('jwt invalido') || normalized.includes('jwt inválido') || normalized.includes('expirado')) {
    return 'Sua sessão expirou ou ainda não conseguiu ser renovada. Recarregue a página e faça login novamente.';
  }
  if (normalized.includes('unauthorized')) {
    return 'Autenticação indisponível no momento. Recarregue a página e tente novamente.';
  }
  return raw;
}

/* ── API layer (Supabase → motor local → readonly) ────────── */
const API_URL = window.location.protocol === 'file:' ||
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5678'
  : 'https://watchdog-comercial-production.up.railway.app';
const IS_LOCAL = (
  window.location.protocol === 'file:' ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
);
/* IS_READONLY: true apenas quando não há motor local NEM Supabase configurado */
const IS_READONLY = !IS_LOCAL && !_sbConfigured;

function _canWrite() {
  return _hasAuthSession();
}

function _makeRequestId(prefix = 'req') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/* ── Motor local (fallback quando IS_LOCAL) ────────────────── */
async function _motorPatch(patch) {
  try {
    const session = await _ensureFreshSession('task_patch_preflight');
    const actor = session?.user?.email?.split('@')[0] || 'dashboard';
    if (!session?.access_token) {
      _setWriteError('Login necessário para editar tarefas.');
      return false;
    }
    const request_id = _makeRequestId('patch');
    const r = await _fetchWithAuthRetry(`${API_URL}/api/todos/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, actor, request_id })
    }, { reason: 'task_patch' });
    let payload = null;
    try { payload = await r.json(); } catch {}
    if (_consumeMaintenancePayload(payload)) return false;
    if (!r.ok) {
      let msg = 'Motor local: erro ao salvar';
      if (payload && payload.error) msg = 'Motor local: ' + payload.error;
      _setWriteError(msg);
      return false;
    }
    _setWriteError('');
    if (_sbSession) _scheduleTasksRefresh(true, 120, 'task_write');
    return true;
  } catch (err) {
    _setWriteError('Motor local: ' + (err?.message || String(err)));
    return false;
  }
}

async function _motorCreate(task) {
  try {
    const session = await _ensureFreshSession('task_create_preflight');
    if (!session?.access_token) {
      _setWriteError('Login necessário para editar tarefas.');
      return false;
    }
    const request_id = _makeRequestId('create');
    const r = await _fetchWithAuthRetry(`${API_URL}/api/todos/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, task: task.task, owner: task.owner, date: task.date, comment: task.comment || null, request_id })
    }, { reason: 'task_create' });
    let payload = null;
    try { payload = await r.json(); } catch {}
    if (_consumeMaintenancePayload(payload)) return false;
    if (!r.ok) {
      let msg = 'Motor local: erro ao criar';
      if (payload && payload.error) msg = 'Motor local: ' + payload.error;
      _setWriteError(msg);
      return false;
    }
    _setWriteError('');
    if (_sbSession) _scheduleTasksRefresh(true, 120, 'task_write');
    return true;
  } catch (err) {
    _setWriteError('Motor local: ' + (err?.message || String(err)));
    return false;
  }
}

/* ── Funções públicas (usadas pelo resto do dashboard) ──────── */
async function apiCreate(task) {
  if (isMaintenanceActive()) {
    _setWriteError(maintenanceMessage());
    toast(maintenanceMessage(), 'err');
    return false;
  }
  if (!_canWrite()) {
    _setWriteError('Login necessário para editar tarefas.');
    toast('Faça login para criar/editar tarefas.', 'err');
    return false;
  }
  return _motorCreate(task);
}

async function apiPatch(patch) {
  if (isMaintenanceActive()) {
    _setWriteError(maintenanceMessage());
    toast(maintenanceMessage(), 'err');
    return false;
  }
  if (!_canWrite()) {
    _setWriteError('Login necessário para editar tarefas.');
    toast('Faça login para criar/editar tarefas.', 'err');
    return false;
  }
  return _motorPatch(patch);
}

async function apiCreateConfirm(task, okMsg, errMsg) {
  const ok = await apiCreate(task);
  toast(ok ? okMsg : _getWriteError(errMsg), ok ? 'ok' : 'err');
  return ok;
}

async function apiPatchConfirm(patch, okMsg, errMsg) {
  const ok = await apiPatch(patch);
  toast(ok ? okMsg : _getWriteError(errMsg), ok ? 'ok' : 'err');
  return ok;
}

async function applyCreateWithRollback(task, rollbackFn, okMsg, errMsg) {
  const ok = await apiCreateConfirm(task, okMsg, errMsg);
  if (!ok && rollbackFn) rollbackFn();
  return ok;
}

async function applyPatchWithRollback(patch, rollbackFn, okMsg, errMsg) {
  const ok = await apiPatchConfirm(patch, okMsg, errMsg);
  if (!ok && rollbackFn) rollbackFn();
  return ok;
}

function setMotorStatus(online) {
  const el = document.getElementById('motorStatus');
  if (!el) return;
  el.innerHTML = online ? '&#11044; Motor online' : '&#11044; Motor offline';
  el.classList.toggle('online', online);
  el.classList.toggle('offline', !online);
  if (typeof _updateSysStatus === 'function') _updateSysStatus();
}

function setSsotStatus(hasSsot) {
  const el = document.getElementById('ssotStatus');
  if (!el) return;
  el.style.display = 'inline-flex';
  if (hasSsot) {
    el.textContent = 'SSOT: ok';
    el.classList.remove('warn');
  } else {
    el.textContent = 'SSOT: fallback';
    el.classList.add('warn');
  }
}

/*  DATA  */
const STORAGE_KEY = 'watchdog_v3';
const PUBLIC_SHELL_MODE = 'demo_sanitized_only';
const BOOKED_META = null;
const TODOS_SSOT = [];
const HAS_BACKEND_TODOS = false;
const REQUIRE_LOGIN_FOR_READ = true;
const DATA_HEALTH = null;
const CAMPANHAS_DATA = null;
const INTEL_DATA = null;

const FALLBACK_SEED = [];

let _maintenanceState = {
  active: false,
  reason: '',
  message: '',
  started_at: '',
  started_by: '',
};
let _operationalState = {
  degraded: false,
  degradation_reasons: [],
  mode: 'authenticated_api_only',
  option_c: {
    status: 'complete',
    public_shell_mode: PUBLIC_SHELL_MODE,
    public_artifacts_operational_dependency: false,
  },
  metrics: {},
  runbooks: [],
};

function maintenanceMessage() {
  const raw = String(_maintenanceState?.message || '').trim();
  if (raw) return raw;
  return 'Sistema temporariamente em manutencao. Uso congelado durante mudancas estruturais.';
}

function isMaintenanceActive() {
  return !!(_maintenanceState && _maintenanceState.active);
}

function _extractMaintenanceState(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.error === 'maintenance_mode' && payload.maintenance && typeof payload.maintenance === 'object') {
    return payload.maintenance;
  }
  if (payload.maintenance && typeof payload.maintenance === 'object') {
    return payload.maintenance;
  }
  return null;
}

function setMaintenanceState(state, opts = {}) {
  const next = (state && typeof state === 'object') ? state : { active: false };
  _maintenanceState = {
    active: !!next.active,
    reason: String(next.reason || '').trim(),
    message: String(next.message || '').trim(),
    started_at: String(next.started_at || '').trim(),
    started_by: String(next.started_by || '').trim(),
  };
  const active = !!_maintenanceState.active;
  const banner = document.getElementById('maintenanceBanner');
  const bannerText = document.getElementById('maintenanceBannerText');
  const addTaskBtn = document.getElementById('addTaskBtn');
  const attachBtn = document.getElementById('chatAttachBtn');
  const sendBtn = document.getElementById('chatSend');
  const chatInput = document.getElementById('chatInput');
  const fab = document.getElementById('claudeteFab');
  document.body.classList.toggle('maintenance-mode', active);
  if (banner) banner.hidden = !active;
  if (bannerText) bannerText.textContent = maintenanceMessage();
  if (addTaskBtn) addTaskBtn.disabled = active;
  if (attachBtn) attachBtn.disabled = active;
  if (chatInput) chatInput.disabled = active;
  if (sendBtn) {
    sendBtn.disabled = active || ((!chatInput?.value?.trim?.() && !window._chatAttachFiles?.length) || window._chatBusy);
  }
  if (fab) {
    fab.classList.toggle('disabled', active);
    fab.title = active ? maintenanceMessage() : 'Conversar com Claudete';
  }
  if (active) {
    const drawer = document.getElementById('claudeteDrawer');
    if (drawer) drawer.classList.remove('open');
    _setWriteError(maintenanceMessage());
    if (opts.toast !== false) toast(maintenanceMessage(), 'err');
  } else if (!opts.keepWriteError) {
    _setWriteError('');
  }
  if (typeof _updateSysStatus === 'function') _updateSysStatus();
}

function _consumeMaintenancePayload(payload, opts = {}) {
  const state = _extractMaintenanceState(payload);
  if (!state || !state.active) return false;
  setMaintenanceState(state, opts);
  return true;
}

function setOperationalState(snapshot) {
  const next = (snapshot && typeof snapshot === 'object') ? snapshot : {};
  _operationalState = {
    degraded: !!next.degraded,
    degradation_reasons: Array.isArray(next.degradation_reasons) ? next.degradation_reasons.slice(0, 6) : [],
    mode: String(next.mode || 'authenticated_api_only'),
    option_c: (next.option_c && typeof next.option_c === 'object') ? { ...next.option_c } : {
      status: 'complete',
      public_shell_mode: PUBLIC_SHELL_MODE,
      public_artifacts_operational_dependency: false,
    },
    metrics: (next.metrics && typeof next.metrics === 'object') ? { ...next.metrics } : {},
    runbooks: Array.isArray(next.runbooks) ? next.runbooks.slice(0, 6) : [],
  };
  if (typeof _updateSysStatus === 'function') _updateSysStatus();
}

function getOperationalState() {
  return _operationalState;
}

async function refreshOperationalHealth(reason = 'unknown') {
  if (REQUIRE_LOGIN_FOR_READ && !_hasAuthSession()) {
    return _maintenanceState;
  }
  try {
    const r = await _fetchWithAuthRetry(`${API_URL}/api/todos/health?reason=${encodeURIComponent(String(reason || 'unknown'))}`, {
      headers: {},
      signal: AbortSignal.timeout(3000),
    }, { reason: `health_${reason}` });
    const data = await r.json();
    if (_consumeMaintenancePayload(data, { toast: false, keepWriteError: true })) {
      return _maintenanceState;
    }
    setMaintenanceState((data && data.maintenance) || { active: false }, { toast: false, keepWriteError: true });
    setOperationalState(data && data.operational);
    return _maintenanceState;
  } catch {
    return _maintenanceState;
  }
}

const DEMO_SEED = [
  {
    id: 'l001',
    task: 'Convencer o Bentinho a aceitar o onboarding do ciúme zero',
    owner: 'Machado de Assis',
    date: '12/mar',
    tier: 't1',
    tierLabel: 'A fazer',
    comment: 'Capitu exigiu NDA e um espelho retrovisor.',
    done: false,
    priorityRank: 1,
    updatedAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'l002',
    task: 'Operar o Menino Maluquinho sem perder a panela (risco crítico)',
    owner: 'Ziraldo',
    date: '09/mar',
    tier: 't1',
    tierLabel: 'A fazer',
    comment: 'Panela virou capacete de compliance.',
    done: false,
    priorityRank: 2,
    updatedAt: '2026-03-03T09:10:00Z',
  },
  {
    id: 'l003',
    task: 'Reunir a Turma da Mônica para deliberar sobre o Sansão',
    owner: 'Mauricio de Sousa',
    date: '10/mar',
    tier: 't2',
    tierLabel: 'Fazendo',
    comment: 'O coelho entrou no backlog.',
    done: false,
    priorityRank: 3,
    updatedAt: '2026-03-04T14:20:00Z',
  },
  {
    id: 'l004',
    task: 'Distribuir capas de invisibilidade sem sumir o orçamento',
    owner: 'J. K. Rowling',
    date: '11/mar',
    tier: 't2',
    tierLabel: 'Fazendo',
    comment: 'Hogwarts pediu nota fiscal encantada.',
    done: false,
    priorityRank: null,
    updatedAt: '2026-03-02T09:30:00Z',
  },
  {
    id: 'l005',
    task: 'Ajustar cadência do sertão sem mexer no clima',
    owner: 'Rachel de Queiroz',
    date: '08/mar',
    tier: 't1',
    tierLabel: 'A fazer',
    comment: 'Choveu, mas só no roadmap.',
    done: false,
    priorityRank: null,
    updatedAt: '2026-03-05T08:00:00Z',
  },
  {
    id: 'l006',
    task: 'Reescrever o briefing para que o mar entenda (urgente)',
    owner: 'Clarice Lispector',
    date: '07/mar',
    tier: 't2',
    tierLabel: 'Fazendo',
    comment: 'Silêncio estratégico aprovado.',
    done: false,
    priorityRank: null,
    updatedAt: '2026-03-06T11:00:00Z',
  },
  {
    id: 'l007',
    task: 'Auditar o “poema do dia” e quitar 7 beijos em atraso',
    owner: 'Vinicius de Moraes',
    date: '06/mar',
    tier: 't1',
    tierLabel: 'A fazer',
    comment: 'Soneto virou OKR.',
    done: false,
    priorityRank: null,
    updatedAt: '2026-03-01T08:00:00Z',
  },
  {
    id: 'l008',
    task: 'Liberar o passaporte do “Bisa Bia, Bisa Bel”',
    owner: 'Ana Maria Machado',
    date: '13/mar',
    tier: 't2',
    tierLabel: 'Fazendo',
    comment: 'Bisa pediu SLA com 3 gerações.',
    done: false,
    priorityRank: null,
    updatedAt: '2026-03-07T09:40:00Z',
  },
  {
    id: 'l009',
    task: 'Investigar a Droga da Obediência (suspeita de compliance rebelde)',
    owner: 'Pedro Bandeira',
    date: '05/mar',
    tier: 't1',
    tierLabel: 'A fazer',
    comment: 'Os Karas pediram sigilo.',
    done: false,
    priorityRank: null,
    updatedAt: '2026-03-02T08:00:00Z',
  },
  {
    id: 'l010',
    task: 'Marcar reunião com cem anos de atraso (agenda cheia)',
    owner: 'Gabriel García Márquez',
    date: '07/mar',
    tier: 'done',
    tierLabel: 'Concluído',
    comment: 'Choveu flores amarelas e um KPI sem origem.',
    done: true,
    priorityRank: null,
    updatedAt: '2026-03-07T12:00:00Z',
    completedAt: '2026-03-07T12:00:00Z',
  },
];

const DEMO_INTEL = {
  criticas_ativas: [
    {
      id: 'alerta-l01',
      data: '2026-03-09',
      titulo: 'Capitu saiu do CRM e levou o funil junto',
      critica: 'O pipeline está com ciúmes e se recusou a fechar o trimestre.',
      acao_sugerida: 'Convocar Dom Casmurro para revisão de evidências com lupa.',
      prioridade: 'critica',
      dri: 'Machado de Assis',
      status: 'aberta',
    },
    {
      id: 'alerta-l02',
      data: '2026-03-09',
      titulo: 'Kafka aprovou o processo, mas o lead virou inseto no onboarding',
      critica: 'A jornada tem 47 carimbos e 0 saídas de emergência.',
      acao_sugerida: 'Reduzir para 1 carimbo, 1 café e 1 desculpa formal.',
      prioridade: 'alta',
      dri: 'Franz Kafka',
      status: 'aberta',
    },
    {
      id: 'alerta-l03',
      data: '2026-03-09',
      titulo: 'Turma da Mônica abriu chamado contra o Sansão',
      critica: 'O coelho entrou em litígio e o SLA virou gibi.',
      acao_sugerida: 'Negociar com a Mônica usando um estoque extra de cenouras.',
      prioridade: 'media',
      dri: 'Mauricio de Sousa',
      status: 'aberta',
    },
  ],
  aprendizados: [
    {
      id: 'insight-l01',
      data: '2026-03-09',
      fonte: 'Biblioteca Pública',
      categoria: 'copy',
      insight: 'Metáforas funcionam melhor quando Clarice edita o título em silêncio.',
      evidencia: '3 leitores sorriram, 2 suspiraram e 1 largou tudo para olhar o mar.',
      confianca: 'media',
      aplicavel_a: ['copy', 'ritual'],
      acao_sugerida: 'Usar frases curtas e um enigma que ninguém pediu.',
      status: 'ativo',
    },
    {
      id: 'insight-l02',
      data: '2026-03-09',
      fonte: 'Café Parisiense',
      categoria: 'canal',
      insight: 'Proust só responde depois do terceiro espresso e do quarto parágrafo.',
      evidencia: 'Tempo médio de resposta: 3 xícaras + 1 madeleine.',
      confianca: 'baixa',
      aplicavel_a: ['follow-up'],
      acao_sugerida: 'Cadência suave e uma sobremesa estratégica.',
      status: 'ativo',
    },
    {
      id: 'insight-l03',
      data: '2026-03-09',
      fonte: 'Sala dos Karas',
      categoria: 'processo',
      insight: 'A Droga da Obediência só funciona quando o formulário é secreto.',
      evidencia: 'Todos obedeceram, ninguém preencheu.',
      confianca: 'media',
      aplicavel_a: ['compliance'],
      acao_sugerida: 'Trocar formulário por bilhete dobrado.',
      status: 'ativo',
    },
  ],
};

const DEMO_BOOKED_META = {
  month: 'Mar',
  target: 1234567,
  buckets: [
    { label: 'Feitiçaria & Magia', target: 333333, schools_target: 42, rr_target: 18, rr_sdr_dia_target: 2.4 },
    { label: 'Gibis Estratégicos', target: 222222, schools_target: 31, rr_target: 14, rr_sdr_dia_target: 1.8 },
    { label: 'Realismo Mágico', target: 345678, schools_target: 27, rr_target: 12, rr_sdr_dia_target: 1.2 },
  ],
  wins: [
    { emoji: '✅', titulo: 'Ziraldo: Panela recuperada', desc: 'A panela voltou ao fluxo sem sequelas e virou OKR.', dri: 'Ziraldo', data: '08/03', tipo: 'ENTREGA_NO_PRAZO' },
    { emoji: '🎯', titulo: 'Mônica: Sansão devolvido com multa poética', desc: 'O coelho voltou ao estoque com carimbo literário.', dri: 'Mauricio de Sousa', data: '07/03', tipo: 'ENTREGA_CONCLUIDA' },
    { emoji: '✅', titulo: 'Rowling: capa de invisibilidade auditada', desc: 'Sumiu o orçamento, mas apareceu um dragão de compliance.', dri: 'J. K. Rowling', data: '06/03', tipo: 'ENTREGA_NO_PRAZO' },
  ],
  kpis: {
    meta_anual_escolas: 9876,
    meta_mensal_escolas: 432,
    sdr_meta_pct: 12.0,
    efetividade_sdr_pct: 9.87,
    zombie_days: 3,
    campanha_taxa_verde: 2.0,
    campanha_taxa_azul: 1.0,
  },
};

const SEED = (REQUIRE_LOGIN_FOR_READ ? [] : (HAS_BACKEND_TODOS ? TODOS_SSOT : FALLBACK_SEED));

let BOOKED_META_SRC = (REQUIRE_LOGIN_FOR_READ && !_sbSession) ? DEMO_BOOKED_META : BOOKED_META;
let INTEL_SRC = (REQUIRE_LOGIN_FOR_READ && !_sbSession) ? DEMO_INTEL : INTEL_DATA;
let DATA_HEALTH_SRC = DATA_HEALTH;
let CAMPANHAS_SRC = CAMPANHAS_DATA;
let _dashboardBootstrapCache = null;
let _kpis = (BOOKED_META_SRC && BOOKED_META_SRC.kpis) ? BOOKED_META_SRC.kpis : {};
const ZOMBIE_DAYS         = _kpis.zombie_days          ?? 3;
const CAMPANHA_TAXA_VERDE = _kpis.campanha_taxa_verde   ?? 2.0;
const CAMPANHA_TAXA_AZUL  = _kpis.campanha_taxa_azul    ?? 1.0;

/*  MENSAGENS COBRANA  */

/*  WINS DA SEMANA  */
const WINS = []; // Placeholder para wins manuais via console (fonte real: bootstrap autenticado)

/*  STATE  */

// ownerKey deve ficar aqui porque platform.js carrega antes de tasks.js
// e OWNER_CANONICAL (abaixo) precisa dela na hora da definição do módulo.
function ownerKey(owner) {
  return String(owner || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const OWNER_FALLBACK = 'Lili';
const OWNER_DIRECTORY = {
  pedro: { canonical: 'Pedro', aliases: ['Pedro', 'Pedro Concy', 'Concy'] },
  karina: { canonical: 'Kaka', aliases: ['Kaka', 'Kaká', 'Karina', 'Karina Machado'] },
  lili: { canonical: 'Lili', aliases: ['Lili', 'Liliane'] },
  vitoria: { canonical: 'Vitória', aliases: ['Vit', 'Vitória', 'Vitoria', 'Riente', 'Vit Riente', 'Vitória Riente', 'Vitoria Riente'] },
  nath: { canonical: 'Nath Ferreira', aliases: ['Nath', 'Nathalia', 'Nath Ferreira', 'Nathalia Ferreira'] },
  ana_paula_pimentel: { canonical: 'Ana Paula Pimentel', aliases: ['Ana', 'Ana Paula', 'Ana Pimentel', 'Ana Paula Pimentel', 'Pimentel'] },
  bebel: { canonical: 'Bebel Bertuccelli', aliases: ['Bebel', 'Bertuccelli', 'Bebel Bertuccelli'] },
  luana: { canonical: 'Luana', aliases: ['Luana', 'Lua'] },
  wydi: { canonical: 'Wydi', aliases: ['Wydi'] },
  leo: { canonical: 'Leo (Marketing)', aliases: ['Leo', 'Leo Marketing'] },
};
const DRI_OPTIONS = Object.values(OWNER_DIRECTORY).map(cfg => cfg.canonical);
const OWNER_CANONICAL = Object.values(OWNER_DIRECTORY).reduce((acc, cfg) => {
  [cfg.canonical, ...(cfg.aliases || [])].forEach(alias => {
    acc[ownerKey(alias)] = cfg.canonical;
  });
  return acc;
}, {});

let taskFormMode = 'create';
let editingTaskId = null;
