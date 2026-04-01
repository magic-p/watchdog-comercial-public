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
      out.push({
        key: `sem_dono_${t.id}`,
        tag: '[CRITICO: TAREFA_SEM_DONO]',
        chip: 'TAREFA_SEM_DONO',
        level: 'red',
        text: `(${t.id}) ${title} sem respons\u00E1vel definido.`,
      });
    }

    const due = parseTaskDate(t.date);
    if (!due) {
      out.push({
        key: `sem_prazo_${t.id}`,
        tag: '[CRITICO: TAREFA_SEM_PRAZO]',
        chip: 'TAREFA_SEM_PRAZO',
        level: 'orange',
        text: `(${t.id}) ${owner}: ${title} sem prazo definido.`,
      });
    } else if (due < today) {
      out.push({
        key: `atrasada_${t.id}`,
        tag: '[CRITICO: TAREFA_ATRASADA]',
        chip: 'TAREFA_ATRASADA',
        level: 'red',
        text: `(${t.id}) ${owner}: ${title} atrasada (prazo ${t.date}).`,
      });
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
      out.push({
        key: `zumbi_${t.id}`,
        tag: '[CRITICO: ALERTA_ZUMBI]',
        chip: 'ALERTA_ZUMBI',
        level: 'red',
        text: `(${t.id}) ${owner}: ${title} ${zombieInfo}.`,
      });
    }
  });

  const uniq = [];
  const seen = new Set();
  out.forEach(alert => {
    if (seen.has(alert.key)) return;
    seen.add(alert.key);
    uniq.push(alert);
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
    const first = alerts[0];
    topHost.innerHTML = `
      <div class="alert-item" style="margin-bottom:10px">
        <div class="alert-stripe ${first.level}"></div>
        <div>
          <span class="status-chip ${first.level}"><span class="alert-chip-icon">${alertTypeIcon(first.chip)}</span>${esc(first.chip)}</span>
          <div class="alert-title">#1 agora: ${esc(stripLeadingBracketTag(first.text))}</div>
        </div>
      </div>`;
  }

  host.innerHTML = alerts.slice(1).map(alert => `
    <div class="alert-item">
      <div class="alert-stripe ${alert.level}"></div>
      <div>
        <span class="status-chip ${alert.level}"><span class="alert-chip-icon">${alertTypeIcon(alert.chip)}</span>${esc(alert.chip)}</span>
        <div class="alert-title">${esc(stripLeadingBracketTag(alert.text))}</div>
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
    const title = String(t.task || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(word => word.length >= 4)
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
    `${pub.paridade_mismatch || 0} mismatch p\u00FAblico`,
    `${pub.paridade_missing || 0} arquivo p\u00FAblico faltando`,
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
          <div class="health-sub">Prazo j\u00E1 vencido</div>
        </div>
        <div class="health-item">
          <div class="health-label">Sem hist\u00F3rico</div>
          <div class="health-value">${Number(tarefas.sem_historico || 0)}</div>
          <div class="health-sub">Sem atualiza\u00E7\u00E3o registrada</div>
        </div>
        <div class="health-item">
          <div class="health-label">Dono autopreenchido</div>
          <div class="health-value">${Number(tarefas.owner_autopreenchido || 0)}</div>
          <div class="health-sub">Preenchido automaticamente com Lili</div>
        </div>
        <div class="health-item">
          <div class="health-label">Prazo autopreenchido</div>
          <div class="health-value">${Number(tarefas.prazo_autopreenchido || 0)}</div>
          <div class="health-sub">Prazo autom\u00E1tico aplicado</div>
        </div>
        <div class="health-item">
          <div class="health-label">Duplicidade prov\u00E1vel</div>
          <div class="health-value">${duplicateGroups.length}</div>
          <div class="health-sub">${duplicateGroups.slice(0, 2).map(ids => ids.join(', ')).join(' • ') || 'Sem pares suspeitos'}</div>
        </div>
      </div>
      <div class="health-meta">
        ${metaChips.map(chip => `<span class="intel-summary-chip">${esc(chip)}</span>`).join('')}
      </div>
      <div class="health-note">Este bloco serve como check-up rapido da base: o que esta atrasado, sem historico, provavel duplicado e se o shell publico sanitizado continua coerente com a Option C.</div>
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
      desc: onTime ? 'Concluida no prazo do ciclo semanal.' : 'Concluida no ciclo semanal (segunda a domingo).',
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
    const task = map.get(rank);
    if (!task) {
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
    const statusChip = task.done
      ? { cls: 'green', lbl: 'Conclu\u00EDdo' }
      : task.tier === 't1'
        ? { cls: 'red', lbl: 'A fazer' }
        : { cls: 'orange', lbl: 'Fazendo' };
    const detail = task.comment
      ? esc(task.comment)
      : `Respons&aacute;vel: ${esc(task.owner)}  Prazo: ${esc(task.date || '')}`;
    const impact = task.warn ? esc(task.warn) : `Acompanhamento diario por ${esc(task.owner)}.`;
    return `
      <div class="pri-item">
        <div class="pri-num">${rank}</div>
        <div>
          <span class="status-chip ${statusChip.cls}">${statusChip.lbl}</span>
          <div class="pri-title">(${esc(task.id)}) ${esc(task.task)}</div>
          <div class="pri-why"><span class="lbl"></span><span>${detail}</span></div>
          <div class="pri-impact"><span class="lbl"></span><span>${impact}</span></div>
        </div>
      </div>`;
  });
  host.innerHTML = rows.join('');
}

function formatBRL(value) {
  return 'R$ ' + Number(value || 0).toLocaleString('pt-BR');
}

function renderKpis() {
  const kpis = (BOOKED_META_SRC && BOOKED_META_SRC.kpis) ? BOOKED_META_SRC.kpis : {};
  const month = (BOOKED_META_SRC && BOOKED_META_SRC.month) ? BOOKED_META_SRC.month : null;

  const elEscolas = document.getElementById('kpiMetaEscolas');
  if (elEscolas && kpis.meta_anual_escolas) {
    elEscolas.textContent = kpis.meta_anual_escolas.toLocaleString('pt-BR');
  }

  const elMensal = document.getElementById('kpiMetaMensal');
  const elMensalEyebrow = document.getElementById('kpiMetaMensalEyebrow');
  if (elMensal && kpis.meta_mensal_escolas) {
    elMensal.textContent = kpis.meta_mensal_escolas.toLocaleString('pt-BR');
  }
  if (elMensalEyebrow && month) {
    elMensalEyebrow.textContent = 'Meta ' + month.charAt(0).toUpperCase() + month.slice(1);
  }

  const elSdr = document.getElementById('kpiEfetividadeSDR');
  const elSdrSub = document.getElementById('kpiEfetividadeSDRSub');
  const metaSdr = kpis.sdr_meta_pct || 12;
  const atual = kpis.efetividade_sdr_pct;
  if (elSdr) {
    if (atual != null) {
      elSdr.textContent = atual.toFixed(2).replace('.', ',') + '%';
      elSdr.className = 'kpi-value ' + (atual >= metaSdr ? '' : 'alert');
    } else {
      elSdr.textContent = '\u2014';
      elSdr.className = 'kpi-value';
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
    const now = new Date();
    const opts = { day: '2-digit', month: 'short', year: 'numeric' };
    elDateSub.textContent = 'Daily Gest\u00E3o Comercial \u2014 ' + now.toLocaleDateString('pt-BR', opts);
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

  const month = BOOKED_META_SRC.month || 'Mes atual';
  monthLabel.textContent = `Meta Oficial (Stretch) - ${month}`;
  stretch.textContent = formatBRL(BOOKED_META_SRC.target);

  const buckets = Array.isArray(BOOKED_META_SRC.buckets) ? BOOKED_META_SRC.buckets : [];
  const missing = buckets.filter(bucket => typeof bucket.rr_sdr_dia_target !== 'number');
  if (missing.length > 0) {
    opsAlert.classList.add('show');
    opsAlert.textContent = `CRITICO: RR/SDR/DIA alvo ausente em ${month} para: ${missing.map(bucket => bucket.label || 'Baldinho').join(', ')}.`;
  } else {
    opsAlert.classList.remove('show');
    opsAlert.textContent = '';
  }

  body.innerHTML = buckets.map(bucket => {
    const rr = (typeof bucket.rr_sdr_dia_target === 'number')
      ? String(bucket.rr_sdr_dia_target).replace('.', ',')
      : 'AUSENTE';
    return `<tr>
      <td>${esc(bucket.label || 'Baldinho')}</td>
      <td>${formatBRL(bucket.target || 0)}</td>
      <td>${(typeof bucket.schools_target === 'number') ? Number(bucket.schools_target).toLocaleString('pt-BR') : '-'}</td>
      <td>${(typeof bucket.rr_target === 'number') ? Number(bucket.rr_target).toLocaleString('pt-BR') : '-'}</td>
      <td>${rr}</td>
    </tr>`;
  }).join('');
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

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderWins() {
  const el = document.getElementById('winsList');
  if (!el) return;
  const backendWins = (BOOKED_META_SRC && Array.isArray(BOOKED_META_SRC.wins))
    ? BOOKED_META_SRC.wins.filter(win => isDateInCurrentWeek(win.data))
    : [];
  const localWins = localWeeklyWins(tasks);
  const merged = [...localWins, ...backendWins, ...WINS].filter(win => isDateInCurrentWeek(win.data));
  const seen = new Set();
  const source = merged.filter(win => {
    const key = `${win.titulo}|${win.dri}|${win.data}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  el.innerHTML = source.map(win => `
    <div class="win-item">
      <div class="win-emoji">${win.emoji}</div>
      <div class="win-body">
        <div class="win-title">${esc(stripLeadingBracketTag(win.titulo))}</div>
        <div class="win-desc">${esc(win.desc)}</div>
        <div class="win-foot">
          <span class="win-dri">${esc(win.dri)}</span>
          <span class="win-date">${esc(win.data)}</span>
        </div>
      </div>
    </div>`).join('');
  const badge = document.getElementById('winsCount');
  if (badge) badge.textContent = source.length;
}

function renderIntel() {
  const summaryEl = document.getElementById('intelSummaryList');
  const criticasEl = document.getElementById('criticasList');
  const criticasArchEl = document.getElementById('criticasArchivedList');
  const aprendizadosEl = document.getElementById('aprendizadosList');
  const arquivadosEl = document.getElementById('aprendizadosArchivedList');
  if (!summaryEl || !criticasEl || !criticasArchEl || !aprendizadosEl || !arquivadosEl) return;

  const intelSource = (REQUIRE_LOGIN_FOR_READ && !_sbSession) ? DEMO_INTEL : INTEL_SRC;
  if (!intelSource) {
    const msg = '<span style="color:var(--t3);font-size:12px">Intel autenticada indisponivel no bootstrap.</span>';
    summaryEl.innerHTML = msg;
    criticasEl.innerHTML = msg;
    criticasArchEl.innerHTML = msg;
    aprendizadosEl.innerHTML = msg;
    arquivadosEl.innerHTML = msg;
    return;
  }

  const summaries = (intelSource.resumos_tematicos || []).slice(0, 4);
  if (!summaries.length) {
    summaryEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Sem resumos tematicos disponiveis.</span>';
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

  const criticas = (intelSource.criticas_ativas || []).filter(item => !item.status || item.status === 'aberta');
  if (!criticas.length) {
    criticasEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Nenhum alerta ativo no momento.</span>';
  } else {
    criticasEl.innerHTML = criticas.map(item => {
      const stripeCls = item.prioridade === 'critica' ? '' : item.prioridade === 'alta' ? 'alta' : 'media';
      const chipCls = stripeCls;
      const label = item.prioridade === 'critica' ? 'Critico' : item.prioridade === 'alta' ? 'Alta' : 'Media';
      return `<div class="critica-item">
        <div class="critica-stripe ${stripeCls}"></div>
        <div class="critica-body">
          <div class="critica-title">${esc(item.titulo)}</div>
          <div class="critica-text">${esc(item.critica)}</div>
          ${item.acao_sugerida ? `<div class="critica-acao">→ ${esc(item.acao_sugerida)}</div>` : ''}
          <div class="critica-footer">
            <span class="critica-chip ${chipCls}">${label}</span>
            ${item.id ? `<span class="intel-id alerta">ID: ${esc(item.id)}</span>` : ''}
            ${item.dri ? `<span class="critica-dri">DRI: ${esc(item.dri)}</span>` : ''}
            <span class="critica-dri">${esc(item.data || '')}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  const aprendizados = (intelSource.aprendizados || [])
    .filter(item => !item.status || item.status === 'ativo')
    .slice().reverse().slice(0, 6);
  if (!aprendizados.length) {
    aprendizadosEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Sem aprendizados registrados.</span>';
  } else {
    aprendizadosEl.innerHTML = aprendizados.map(item => {
      const stripeCls = item.confianca === 'alta' ? '' : item.confianca === 'media' ? 'media' : 'baixa';
      const tags = (item.aplicavel_a || []).map(tag => `<span class="aprendizado-tag">${esc(tag)}</span>`).join('');
      return `<div class="aprendizado-item">
        <div class="aprendizado-stripe ${stripeCls}"></div>
        <div class="aprendizado-body">
        <div class="aprendizado-insight">${esc(item.insight)}</div>
        ${item.evidencia ? `<div class="aprendizado-evidencia">&#128202; ${esc(item.evidencia)}</div>` : ''}
        ${item.acao_sugerida ? `<div class="aprendizado-acao">→ ${esc(item.acao_sugerida)}</div>` : ''}
        ${item.fonte ? `<div class="aprendizado-evidencia" style="color:var(--t4);margin-top:3px">Fonte: ${esc(item.fonte)}</div>` : ''}
        ${item.id ? `<div class="aprendizado-evidencia" style="margin-top:3px"><span class="intel-id insight">ID: ${esc(item.id)}</span></div>` : ''}
          ${tags ? `<div class="aprendizado-tags">${tags}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  const criticasArch = (intelSource.criticas_ativas || []).filter(item => item.status && item.status !== 'aberta');
  if (!criticasArch.length) {
    criticasArchEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Sem alertas arquivados.</span>';
  } else {
    criticasArchEl.innerHTML = criticasArch.map(item => {
      const stripeCls = item.prioridade === 'critica' ? '' : item.prioridade === 'alta' ? 'alta' : 'media';
      const chipCls = stripeCls;
      const label = item.prioridade === 'critica' ? 'Critico' : item.prioridade === 'alta' ? 'Alta' : 'Media';
      const statusTxt = item.status ? `Status: ${item.status}` : '';
      return `<div class="critica-item">
        <div class="critica-stripe ${stripeCls}"></div>
        <div class="critica-body">
          <div class="critica-title">${esc(item.titulo)}</div>
          <div class="critica-text">${esc(item.critica)}</div>
          ${item.acao_sugerida ? `<div class="critica-acao">→ ${esc(item.acao_sugerida)}</div>` : ''}
          <div class="critica-footer">
            <span class="critica-chip ${chipCls}">${label}</span>
            ${item.id ? `<span class="intel-id alerta">ID: ${esc(item.id)}</span>` : ''}
            ${item.dri ? `<span class="critica-dri">DRI: ${esc(item.dri)}</span>` : ''}
            <span class="critica-dri">${esc(item.data || '')}</span>
          </div>
          ${statusTxt ? `<div class="critica-dri" style="margin-top:4px">${esc(statusTxt)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  const arquivados = (intelSource.aprendizados || [])
    .filter(item => item.status && item.status !== 'ativo')
    .slice().reverse().slice(0, 10);
  if (!arquivados.length) {
    arquivadosEl.innerHTML = '<span style="color:var(--t3);font-size:12px">Sem aprendizados arquivados.</span>';
  } else {
    arquivadosEl.innerHTML = arquivados.map(item => {
      const stripeCls = item.confianca === 'alta' ? '' : item.confianca === 'media' ? 'media' : 'baixa';
      const tags = (item.aplicavel_a || []).map(tag => `<span class="aprendizado-tag">${esc(tag)}</span>`).join('');
      const statusTxt = item.status ? `Status: ${item.status}` : '';
      return `<div class="aprendizado-item">
        <div class="aprendizado-stripe ${stripeCls}"></div>
        <div class="aprendizado-body">
        <div class="aprendizado-insight">${esc(item.insight)}</div>
        ${item.evidencia ? `<div class="aprendizado-evidencia">&#128202; ${esc(item.evidencia)}</div>` : ''}
        ${item.acao_sugerida ? `<div class="aprendizado-acao">→ ${esc(item.acao_sugerida)}</div>` : ''}
        ${item.fonte ? `<div class="aprendizado-evidencia" style="color:var(--t4);margin-top:3px">Fonte: ${esc(item.fonte)}</div>` : ''}
        ${item.id ? `<div class="aprendizado-evidencia" style="margin-top:3px"><span class="intel-id insight">ID: ${esc(item.id)}</span></div>` : ''}
        ${statusTxt ? `<div class="aprendizado-evidencia" style="margin-top:3px">${esc(statusTxt)}</div>` : ''}
          ${tags ? `<div class="aprendizado-tags">${tags}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }
}
