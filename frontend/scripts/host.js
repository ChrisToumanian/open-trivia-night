const $ = selector => document.querySelector(selector);
const api = TriviaSession.request;
let sessions = [];
let selected = null;
let currentQuestion = 1;
let maxQuestions = 21;
let categories = [];
let meta = {};
let teams = [];
let answers = [];
const dirty = new Map();
let busy = false;
let ready = false;
let dialogMode = '';
let dialogSessionId = null;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const questionKey = id => `controlpanel.${id}.currentQuestion`;
const scoped = (suffix = '') => TriviaSession.base(selected.id) + suffix;
function message(text = '', error = false) {
  $('#hostStatus').textContent = text;
  $('#hostStatus').classList.toggle('is-error', error);
}
function syncControls() {
  $('#gamePanel').hidden = !selected;
  $('#gamePanel').inert = busy || !ready || !selected;
  $('#gamePanel').setAttribute('aria-busy', String(busy));
  $('#emptySession').hidden = !!selected || busy;
  $('#sessionToggle').disabled = busy;
  $('#emptyCreate').disabled = busy;
  $('.nav-prev').disabled = currentQuestion <= 1;
  $('.nav-next').disabled = currentQuestion >= maxQuestions;
}
// Every load/write/navigation takes this lock. A switch cannot interleave with a
// score save or render; the target session and question stay fixed until it ends.
async function action(task) {
  if (busy) return;
  const previousFocus = document.activeElement;
  const previousSession = selected?.id;
  const scoreTeam = previousFocus.closest?.('tr[data-team-id]')?.dataset.teamId;
  const scoreButton = previousFocus.classList.contains('points-btn') ? (previousFocus.classList.contains('plus') ? 'plus' : 'minus') : null;
  busy = true;
  syncControls();
  try { await task(); }
  catch (error) { message(error.message + (dirty.size ? ' Your scores are still pending; retry before switching.' : ''), true); }
  finally {
    busy = false; syncControls();
    if (!$('#sessionDialog').open && document.activeElement === document.body && previousFocus !== document.body) {
      const scoreFocus = previousSession === selected?.id && scoreButton ? $(`tr[data-team-id="${scoreTeam}"] .${scoreButton}`) : null;
      (scoreFocus || (previousFocus.isConnected && !previousFocus.disabled ? previousFocus : $('#sessionToggle'))).focus();
    }
  }
}
function closeMenu(focus = false) {
  $('#sessionMenu').hidden = true;
  $('#sessionToggle').setAttribute('aria-expanded', 'false');
  if (focus) $('#sessionToggle').focus();
}
function renderMenu() {
  $('#sessionName').textContent = selected?.name || 'Select a session';
  $('#sessionPin').textContent = selected?.passcode || '—';
  $('#sessionMenu').innerHTML = sessions.map(game => `<button role="menuitemradio" aria-checked="${game.id === selected?.id}" data-session="${game.id}"><span>${game.id === selected?.id ? '✓ ' : ''}${escapeHtml(game.name)}</span><small>${game.passcode}</small></button>`).join('') +
    `<div role="separator"></div><button role="menuitem" data-action="create">+ Create session</button><button role="menuitem" data-action="rename" ${selected ? '' : 'disabled'}>Rename session…</button><button role="menuitem" data-action="delete" class="danger-text" ${selected ? '' : 'disabled'}>Delete session…</button>`;
}
async function refreshSessions() {
  sessions = await api('/api/sessions');
  if (selected) {
    const fresh = sessions.find(game => game.id === selected.id);
    if (!fresh) {
      selected = null; ready = false; dirty.clear(); teams = []; answers = [];
      TriviaSession.select(null);
      message('This session was deleted. Choose or create a session.');
    } else {
      if (fresh.revision !== selected.revision) {
        dirty.clear(); currentQuestion = 1; ready = false;
        localStorage.setItem(questionKey(fresh.id), '1');
        message('This session was reset. Teams will need to join again.');
      }
      selected = fresh;
    }
  }
  renderMenu();
}
function renderTeams() {
  const totals = new Map();
  const byTeam = new Map();
  for (const answer of answers) {
    totals.set(answer.team_id, (totals.get(answer.team_id) || 0) + (answer.awarded_points || 0));
    if (answer.question_number === currentQuestion) byTeam.set(answer.team_id, answer);
  }
  $('#teams-body').innerHTML = teams.length ? teams.map(team => {
    const answer = byTeam.get(team.id) || {};
    const awarded = dirty.get(team.id) ?? answer.awarded_points ?? 0;
    const total = (totals.get(team.id) || 0) + awarded - (answer.awarded_points || 0);
    return `<tr data-team-id="${team.id}"><td class="team"><div class="team-cell-wrapper"><span class="team-name">${escapeHtml(team.name)}</span><button class="team-actions-btn" data-delete="${team.id}" aria-label="Delete ${escapeHtml(team.name)}" title="Delete team">×</button></div></td><td class="answer">${escapeHtml(answer.answer)}</td><td class="bonus-answer">${escapeHtml(answer.bonus_answer)}</td><td class="chosen-points">${answer.chosen_points ?? 0}</td><td><div class="points-controls"><button class="points-btn minus" aria-label="Subtract points">−</button><span class="points-value">${awarded}</span><button class="points-btn plus" aria-label="Add points">+</button></div></td><td class="total">${total}</td></tr>`;
  }).join('') : '<tr><td colspan="6">No teams yet — share the PIN to invite players.</td></tr>';
}
function renderCategory() {
  const select = $('#categorySelect');
  select.innerHTML = '<option value="">Choose a category</option>';
  categories.forEach((item, index) => select.add(new Option(`${item.icon || ''} ${item.label}`, String(index))));
  const match = categories.findIndex(item => item.label === meta.category && (item.icon || '') === (meta.icon || ''));
  if (match >= 0) select.value = String(match);
  else if (meta.category || meta.icon) {
    select.add(new Option(`${meta.icon || ''} ${meta.category || ''}`, 'custom'));
    select.value = 'custom';
  }
  select.classList.toggle('is-placeholder', select.value === '');
}
async function loadGame() {
  if (!selected) return;
  const [data, question] = await Promise.all([api(scoped('/all-answers')), api(scoped('/question-config/' + currentQuestion))]);
  teams = data.teams; answers = data.answers; meta = question;
  // A team removed by another host must not leave an unsavable dirty score.
  for (const id of dirty.keys()) if (!teams.some(team => team.id === id)) dirty.delete(id);
  renderTeams(); renderCategory();
  $('.question-header').textContent = meta.label || `Question ${currentQuestion}`;
  $('.leaderboard-link').href = TriviaSession.url('leaderboard.html', selected.id);
  localStorage.setItem(questionKey(selected.id), String(currentQuestion));
  ready = true;
}
async function saveScores() {
  if (!selected || !dirty.size) return;
  const base = scoped('/answer');
  const question = currentQuestion;
  for (const [teamId, awardedPoints] of dirty) {
    try {
      await api(base, { method: 'POST', body: JSON.stringify({ teamId, question, awardedPoints }) });
    } catch (error) {
      if (error.status === 404) {
        const team = await api(scoped('/team/' + teamId + '/exists'));
        if (!team.exists) {
          dirty.delete(teamId);
          teams = teams.filter(item => item.id !== teamId);
          answers = answers.filter(item => item.team_id !== teamId);
          continue;
        }
      }
      throw error;
    }
    let saved = answers.find(answer => answer.team_id === teamId && answer.question_number === question);
    if (!saved) { saved = { team_id: teamId, question_number: question }; answers.push(saved); }
    saved.awarded_points = awardedPoints;
    dirty.delete(teamId);
  }
  message('Scores saved.');
}
async function switchSession(id) {
  await saveScores();
  const game = sessions.find(item => item.id === Number(id));
  if (!game) throw new Error('Session no longer exists');
  selected = game;
  dirty.clear(); teams = []; answers = []; meta = {}; ready = false;
  const stored = Number(localStorage.getItem(questionKey(game.id)));
  currentQuestion = Number.isInteger(stored) && stored >= 1 && stored <= maxQuestions ? stored : 1;
  TriviaSession.select(game.id);
  renderMenu(); renderTeams();
  message();
  await loadGame();
}
$('#sessionToggle').addEventListener('click', () => {
  const opening = $('#sessionMenu').hidden;
  $('#sessionMenu').hidden = !opening;
  $('#sessionToggle').setAttribute('aria-expanded', String(opening));
  if (opening) $('#sessionMenu button:not(:disabled)')?.focus();
});
$('.session-picker').addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeMenu(true); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  $('#sessionMenu').hidden = false; $('#sessionToggle').setAttribute('aria-expanded', 'true');
  const items = [...$('#sessionMenu').querySelectorAll('button:not(:disabled)')];
  const index = items.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
  items[next]?.focus();
});
$('.session-picker').addEventListener('focusout', event => { if (!$('.session-picker').contains(event.relatedTarget)) closeMenu(); });
document.addEventListener('click', event => { if (!event.target.closest('.session-picker')) closeMenu(); });
$('#sessionMenu').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  closeMenu();
  if (button.dataset.session) action(async () => { await switchSession(button.dataset.session); });
  else openDialog(button.dataset.action);
});
async function openDialog(mode) {
  await action(async () => {
    await refreshSessions();
    if (mode !== 'create' && !selected) return;
    await saveScores();
    dialogMode = mode; dialogSessionId = selected?.id;
    const titles = { create: 'Create session', rename: 'Rename session', delete: 'Delete session', reset: 'Reset game' };
    $('#dialogTitle').textContent = titles[mode];
    $('#dialogSubmit').textContent = titles[mode];
    $('#dialogSubmit').classList.toggle('danger-text', mode === 'delete');
    $('#dialogDescription').textContent = mode === 'delete' ? `Delete “${selected.name}”? Its teams, answers, scores, and categories will be permanently removed. Other sessions will continue.` : mode === 'reset' ? `Reset “${selected.name}”? This clears its teams, answers, scores, and categories. Players will need to rejoin. You can keep or change its PIN.` : mode === 'create' ? 'Give this game a name and a unique PIN to share with players.' : 'Change the name while keeping this session’s PIN and players.';
    const nameVisible = mode === 'create' || mode === 'rename';
    const pinVisible = mode === 'create' || mode === 'reset';
    $('#nameLabel').hidden = !nameVisible; $('#sessionNameInput').disabled = !nameVisible;
    $('#pinLabel').hidden = !pinVisible; $('#sessionPinInput').disabled = !pinVisible;
    $('#sessionNameInput').value = mode === 'create' ? '' : selected.name;
    $('#sessionPinInput').value = mode === 'create' ? (await api('/api/available-pin')).passcode : selected.passcode;
    $('#dialogError').textContent = '';
    $('#sessionDialog').showModal();
    (nameVisible ? $('#sessionNameInput') : mode === 'reset' ? $('#sessionPinInput') : $('#dialogCancel')).focus();
  });
}
$('#emptyCreate').addEventListener('click', () => openDialog('create'));
$('.reset-game').addEventListener('click', () => openDialog('reset'));
$('#dialogCancel').addEventListener('click', () => $('#sessionDialog').close());
$('#sessionDialog').addEventListener('close', () => $('#sessionToggle').focus());
$('#sessionDialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
$('#sessionForm').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    $('#sessionForm').inert = true;
    try {
      const target = dialogSessionId ? TriviaSession.base(dialogSessionId) : '';
      const name = $('#sessionNameInput').value.trim();
      const passcode = $('#sessionPinInput').value;
      let game;
      if (dialogMode === 'create') game = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ name, passcode }) });
      if (dialogMode === 'rename') game = await api(target, { method: 'PATCH', body: JSON.stringify({ name }) });
      if (dialogMode === 'delete') {
        await api(target, { method: 'DELETE' });
        localStorage.removeItem(questionKey(dialogSessionId)); selected = null; dirty.clear();
      }
      if (dialogMode === 'reset') {
        game = await api(target + '/reset', { method: 'POST', body: JSON.stringify({ passcode }) });
        localStorage.setItem(questionKey(game.id), '1'); dirty.clear(); selected = game;
      }
      // The mutation has succeeded. Close before reloading so a network error
      // cannot leave a Create button that would accidentally duplicate a session.
      $('#sessionDialog').close();
      await refreshSessions();
      const next = game?.id || sessions[0]?.id;
      if (next) await switchSession(next);
      else { TriviaSession.select(null); ready = false; renderMenu(); message('No sessions. Create one to start hosting.'); }
    } catch (error) {
      if ($('#sessionDialog').open) $('#dialogError').textContent = error.message;
      else throw error;
    } finally { $('#sessionForm').inert = false; }
  });
});
$('#teams-body').addEventListener('click', event => {
  if (busy || !selected || !ready) return;
  const button = event.target.closest('button');
  if (!button) return;
  const teamId = Number(button.closest('tr').dataset.teamId);
  if (button.dataset.delete) {
    const team = teams.find(item => item.id === teamId);
    if (!confirm(`Delete team “${team.name}” and its answers from “${selected.name}”?`)) return;
    action(async () => { await api(scoped('/team/' + teamId), { method: 'DELETE' }); dirty.delete(teamId); await loadGame(); });
    return;
  }
  const row = button.closest('tr');
  let value = Number(row.querySelector('.points-value').textContent);
  const direction = button.classList.contains('plus') ? 1 : -1;
  if (meta.allowHalfPoints && Math.abs(value + direction * 0.5) <= 1) value += direction * 0.5;
  else value += direction;
  dirty.set(teamId, value);
  // Keep the focused button alive for keyboard scoring.
  const previous = Number(row.querySelector('.points-value').textContent);
  row.querySelector('.points-value').textContent = String(value);
  row.querySelector('.total').textContent = String(Number(row.querySelector('.total').textContent) + value - previous);
  message('Saving scores shortly…');
});
for (const [selector, step] of [['.nav-prev', -1], ['.nav-next', 1]]) $(selector).addEventListener('click', () => action(async () => {
  await saveScores();
  currentQuestion = Math.min(maxQuestions, Math.max(1, currentQuestion + step));
  ready = false; await loadGame();
}));
$('#categorySelect').addEventListener('change', () => {
  const value = $('#categorySelect').value;
  if (value === 'custom') return;
  const category = value === '' ? { label: '', icon: '' } : categories[Number(value)];
  action(async () => {
    try {
      await api(scoped('/question-category'), { method: 'POST', body: JSON.stringify({ questionNumber: currentQuestion, category: category.label, icon: category.icon || '' }) });
      meta.category = category.label; meta.icon = category.icon || ''; message('Category saved.');
    } finally { renderCategory(); }
  });
});
$('.leaderboard-link').addEventListener('click', event => {
  event.preventDefault();
  action(async () => { await saveScores(); location.href = TriviaSession.url('leaderboard.html', selected.id); });
});
window.addEventListener('beforeunload', event => { if (dirty.size) { event.preventDefault(); event.returnValue = ''; } });
async function refresh() {
  if (busy || $('#sessionDialog').open || !$('#sessionMenu').hidden || document.visibilityState !== 'visible') return;
  await action(async () => { await refreshSessions(); if (selected) { await saveScores(); await loadGame(); } });
}
action(async () => {
  const [config, categoryData] = await Promise.all([api('/api/config'), api('/api/categories')]);
  maxQuestions = config.maxQuestions; categories = categoryData.categories;
  await refreshSessions();
  const requested = TriviaSession.id();
  const initial = requested ? sessions.find(game => String(game.id) === requested) : sessions[0];
  if (initial) await switchSession(initial.id);
  else message(requested ? 'That session no longer exists. Choose or create a session.' : 'Create a session to start hosting.');
});
setInterval(refresh, 5000);
document.addEventListener('visibilitychange', refresh);
