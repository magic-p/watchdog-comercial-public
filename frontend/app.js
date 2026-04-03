function openAuthModal() {
  if (_sbSession) { _onAuthLogout(); return; }
  document.getElementById('authOverlay').classList.add('open');
  document.getElementById('authEmail').focus();
}
function closeAuthModal() {
  document.getElementById('authOverlay').classList.remove('open');
  document.getElementById('authMsg').textContent = '';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
}


function _onAuthLogin(session) {
  const opts = arguments[1] || {};
  _sbSession = session;
  const refreshReason = String(opts.refreshReason || 'auth_login');
  refreshOperationalHealth(refreshReason);
  const userKey = _sessionUserKey(session);
  const now = Date.now();
  const shouldSkipOperationalRefresh = !!userKey && (_lastAuthRefreshUserKey === userKey) && ((now - _lastAuthRefreshAt) < 30000);
  _dashboardBootstrapCache = null;
  BOOKED_META_SRC = DEMO_BOOKED_META;
  INTEL_SRC = DEMO_INTEL;
  DATA_HEALTH_SRC = buildDataHealthFallback([]);
  CAMPANHAS_SRC = CAMPANHAS_DATA;
  _kpis = (BOOKED_META_SRC && BOOKED_META_SRC.kpis) ? BOOKED_META_SRC.kpis : {};
  const email = session.user?.email || '';
  const name  = email.split('@')[0];
  const pill  = document.getElementById('authPill');
  pill.textContent = '✓ ' + name;
  pill.classList.add('logged-in');
  pill.title = 'Clique para sair';
  closeAuthModal();
  if (!opts.silent) toast('Acesso liberado — ' + name, 'ok');
  // No GitHub Pages: ao logar, o SSOT passa a ser o Supabase — atualizar status
  if (!IS_LOCAL) {
    setSsotStatus(true);
    setMotorStatus(true);  // Railway está online (upload funciona)
  }
  const pp = document.getElementById('publicPill');
  if (pp) pp.style.display = 'none';
  if (!REQUIRE_LOGIN_FOR_READ) {
    load();
    renderTasks();
    renderCriticalAlerts();
  } else {
    load();
    renderTasks();
    renderCriticalAlerts();
  }
  renderIntel();
  renderKpis();
  renderBookedMeta();
  renderWins();
  renderDataHealth();
  if (isMaintenanceActive()) return;
  if (!shouldSkipOperationalRefresh) {
    _lastAuthRefreshUserKey = userKey;
    _lastAuthRefreshAt = now;
    Promise.resolve()
      .then(() => _fetchDashboardBootstrap(!!opts.silent, refreshReason))
      .then((bootstrapped) => {
        if (!bootstrapped) {
          _scheduleTasksRefresh(true, 0, refreshReason);
          _scheduleAlertsRefresh(120, refreshReason);
          return;
        }
        _scheduleTasksRefresh(true, 60000, refreshReason);
        _scheduleAlertsRefresh(60000, refreshReason);
      });
  }
  _sbSubscribeRealtime();
  _applyUrlChatPrefill();
}

// Lê parâmetro ?chat= da URL e pré-preenche o input do chat se presente
function _applyUrlChatPrefill() {
  try {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get('chat');
    if (!prefill) return;
    // Tenta abrir o painel de chat
    if (typeof window.openClaudetChat === 'function') window.openClaudetChat();
    // Preenche o input — usa o id real do textarea do chat
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = decodeURIComponent(prefill);
      chatInput.focus();
      // Dispara eventos para frameworks que observam o input
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Remove o parâmetro da URL sem recarregar (mantém histórico limpo)
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);
  } catch (e) {
    // Silencioso — não quebra nada se falhar
  }
}

function _sbSubscribeRealtime() {
  if (!_sb || _sbRealtimeChannel) return;
  _sbRealtimeChannel = _sb
    .channel('todos-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' },
      () => _scheduleTasksRefresh(true, 250, 'realtime'))
    .subscribe();
}

function _sbUnsubscribeRealtime() {
  if (_sb && _sbRealtimeChannel) {
    _sb.removeChannel(_sbRealtimeChannel);
    _sbRealtimeChannel = null;
  }
}

