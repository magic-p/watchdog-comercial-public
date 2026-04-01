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
      default:
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

  const counts = {};
  tasks.forEach(t => {
    if (t.done) return;
    const owner = normalizeOwnerName(t.owner) || 'Sem dono';
    counts[owner] = (counts[owner] || 0) + 1;
  });

  const allOwners = [...new Set(tasks.map(t => normalizeOwnerName(t.owner) || 'Sem dono'))]
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

  if (ownerFilter && !allOwners.includes(ownerFilter)) allOwners.unshift(ownerFilter);

  const totalOpen = tasks.filter(t => !t.done).length;
  bar.innerHTML = '';

  const lbl = document.createElement('span');
  lbl.className = 'owner-filter-label';
  lbl.textContent = 'Filtrar:';
  bar.appendChild(lbl);

  const allPill = document.createElement('button');
  allPill.type = 'button';
  allPill.className = 'owner-pill' + (ownerFilter === null ? ' active' : '');
  allPill.innerHTML = `Todos <span class="pill-count">${totalOpen}</span>`;
  allPill.setAttribute('aria-pressed', ownerFilter === null ? 'true' : 'false');
  allPill.addEventListener('click', () => { ownerFilter = null; saveUiState(); buildOwnerFilters(); renderTasks(); });
  bar.appendChild(allPill);

  allOwners.forEach(owner => {
    const openCount = counts[owner] || 0;
    if (openCount === 0 && owner !== ownerFilter) return;
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
          <option value="done" ${t.done ? 'selected' : ''}>Concluído</option>
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
        task.tierLabel = 'Concluído';
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
        task.tierLabel = 'Concluído';
        task.priorityRank = null;
        task.completedAt = new Date().toISOString();
        task.updatedAt = new Date().toISOString();
      } else {
        const s = SEED.find(s => s.id === id);
        task.completedAt = null;
        task.tier = s ? (s.tier === 'done' ? 't2' : s.tier) : 't2';
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
    `${n} tarefa${n!==1?'s':''} • ${d} concluída${d!==1?'s':''}`;
}
