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