function _onAuthLogout() {
  const opts = arguments[0] || {};
  if (_sb && !opts.skipRemoteSignOut) _sb.auth.signOut();
  _sbUnsubscribeRealtime();
  _sbSession = null;
  _lastAuthRefreshUserKey = '';
  _lastAuthRefreshAt = 0;
  _authBootstrapUserKey = '';
  _authBootstrapUntil = 0;
  if (_tasksRefreshTimer) clearTimeout(_tasksRefreshTimer);
  _tasksRefreshTimer = null;
  _tasksRefreshQueued = false;
  _tasksRefreshQueuedSilent = true;
  if (_alertsRefreshTimer) clearTimeout(_alertsRefreshTimer);
  _alertsRefreshTimer = null;
  _alertsRefreshQueued = false;
  _dashboardBootstrapCache = null;
  BOOKED_META_SRC = DEMO_BOOKED_META;
  INTEL_SRC = DEMO_INTEL;
  DATA_HEALTH_SRC = DATA_HEALTH;
  CAMPANHAS_SRC = CAMPANHAS_DATA;
  setOperationalState(null);
  _backendAlerts = null;
  _kpis = (BOOKED_META_SRC && BOOKED_META_SRC.kpis) ? BOOKED_META_SRC.kpis : {};
  const pill = document.getElementById('authPill');
  pill.textContent = '👤 Entrar';
  pill.classList.remove('logged-in');
  toast('Sessão encerrada', 'ok');
  if (!IS_LOCAL) { setSsotStatus(false); setMotorStatus(false); }
  const pp = document.getElementById('publicPill');
  if (pp && REQUIRE_LOGIN_FOR_READ) pp.style.display = 'inline-flex';
  if (REQUIRE_LOGIN_FOR_READ) {
    load();
    renderTasks();
    renderCriticalAlerts();
    _scheduleAlertsRefresh(120, 'auth_logout');
    renderIntel();
    renderKpis();
    renderBookedMeta();
    renderWins();
  }
}

async function _refreshTasksFromApi(silent = false, reason = 'unknown') {
  if (isMaintenanceActive()) return;
  if (REQUIRE_LOGIN_FOR_READ && !_sbSession) return;
  if (_supabaseRefreshInFlight) {
    _queueTasksRefresh(silent, reason);
    return;
  }
  _supabaseRefreshInFlight = true;
  try {
    const resp = await _fetchWithAuthRetry(`${API_URL}/api/tasks?reason=${encodeURIComponent(String(reason || 'unknown'))}`, {
      headers: {},
    }, { reason: `tasks_${reason}` });
    let data = null;
    try {
      data = await resp.json();
    } catch (parseErr) {
      console.error('[Tasks API] invalid JSON:', parseErr);
    }
    if (_consumeMaintenancePayload(data, { toast: !silent })) return;
    if (!resp.ok || !data || !data.ok) {
      const msg = (data && data.error) || ('Erro ' + resp.status);
      console.error('[Tasks API] read error:', msg);
      if (!silent) toast('Tarefas indisponíveis: ' + msg, 'error');
      return;
    }
    const remoteTasks = Array.isArray(data.tasks) ? data.tasks : [];
    if (!remoteTasks.length) {
      _pendingTaskMutations.clear();
      tasks = _mergePendingTaskMutations([]);
      _lastGoodSupabaseTasks = [];
      enforceWeeklyTop3(tasks);
      renderTasks();
      buildOwnerFilters();
      _scheduleAlertsRefresh(120, 'tasks_loaded');
      if (!silent) toast('Sem tarefas operacionais no momento.', 'ok');
      return;
    }
    const nextTasks = _mergePendingTaskMutations(remoteTasks.map(t => normalizeTask(t || {})));
    if (!nextTasks.length && _lastGoodSupabaseTasks.length) {
      tasks = _lastGoodSupabaseTasks.map(t => ({ ...t }));
    } else {
      tasks = nextTasks;
      if (tasks.length) _lastGoodSupabaseTasks = tasks.map(t => ({ ...t }));
    }
    enforceWeeklyTop3(tasks);
    renderTasks();
    buildOwnerFilters();
    _scheduleAlertsRefresh(120, 'tasks_loaded');
    if (!silent) toast(`${remoteTasks.length} tarefas carregadas`, 'ok');
  } catch (err) {
    console.error('[Tasks API] exception in _refreshTasksFromApi:', err);
    if (!silent) toast('Tarefas indisponíveis: ' + (err?.message || String(err)), 'error');
  } finally {
    _supabaseRefreshInFlight = false;
    if (_tasksRefreshQueued && !_tasksRefreshTimer) {
      _scheduleTasksRefresh(_tasksRefreshQueuedSilent, 120, _tasksRefreshReason);
    }
  }
}

async function signInWithPassword() {
  const email = document.getElementById('authEmail').value.trim();
  const pass  = document.getElementById('authPassword').value;
  const btn   = document.getElementById('authPasswordBtn');
  const msg   = document.getElementById('authMsg');
  if (!email) { msg.className = 'auth-msg err'; msg.textContent = 'Digite seu e-mail.'; return; }
  if (!pass)  { msg.className = 'auth-msg err'; msg.textContent = 'Digite sua senha.'; return; }
  if (!_sb)   { msg.className = 'auth-msg err'; msg.textContent = 'Supabase não configurado.'; return; }
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  const { data, error } = await _sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false;
  btn.textContent = 'Entrar com senha';
  if (error) {
    msg.className = 'auth-msg err';
    console.error('[Supabase] signInWithPassword error:', String(error?.message ?? error));
    msg.textContent = 'Erro: ' + error.message;
  } else {
    msg.className = 'auth-msg ok';
    msg.textContent = '✅ Login realizado.';
  }
}

let _forgotMode = false;
function toggleForgotMode() {
  _forgotMode = !_forgotMode;
  const title   = document.getElementById('authTitle');
  const desc    = document.getElementById('authDesc');
  const passEl  = document.getElementById('authPassword');
  const loginBtn = document.getElementById('authPasswordBtn');
  const forgotBtn = document.getElementById('authForgotBtn');
  const msg     = document.getElementById('authMsg');
  msg.textContent = '';
  if (_forgotMode) {
    title.textContent   = 'Redefinir senha';
    desc.textContent    = 'Digite seu e-mail e enviaremos um link para criar uma nova senha.';
    passEl.style.display  = 'none';
    loginBtn.textContent  = 'Enviar link de reset';
    loginBtn.onclick      = sendPasswordReset;
    forgotBtn.textContent = '← Voltar para o login';
  } else {
    title.textContent   = 'Acesso ao Watchdog';
    desc.textContent    = 'Digite seu e-mail e senha para acessar.';
    passEl.style.display  = '';
    loginBtn.textContent  = 'Entrar com senha';
    loginBtn.onclick      = signInWithPassword;
    forgotBtn.textContent = 'Esqueci minha senha';
  }
}

async function sendPasswordReset() {
  const email = document.getElementById('authEmail').value.trim();
  const btn   = document.getElementById('authPasswordBtn');
  const msg   = document.getElementById('authMsg');
  if (!email) { msg.className = 'auth-msg err'; msg.textContent = 'Digite seu e-mail.'; return; }
  if (!_sb)   { msg.className = 'auth-msg err'; msg.textContent = 'Supabase não configurado.'; return; }
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo });
  btn.disabled = false;
  btn.textContent = 'Enviar link de reset';
  if (error) {
    msg.className = 'auth-msg err';
    msg.textContent = 'Erro: ' + error.message;
  } else {
    msg.className = 'auth-msg ok';
    msg.textContent = 'Link enviado! Verifique seu e-mail.';
  }
}

/* Enter no campo de email dispara o envio */
document.addEventListener('DOMContentLoaded', () => {
  const emailInput = document.getElementById('authEmail');
  const passInput  = document.getElementById('authPassword');
  if (emailInput) emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') signInWithPassword(); });
  if (passInput) passInput.addEventListener('keydown', e => { if (e.key === 'Enter') signInWithPassword(); });
  const authOverlay = document.getElementById('authOverlay');
  if (authOverlay) authOverlay.addEventListener('click', e => { if (e.target === authOverlay) closeAuthModal(); });

  // Realtime ativo via _sbSubscribeRealtime() — polling removido (era fallback)
});

/* ── Alert Strip ─────────────────────────────────────────── */
function _renderAlertStrip(alerts) {
  const strip = document.getElementById('alertStrip');
  const items = document.getElementById('alertStripItems');
  if (!strip || !items) return;
  if (!alerts || alerts.length === 0) { strip.style.display = 'none'; return; }
  const warnSvg = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L14 13H2L8 2z"/><line x1="8" y1="7" x2="8" y2="10"/><line x1="8" y1="12" x2="8.01" y2="12"/></svg>`;
  items.innerHTML = alerts.slice(0, 8).map(a => {
    const parts = [];
    if (a.task || a.tarefa) parts.push(`<span class="alert-strip-task">${esc(a.task || a.tarefa)}</span>`);
    if (a.owner || a.dono) parts.push(`<span class="alert-strip-meta">${esc(a.owner || a.dono)}</span>`);
    if (a.days) parts.push(`<span class="alert-strip-meta">${esc(a.days)}d</span>`);
    return `<span class="alert-strip-item">${warnSvg}${parts.join('<span class="alert-strip-meta"> \u00B7 </span>')}</span>`;
  }).join('');
  strip.style.display = '';
}

/* ── System status pill ──────────────────────────────────── */
function _updateSysStatus() {
  const dot = document.getElementById('sysStatusDot');
  const txt = document.getElementById('sysStatusText');
  const pill = document.getElementById('sysStatusPill');
  if (!dot || !txt) return;
  if (isMaintenanceActive()) {
    dot.className = 'sys-status-dot maintenance';
    txt.textContent = 'Manutencao';
    if (pill) pill.title = maintenanceMessage();
    return;
  }
  const motorEl = document.getElementById('motorStatus');
  const motorOnline = motorEl && motorEl.classList.contains('online');
  const readonly = document.getElementById('readonlyPill') && document.getElementById('readonlyPill').style.display !== 'none';
  const operational = (typeof getOperationalState === 'function') ? getOperationalState() : null;
  if (operational && operational.degraded) {
    dot.className = 'sys-status-dot degraded';
    txt.textContent = 'Degradado';
    if (pill) {
      const reasons = Array.isArray(operational.degradation_reasons) ? operational.degradation_reasons.join(' • ') : '';
      pill.title = reasons || 'Servico autenticado degradado';
    }
    return;
  }
  if (motorOnline) {
    dot.className = 'sys-status-dot online';
    txt.textContent = 'Motor online';
    if (pill) pill.title = 'Motor online \u00B7 SSOT ok';
  } else if (readonly) {
    dot.className = 'sys-status-dot readonly';
    txt.textContent = 'Somente leitura';
    if (pill) pill.title = 'Sem motor local \u00B7 modo leitura';
  } else {
    dot.className = 'sys-status-dot offline';
    txt.textContent = 'Motor offline';
    if (pill) pill.title = 'Motor offline';
  }
}

/* ── Priority filter tab ─────────────────────────────────── */
function _renderPriorityPane() {
  const tbody = document.getElementById('tbodyPriority');
  const counter = document.getElementById('priorityCounter');
  if (!tbody) return;
  const priorityRows = window._allTodos
	    ? window._allTodos.filter(t => t.priorityRank && t.priorityRank <= 3 && !isTaskDoneState(t))
	        .sort((a, b) => (a.priorityRank || 9) - (b.priorityRank || 9))
	    : [];
  if (counter) counter.textContent = priorityRows.length;
  tbody.innerHTML = '';
  if (priorityRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--t3);padding:20px;font-size:13px;">Nenhuma tarefa marcada como Top 3.</td></tr>';
    return;
  }
  priorityRows.forEach(t => {
    const existingRow = document.querySelector(`#tbodyOpen tr[data-id="${t.id}"]`);
    if (existingRow) {
      tbody.appendChild(existingRow.cloneNode(true));
    }
  });
}

/* ── Upload Section ──────────────────────────────────────────── */
const UPLOAD_MAX_BYTES = 1 * 1024 * 1024;
const UPLOAD_ACCEPTED  = ['.pdf', '.xlsx', '.xls', '.csv'];
let _uploadHistory = JSON.parse(localStorage.getItem('wdUploads') || '[]');
let _stagedFiles   = [];

function _uploadWeekStart() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function _initUpload() {
  const drop  = document.getElementById('uploadDrop');
  const inner = document.getElementById('uploadDropInner');
  const input = document.getElementById('uploadFileInput');
  if (!drop || !input) return;

  ['dragenter','dragover'].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); inner.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); inner.classList.remove('dragover'); }));
  drop.addEventListener('drop', e => _stageFiles(Array.from(e.dataTransfer.files)));
  drop.addEventListener('click', e => { if (!e.target.closest('label')) input.click(); });
  drop.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => {
    if (input.files.length) _stageFiles(Array.from(input.files));
    input.value = '';
  });
  document.getElementById('uploadCancelBtn')?.addEventListener('click', _cancelStaged);
  document.getElementById('uploadSendBtn')?.addEventListener('click', _submitStagedFiles);
  _renderUploadHistory();
}

function _stageFiles(files) {
  let added = 0;
  for (const f of files) {
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!UPLOAD_ACCEPTED.includes(ext)) { toast(`Tipo não aceito: ${f.name}`, 'err'); continue; }
    if (f.size > UPLOAD_MAX_BYTES) { toast(`Muito grande (máx 1 MB): ${f.name}`, 'err'); continue; }
    if (_stagedFiles.some(x => x.name === f.name && x.size === f.size)) continue;
    _stagedFiles.push(f);
    added++;
  }
  if (added > 0) _renderStagedChips();
}

function _renderStagedChips() {
  const compose = document.getElementById('uploadCompose');
  const list    = document.getElementById('uploadStagedList');
  if (!compose || !list) return;
  if (_stagedFiles.length === 0) { compose.style.display = 'none'; return; }
  compose.style.display = '';
  const fmtSize = b => b < 1024 ? b + ' B' : (b / 1024).toFixed(0) + ' KB';
  list.innerHTML = _stagedFiles.map((f, i) => `
    <div class="upload-staged-chip">
      <span class="upload-staged-chip-name" title="${esc(f.name)}">${esc(f.name)}</span>
      <span class="upload-staged-chip-size">${fmtSize(f.size)}</span>
      <button class="upload-staged-chip-remove" type="button" aria-label="Remover" onclick="_removeStagedFile(${i})">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function _removeStagedFile(idx) {
  _stagedFiles.splice(idx, 1);
  _renderStagedChips();
}

function _cancelStaged() {
  _stagedFiles = [];
  const compose = document.getElementById('uploadCompose');
  if (compose) compose.style.display = 'none';
  const ctx = document.getElementById('uploadContextField');
  if (ctx) ctx.value = '';
}

async function _submitStagedFiles() {
  if (!_stagedFiles.length) return;
  const session = await _ensureFreshSession('upload_batch_preflight');
  if (!session?.access_token) { toast('Faça login para enviar arquivos.', 'err'); return; }
  const context = document.getElementById('uploadContextField')?.value?.trim() || '';
  const btn = document.getElementById('uploadSendBtn');
  if (btn) btn.disabled = true;
  const filesToSend = [..._stagedFiles];
  _cancelStaged();
  await Promise.all(filesToSend.map(f => _queueUpload(f, context)));
  if (btn) btn.disabled = false;
}

function _queueUpload(file, context = '') {
  const actor = _sbSession?.user?.email?.split('@')[0] || 'local';
  const entry = {
    id: 'u' + Date.now() + Math.random().toString(36).slice(2, 6),
    name: file.name, size: file.size,
    actor, ts: new Date().toISOString(),
    status: 'uploading', resultSummary: null, context
  };
  _uploadHistory.unshift(entry);
  _saveUploads(); _renderUploadHistory();
  return _doUpload(file, entry, context);
}

async function _doUpload(file, entry, context = '') {
  try {
    const session = await _ensureFreshSession('upload_preflight');
    if (!session?.access_token) throw new Error('Faça login para enviar arquivos.');
    const b64 = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
    const resp = await _fetchWithAuthRetry(API_URL + '/api/inbox/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: file.name, data: b64, context }),
    }, { reason: 'upload_submit' });
    const json = await resp.json();
    if (resp.status === 409) {
      _setUploadStatus(entry.id, 'concluido', 'Arquivo já processado anteriormente.');
      toast(`${file.name}: já analisado`, 'ok');
      return;
    }
    if (!json.ok) throw new Error(resp.status === 401 ? _authFailureMessage(json) : (json.error || 'erro desconhecido'));
    if (json.upload_id) entry.uploadServerId = json.upload_id;
    _setUploadStatus(entry.id, 'received');
    toast(`${file.name} enviado`, 'ok');
    _subscribeUploadStatus(entry);
  } catch(e) {
    _setUploadStatus(entry.id, 'erro', e.message);
    toast('Erro no upload: ' + e.message, 'err');
  }
}

function _subscribeUploadStatus(entry) {
  if (!_sb || !entry.uploadServerId) {
    setTimeout(() => _setUploadStatus(entry.id, 'analyzing'), 3000);
    return;
  }
  const ch = _sb.channel('upload-' + entry.uploadServerId)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'uploads',
      filter: 'id=eq.' + entry.uploadServerId,
    }, payload => {
      const row = payload.new;
      _setUploadStatus(entry.id, row.status, row.result_summary);
      if (row.status === 'concluido' || row.status === 'erro') ch.unsubscribe();
    })
    .subscribe();
}

function _setUploadStatus(id, status, summary) {
  const e = _uploadHistory.find(x => x.id === id);
  if (!e) return;
  e.status = status;
  if (summary) e.resultSummary = summary;
  if (status === 'concluido') e.doneAt = new Date().toISOString();
  _saveUploads(); _renderUploadHistory(); _updateUploadBadge();
}

function _saveUploads() {
  if (_uploadHistory.length > 60) _uploadHistory = _uploadHistory.slice(0, 60);
  localStorage.setItem('wdUploads', JSON.stringify(_uploadHistory));
}

function _updateUploadBadge() {
  const b = document.getElementById('uploadQueueBadge');
  if (!b) return;
  const n = _uploadHistory.filter(e => ['uploading','received','analyzing'].includes(e.status)).length;
  if (n > 0) { b.textContent = n + ' na fila'; b.style.display = ''; }
  else b.style.display = 'none';
}

function _renderUploadHistory() {
  const wrap = document.getElementById('uploadHistoryWrap');
  if (!wrap) return;
  const weekStart = _uploadWeekStart();
  const items = _uploadHistory.filter(e => new Date(e.ts) >= weekStart);
  if (!items.length) {
    wrap.innerHTML = '<div class="upload-history-empty">Nenhum envio esta semana.</div>';
    _updateUploadBadge(); return;
  }
  const statusLabels = { uploading:'Enviando…', received:'Recebido', analyzing:'Analisando…', concluido:'Concluído', erro:'Erro' };
  const fmtDate = iso => {
    try {
      const d = new Date(iso);
      return `${d.getDate()}/${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()]} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return ''; }
  };
  const d = new Date(weekStart);
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const weekLabel = `semana de ${d.getDate()}/${months[d.getMonth()]}`;
  wrap.innerHTML = `<div class="upload-history-week">${weekLabel} &middot; ${items.length} arquivo${items.length!==1?'s':''}</div>` +
    items.map(e => {
      const st = e.status || 'uploading';
      const result = e.resultSummary ? `<a class="upload-result-link" onclick="showUploadResult('${e.id}')">ver</a>` : '';
      return `<div class="upload-history-row">
        <div class="upload-history-name" title="${esc(e.name)}">${esc(e.name)}</div>
        <div class="upload-history-actor">${esc(e.actor)} &middot; ${esc(fmtDate(e.ts))}</div>
        <span class="upload-history-status ${st}">${statusLabels[st]||st}</span>${result}
      </div>`;
    }).join('');
  _updateUploadBadge();
}

function showUploadResult(id) {
  const e = _uploadHistory.find(x => x.id === id);
  if (!e?.resultSummary) { toast('Resultado ainda não disponível', 'err'); return; }
  const overlay = document.getElementById('taskOverlay');
  if (!overlay) return;
  document.getElementById('taskModalTitle').textContent = 'Análise: ' + e.name;
  document.getElementById('taskForm').innerHTML = `
    <div style="white-space:pre-wrap;font-size:13px;line-height:1.65;max-height:60vh;overflow-y:auto;">${esc(e.resultSummary)}</div>
    <div class="modal-ft" style="padding:12px 0 0;border-top:none;justify-content:flex-end;">
      <button class="btn" type="button" onclick="closeTaskModal()">Fechar</button>
    </div>`;
  overlay.classList.add('open');
}

document.addEventListener('DOMContentLoaded', _initUpload);

/* ══════════════════════════════════════════════════════════
   CLAUDETE CHAT — FAB + Drawer
   ══════════════════════════════════════════════════════════ */
(function() {
  const MOTOR_CHAT_URL = API_URL.replace(/\/$/, '') + '/api/claudete/chat';
  const QUICK_PILLS = [
    'Como está o funil agora?',
    'Qual tarefa mais urgente?',
    'Algum alerta crítico?',
    'Como estamos em relação à meta?',
  ];

  let _chatHistory = []; // {role:'user'|'claudete', text}
  let _chatBusy    = false;

  // ── Injetar HTML ──────────────────────────────────────
  const fabHtml = `
<button id="claudeteFab" title="Conversar com Claudete" onclick="openClaudetChat()">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
</button>

<div id="claudeteDrawer" role="dialog" aria-label="Chat com Claudete">
  <div class="chat-header">
    <div class="chat-avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </div>
    <div class="chat-header-info">
      <div class="chat-header-name">Claudete</div>
      <div class="chat-header-sub">Chief of Staff · Estante Mágica</div>
    </div>
    <button class="chat-close" onclick="closeClaudetChat()" title="Fechar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <div class="chat-messages" id="chatMessages"></div>

  <div class="chat-pills" id="chatPills"></div>

  <div class="chat-footer">
    <div class="chat-attach-preview" id="chatAttachPreview">
      <span class="chat-attach-chip" id="chatAttachChip">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        <span id="chatAttachName"></span>
        <button class="chat-attach-remove" id="chatAttachRemove" title="Remover arquivo">×</button>
      </span>
    </div>
    <div class="chat-input-row">
      <button class="chat-attach-btn" id="chatAttachBtn" title="Anexar arquivo (PDF, XLSX, CSV, TXT · até 13 MB)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </button>
      <input type="file" id="chatFileInput" accept=".pdf,.xlsx,.xls,.csv,.txt" multiple hidden />
      <textarea id="chatInput" class="chat-input" rows="1" maxlength="1000"
        placeholder="Pergunte algo sobre a Estante Mágica…"
        onkeydown="chatInputKeydown(event)"></textarea>
      <button class="chat-send" id="chatSend" onclick="sendChatMessage()" title="Enviar" disabled>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  </div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', fabHtml);

  // ── Renderizar pills ──────────────────────────────────
  const pillsEl = document.getElementById('chatPills');
  QUICK_PILLS.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'chat-pill';
    btn.textContent = p;
    btn.onclick = () => { sendChatMessage(p); };
    pillsEl.appendChild(btn);
  });

  // ── Input listeners ───────────────────────────────────
  const inputEl  = document.getElementById('chatInput');
  const sendBtn  = document.getElementById('chatSend');
  inputEl.addEventListener('input', () => {
    sendBtn.disabled = isMaintenanceActive() || (!inputEl.value.trim() && !_chatAttachFiles.length) || _chatBusy;
  });

  // ── Attach listeners ──────────────────────────────────
  let _chatAttachFiles = [];  // File[]
  window._chatAttachFiles = [];
  window._chatBusy = false;

  function _chatSetAttach(files, { merge = false } = {}) {
    if (!files || !files.length) {
      _chatAttachFiles = [];
      window._chatAttachFiles = [];
      document.getElementById('chatAttachPreview').style.display = 'none';
      return;
    }
    const MAX = 13 * 1024 * 1024;
    const newFiles = Array.from(files);
    const oversized = newFiles.filter(f => f.size > MAX);
    if (oversized.length) { toast(`Arquivo(s) muito grande(s) — máx 13 MB cada: ${oversized.map(f => f.name).join(', ')}`, 'err'); return; }
    // Mescla com arquivos já selecionados (dedup por nome), respeita cap de 10
    const base = merge ? Array.from(_chatAttachFiles || []) : [];
    const existingNames = new Set(base.map(f => f.name));
    for (const f of newFiles) {
      if (!existingNames.has(f.name)) { base.push(f); existingNames.add(f.name); }
    }
    if (base.length > 10) { toast('Máximo de 10 arquivos por envio.', 'err'); return; }
    _chatAttachFiles = base;
    window._chatAttachFiles = base;
    const label = base.length === 1 ? base[0].name : `${base.length} arquivos`;
    document.getElementById('chatAttachName').textContent = label;
    document.getElementById('chatAttachPreview').style.display = 'flex';
    sendBtn.disabled = isMaintenanceActive() || _chatBusy;
  }

  const attachBtn  = document.getElementById('chatAttachBtn');
  const fileInput  = document.getElementById('chatFileInput');
  const attachPrev = document.getElementById('chatAttachPreview');
  attachPrev.style.display = 'none';  // hidden until file attached
  attachBtn.addEventListener('click', () => {
    if (isMaintenanceActive()) {
      toast(maintenanceMessage(), 'err');
      return;
    }
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) _chatSetAttach(fileInput.files, { merge: _chatAttachFiles && _chatAttachFiles.length > 0 });
    fileInput.value = '';
  });
  document.getElementById('chatAttachRemove').addEventListener('click', () => {
    _chatSetAttach(null);
    sendBtn.disabled = isMaintenanceActive() || !inputEl.value.trim() || _chatBusy;
  });

  // ── Open / Close ──────────────────────────────────────
  window.openClaudetChat = function() {
    if (isMaintenanceActive()) {
      toast(maintenanceMessage(), 'err');
      return;
    }
    document.getElementById('claudeteDrawer').classList.add('open');
    if (_chatHistory.length === 0) _renderWelcome();
    setTimeout(() => inputEl.focus(), 280);
  };
  window.closeClaudetChat = function() {
    document.getElementById('claudeteDrawer').classList.remove('open');
  };

  // ── Welcome message (static, no API call) ─────────────
  function _renderWelcome() {
    _appendMsg('claudete',
      'Oi. Sou a Claudete — Chief of Staff desta operação. Pode perguntar sobre funil, tarefas, metas ou qualquer coisa que envolva a Estante Mágica. Culinária e filosofia ficam de fora do meu escopo, mas podemos conversar sobre por que a taxa de RR está do jeito que está.'
    );
  }

  // ── Append message bubble ─────────────────────────────
function _appendMsg(role, text, id) {
  const msgs = document.getElementById('chatMessages');
  const div  = document.createElement('div');
  div.className = 'chat-msg ' + role;
  if (id) div.id = id;
  const renderChatRichText = role !== 'user' && role !== 'typing';
  if (renderChatRichText) {
    const html = esc(text || '')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    div.innerHTML = html;
  } else {
    div.textContent = text;
  }
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function _appendClaudeteReplySafe(text) {
  const replyText = String(text || '');
  try {
    try {
      _appendMsg('claudete', replyText);
    } catch (renderErr) {
      console.error('[Claudete chat] falha ao renderizar bubble rica:', renderErr);
      const msgs = document.getElementById('chatMessages');
      if (!msgs) throw renderErr;
      const div = document.createElement('div');
      div.className = 'chat-msg claudete';
      div.textContent = replyText;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }
    if (!Array.isArray(_chatHistory)) _chatHistory = [];
    _chatHistory.push({ role: 'claudete', content: replyText });
    if (_chatHistory.length > 50) _chatHistory = _chatHistory.slice(-50);
  } catch (err) {
    console.error('[Claudete chat] falha fatal ao preservar resposta:', err);
  }
}

  // ── Send ──────────────────────────────────────────────
  window.chatInputKeydown = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  };

  // Helper: toggle pills disabled state while busy
  function _setPillsBusy(busy) {
    document.querySelectorAll('.chat-pill').forEach(p => p.classList.toggle('disabled', busy));
  }

  window.sendChatMessage = async function(overrideText) {
    if (_chatBusy) return;
    if (isMaintenanceActive()) {
      toast(maintenanceMessage(), 'err');
      return;
    }
    const text = overrideText || inputEl.value.trim();
    if (!text && !_chatAttachFiles.length) return;

    const session = await _ensureFreshSession('claudete_chat_preflight');
    if (!session?.access_token) {
      toast('Faça login para conversar com a Claudete', 'err');
      return;
    }

    // Captura e limpa estado antes de async
    const attachFiles = _chatAttachFiles.slice();
    inputEl.value = '';
    _chatSetAttach(null);
    sendBtn.disabled = true;
    _chatBusy = true;
    window._chatBusy = true;
    _setPillsBusy(true);

    const attachLabel = attachFiles.length === 1
      ? ` [📎 ${attachFiles[0].name}]`
      : attachFiles.length > 1
        ? ` [📎 ${attachFiles.length} arquivos]`
        : '';
    const displayText = text || (attachFiles.length ? attachFiles.map(f => f.name).join(', ') : '');
    _appendMsg('user', displayText + attachLabel);
    _chatHistory.push({ role: 'user', content: displayText });
    if (_chatHistory.length > 50) _chatHistory = _chatHistory.slice(-50);

    const typingId = 'typing-' + Date.now();
    const typingEl = _appendMsg('typing', 'Claudete está pensando…', typingId);

    // Timer: 15s sem resposta → feedback de espera
    const thinkingTimer = setTimeout(() => {
      if (typingEl && typingEl.isConnected) {
        typingEl.textContent = 'Ainda processando… (análises estratégicas podem levar até 90s)';
      }
    }, 15_000);

    // AbortController: timeout de 90s (estratégia usa o worker strategist — até 55s no backend + margem)
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 90_000);
    let responseReceived = false;
    let rawText = '';
    let data = null;

    try {
      // Converter arquivo(s) para base64
      const readToBase64 = (file) => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });

      // Histórico formatado para o backend (últimas 6 trocas, role user/assistant)
      const historyPayload = _chatHistory.slice(-12).map(e => ({
        role: e.role === 'claudete' ? 'assistant' : e.role,
        content: (e.content || '').slice(0, 2000),
      })).filter(e => e.role === 'user' || e.role === 'assistant');

      const body = { message: text || '', history: historyPayload };
      if (attachFiles.length === 1) {
        // formato legado — retrocompatível com backend anterior
        body.file_data = await readToBase64(attachFiles[0]);
        body.filename  = attachFiles[0].name;
      } else if (attachFiles.length > 1) {
        body.files = await Promise.all(attachFiles.map(async f => ({
          file_data: await readToBase64(f),
          filename:  f.name,
        })));
      }

      const resp = await _fetchWithAuthRetry(MOTOR_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }, { reason: 'claudete_chat' });
      responseReceived = true;
      clearTimeout(thinkingTimer);
      clearTimeout(timeoutId);
      const el = document.getElementById(typingId);
      if (el) el.remove();

      rawText = await resp.text();
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch (parseErr) {
        console.error('[Claudete chat] resposta não-JSON:', parseErr);
      }
      if (_consumeMaintenancePayload(data)) {
        _chatBusy = false;
        window._chatBusy = false;
        _setPillsBusy(false);
        sendBtn.disabled = isMaintenanceActive() || (!inputEl.value.trim() && !_chatAttachFiles.length);
        return;
      }

      if (!resp.ok) {
        if (resp.status === 413) {
          _appendMsg('error', 'Arquivos muito grandes para enviar juntos — tente enviar em partes menores.');
        } else {
          const detail = resp.status === 401
            ? _authFailureMessage(data, 'Faça login novamente para conversar com a Claudete.')
            : ((data && data.error) || 'resposta inválida');
          _appendMsg('error', 'Erro ' + resp.status + ': ' + detail);
        }
      } else {
        const responseText = data && (data.reply_text || data.reply) ? String(data.reply_text || data.reply) : '';
        if (data && data.ok && responseText) {
          if (Array.isArray(data.created_tasks) && data.created_tasks.length) {
            try {
              applyChatCreatedTasks(data.created_tasks);
              if (_sbSession) _scheduleTasksRefresh(true, 120, 'claudete_created_tasks');
            } catch (createdTasksErr) {
              console.error('[Claudete chat] falha ao aplicar created_tasks:', createdTasksErr);
            }
          }
          _appendClaudeteReplySafe(responseText);
        } else if (rawText) {
          _appendClaudeteReplySafe(rawText);
        } else {
          _appendMsg('error', (data && data.error) || 'Resposta vazia da Claudete.');
        }
      }
    } catch (e) {
      console.error('[Claudete chat] erro no fluxo de envio:', e);
      clearTimeout(thinkingTimer);
      clearTimeout(timeoutId);
      const el = document.getElementById(typingId);
      if (el) el.remove();
      if (responseReceived) {
        const fallbackReply = data && (data.reply_text || data.reply) ? String(data.reply_text || data.reply) : rawText;
        if (fallbackReply) {
          try {
            _appendClaudeteReplySafe(fallbackReply);
            _chatBusy = false;
            window._chatBusy = false;
            _setPillsBusy(false);
            sendBtn.disabled = isMaintenanceActive() || (!inputEl.value.trim() && !_chatAttachFiles.length);
            return;
          } catch (fallbackErr) {
            console.error('[Claudete chat] fallback pós-resposta falhou:', fallbackErr);
          }
        }
      }
      if (e.name === 'AbortError') {
        _appendMsg('error', 'Tempo limite atingido. Análises estratégicas complexas podem demorar — tente novamente ou reformule a pergunta.');
      } else {
        _appendMsg('error', 'A resposta da Claudete chegou, mas o navegador tropeçou ao processá-la. Já deixei isso mais rastreável no console.');
      }
    }

    _chatBusy = false;
    window._chatBusy = false;
    _setPillsBusy(false);
    sendBtn.disabled = isMaintenanceActive() || (!inputEl.value.trim() && !_chatAttachFiles.length);
  };

  // ── Show/hide FAB on auth state ───────────────────────
  const _origLogin  = window._onAuthLogin;
  const _origLogout = window._onAuthLogout;
  window._onAuthLogin = function(session, opts) {
    _origLogin && _origLogin.call(this, session, opts);
    document.getElementById('claudeteFab').classList.add('visible');
  };
  window._onAuthLogout = function() {
    _origLogout && _origLogout.call(this);
    document.getElementById('claudeteFab').classList.remove('visible');
    document.getElementById('claudeteDrawer').classList.remove('open');
  };

  // Show FAB if already logged in (page reload case)
  if (typeof _sbSession !== 'undefined' && _sbSession) {
    document.getElementById('claudeteFab').classList.add('visible');
  }
})();
