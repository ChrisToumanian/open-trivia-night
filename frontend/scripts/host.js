const API_BASE = 'https://zipfx.net:3000';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;', '"':'&quot;', "'":'&#39;'})[m];
  });
}

function formatPointsValue(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

// Get current question number from the question header
function getCurrentQuestion() {
  const headerText = document.querySelector('.question-header').textContent.trim();
  return parseInt(headerText.split(' ')[1]) || 1;
}

// Store answers by team ID for quick lookup
let answersMap = {};
let allAnswers = [];
let teamsList = [];
let totalPointsMap = {};
const dirtyPointTeams = new Set();
let isLiveRefreshing = false;
const LIVE_REFRESH_MS = 5000;

function calculateTotals() {
  totalPointsMap = {};
  allAnswers.forEach(ans => {
    if (!totalPointsMap[ans.team_id]) totalPointsMap[ans.team_id] = 0;
    totalPointsMap[ans.team_id] += ans.awarded_points || 0;
  });
}

function createTeamRow(team) {
  const answer = answersMap[team.id]?.answer || '';
  const bonusAnswer = answersMap[team.id]?.bonus_answer || '';
  const chosenPoints = answersMap[team.id]?.chosen_points ?? 0;
  const awardedPoints = answersMap[team.id]?.awarded_points ?? 0;
  const total = totalPointsMap[team.id] ?? 0;
  // Host's points selection now shows last saved value
  return `
      <tr data-team-id="${team.id}">
        <td class="team">${escapeHtml(team.name)}</td>
        <td class="answer">${escapeHtml(answer)}</td>
        <td class="bonus-answer">${escapeHtml(bonusAnswer)}</td>
        <td class="chosen-points">${formatPointsValue(chosenPoints)}</td>
        <td>
          <div class="points-controls">
            <button class="points-btn minus">&minus;</button>
            <span class="points-value">${formatPointsValue(awardedPoints)}</span>
            <button class="points-btn plus">+</button>
          </div>
        </td>
        <td class="total">${total}</td>
      </tr>
    `;
}

async function loadAllAnswersAndTeams() {
  // Fetch all answers
  const ansRes = await fetch(API_BASE + '/all-answers');
  if (!ansRes.ok) throw new Error('Failed to load all answers');
  const ansData = await ansRes.json();
  allAnswers = ansData.answers || [];
  // Fetch all teams (ensures teams with no answers are included)
  const teamRes = await fetch(API_BASE + '/teams');
  if (!teamRes.ok) throw new Error('Failed to load teams');
  const teamData = await teamRes.json();
  // Use the full team list
  teamsList = teamData || [];
  calculateTotals();
}

function snapshotDirtyPoints() {
  const snapshot = new Map();
  dirtyPointTeams.forEach((teamId) => {
    const row = document.querySelector(`tr[data-team-id="${teamId}"]`);
    if (!row) return;
    const pointsValue = row.querySelector('.points-value');
    if (!pointsValue) return;
    const totalCell = row.querySelector('.total');
    snapshot.set(teamId, {
      pointsValue: pointsValue.textContent,
      total: totalCell ? totalCell.textContent : null
    });
  });
  return snapshot;
}

function restoreDirtyPoints(snapshot) {
  snapshot.forEach((data, teamId) => {
    const row = document.querySelector(`tr[data-team-id="${teamId}"]`);
    if (!row) return;
    const pointsValue = row.querySelector('.points-value');
    if (pointsValue) pointsValue.textContent = data.pointsValue;
    const totalCell = row.querySelector('.total');
    if (totalCell && data.total !== null) totalCell.textContent = data.total;
  });
}

async function loadAnswers(options = {}) {
  const preserveDirty = Boolean(options.preserveDirty);
  const dirtySnapshot = preserveDirty ? snapshotDirtyPoints() : null;
  const question = getCurrentQuestion();
  try {
    await loadAllAnswersAndTeams();
    // Build a map of answers by team ID for the current question
    answersMap = {};
    allAnswers.filter(ans => ans.question_number === question).forEach(ans => {
      answersMap[ans.team_id] = ans;
    });
    await loadTeams();
    if (preserveDirty && dirtySnapshot) {
      restoreDirtyPoints(dirtySnapshot);
    }
  } catch (err) {
    console.error('Error loading answers:', err);
    await loadTeams();
  }
}

async function loadTeams() {
  const tbody = document.getElementById('teams-body');
  tbody.innerHTML = '<tr><td colspan="4">Loading teams...</td></tr>';
  try {
    // Use teamsList from loadAllAnswersAndTeams
    if (!teamsList || teamsList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">No teams yet</td></tr>';
      return;
    }
    tbody.innerHTML = teamsList.map(createTeamRow).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="4">Failed to load teams</td></tr>';
  }
}

// Reset Game button - requires passcode
document.querySelector('.reset-game').addEventListener('click', async () => {
  const passInput = document.querySelector('.passcode-input');
  const passcode = (passInput.value || '').trim();
  if (!passcode || passcode.length !== 4) {
    alert('Please enter a 4-digit passcode.');
    passInput.focus();
    return;
  }
  if (!confirm(`Reset game with passcode ${passcode}? This will clear all teams and answers.`)) {
    return;
  }
  try {
    const res = await fetch(API_BASE + '/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode })
    });
    if (!res.ok) throw new Error('Failed to reset game');
    // After reset, fetch the new passcode and autofill
    const gameRes = await fetch(API_BASE + '/current-game');
    let newPasscode = passcode;
    if (gameRes.ok) {
      const game = await gameRes.json();
      if (game && game.passcode) {
        newPasscode = game.passcode;
      }
    }
    passInput.value = newPasscode;
    passInput.style.color = '#999';
    answersMap = {};
    currentQuestion = 1;
    await loadTeams();
    await loadAnswers();
    await updatePill();
    // Optionally refresh the page for full reset
    // location.reload();
    alert('Game reset. New passcode set: ' + newPasscode);
  } catch (err) {
    alert(`Error resetting game: ${err.message}`);
  }
});

// Delegate points button clicks
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.points-btn');
  if (!btn) return;
  const controlsDiv = btn.closest('.points-controls');
  const pointsValue = controlsDiv.querySelector('.points-value');
  let current = Number.parseFloat(pointsValue.textContent) || 0;
  if (btn.classList.contains('plus')) {
    if (current === 0) current = 0.5;
    else if (current === 0.5) current = 1;
    else current += 1;
  } else if (btn.classList.contains('minus')) {
    if (current === 0.5) current = 0;
    else if (current === 1) current = 0.5;
    else current -= 1;
  }
  pointsValue.textContent = formatPointsValue(current);
  const row = btn.closest('tr[data-team-id]');
  if (!row) return;
  const teamId = parseInt(row.dataset.teamId, 10);
  if (!Number.isFinite(teamId)) return;
  const prevPoints = Number(answersMap[teamId]?.awarded_points ?? 0);
  const baseTotal = totalPointsMap[teamId] ?? 0;
  const delta = current - prevPoints;
  const totalCell = row.querySelector('.total');
  if (totalCell) totalCell.textContent = baseTotal + delta;
  dirtyPointTeams.add(teamId);
});

// Initial load and question navigation
const QUESTION_STORAGE_KEY = 'controlpanel.currentQuestion';
let maxQuestions = 20;
let currentQuestion = 1;
const questionLabelCache = new Map();
const questionMetaCache = new Map();

function initCurrentQuestion() {
  const storedQuestion = parseInt(localStorage.getItem(QUESTION_STORAGE_KEY) || '', 10);
  currentQuestion = Number.isFinite(storedQuestion) && storedQuestion >= 1 && storedQuestion <= maxQuestions
    ? storedQuestion
    : 1;
}

initCurrentQuestion();

async function loadQuestionMeta(questionNum) {
  if (questionMetaCache.has(questionNum)) return questionMetaCache.get(questionNum);
  try {
    const res = await fetch(API_BASE + '/question-config/' + questionNum, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load question config');
    const cfg = await res.json();
    const meta = {
      label: cfg.label || `Question ${questionNum}`,
      category: cfg.category || '',
      icon: cfg.icon || ''
    };
    questionMetaCache.set(questionNum, meta);
    questionLabelCache.set(questionNum, meta.label);
    return meta;
  } catch (err) {
    console.error('Error loading question label:', err);
    const fallback = { label: `Question ${questionNum}`, category: '', icon: '' };
    questionMetaCache.set(questionNum, fallback);
    questionLabelCache.set(questionNum, fallback.label);
    return fallback;
  }
}

function updateNavButtons() {
  const prevBtn = document.querySelector('.nav-prev');
  const nextBtn = document.querySelector('.nav-next');
  const atFirst = currentQuestion <= 1;
  const atLast = currentQuestion >= maxQuestions;
  if (prevBtn) {
    prevBtn.disabled = atFirst;
    prevBtn.setAttribute('aria-disabled', String(atFirst));
    prevBtn.style.opacity = atFirst ? '0.6' : '1';
  }
  if (nextBtn) {
    nextBtn.disabled = atLast;
    nextBtn.setAttribute('aria-disabled', String(atLast));
    nextBtn.style.opacity = atLast ? '0.6' : '1';
  }
}

async function updatePill() {
  const meta = await loadQuestionMeta(currentQuestion);
  document.querySelector('.question-header').textContent = meta.label;
  localStorage.setItem(QUESTION_STORAGE_KEY, String(currentQuestion));
  updateNavButtons();

  const categoryDisplay = document.getElementById('categoryDisplay');
  const categoryIcon = document.getElementById('categoryIcon');
  const categoryLabel = document.getElementById('categoryLabel');
  if (!categoryDisplay || !categoryIcon || !categoryLabel) return;

  const categoryText = String(meta.category || '').trim();
  const iconText = String(meta.icon || '').trim();
  if (categoryText || iconText) {
    categoryDisplay.style.display = 'flex';
    if (iconText) {
      categoryIcon.textContent = iconText;
      categoryIcon.style.display = 'inline';
    } else {
      categoryIcon.style.display = 'none';
    }
    if (categoryText) {
      categoryLabel.textContent = categoryText;
      categoryLabel.style.display = 'inline';
    } else {
      categoryLabel.style.display = 'none';
    }
  } else {
    categoryDisplay.style.display = 'none';
  }
}

async function reloadForQuestion() {
  await updatePill();
  await loadAnswers();
}

async function submitHostPointsForCurrentQuestion() {
  // For each team, get the points from the UI and submit if changed
  const question = getCurrentQuestion();
  for (const team of teamsList) {
    const row = document.querySelector(`tr[data-team-id="${team.id}"]`);
    if (!row) continue;
    const pointsValue = row.querySelector('.points-value');
    if (!pointsValue) continue;
    const newPoints = Number.parseFloat(pointsValue.textContent) || 0;
    const prevPoints = Number(answersMap[team.id]?.awarded_points ?? 0);
    if (newPoints !== prevPoints) {
      // Submit only if changed
      await fetch(API_BASE + '/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          question,
          awardedPoints: newPoints
        })
      });
      dirtyPointTeams.delete(team.id);
    }
  }
}

document.querySelectorAll('.footerbar .btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    await submitHostPointsForCurrentQuestion();
    if (btn.classList.contains('nav-prev')) {
      if (currentQuestion > 1) currentQuestion--;
    } else if (btn.classList.contains('nav-next')) {
      if (currentQuestion < maxQuestions) currentQuestion++;
    }
    await reloadForQuestion();
  });
});

const leaderboardLink = document.querySelector('.leaderboard-link');
leaderboardLink.addEventListener('click', async (event) => {
  event.preventDefault();
  await submitHostPointsForCurrentQuestion();
  window.location.href = leaderboardLink.getAttribute('href');
});

// Override getCurrentQuestion to use currentQuestion variable
function getCurrentQuestion() {
  return currentQuestion;
}

// Load current game passcode and set up input
(async () => {
  try {
    const configRes = await fetch(API_BASE + '/config', { cache: 'no-store' });
    if (configRes.ok) {
      const cfg = await configRes.json();
      if (Number.isFinite(cfg.maxQuestions) && cfg.maxQuestions > 0) {
        maxQuestions = cfg.maxQuestions;
        initCurrentQuestion();
      }
    }
    const res = await fetch(API_BASE + '/current-game');
    if (res.ok) {
      const game = await res.json();
      if (game && game.passcode) {
        const passInput = document.querySelector('.passcode-input');
        passInput.value = game.passcode;
        passInput.style.color = '#999';
      }
    }
  } catch (err) {
    console.error('Error loading current game:', err);
  }
  const passInput = document.querySelector('.passcode-input');
  passInput.addEventListener('focus', function() {
    if (this.style.color === 'rgb(153, 153, 153)') {
      this.style.color = 'inherit';
    }
  });
  passInput.addEventListener('input', function() {
    this.style.color = 'inherit';
  });
  await reloadForQuestion();
})();

setInterval(async () => {
  if (document.visibilityState !== 'visible') return;
  if (isLiveRefreshing) return;
  isLiveRefreshing = true;
  try {
    if (dirtyPointTeams.size > 0) {
      await submitHostPointsForCurrentQuestion();
    }
    await loadAnswers({ preserveDirty: true });
  } catch (err) {
    console.error('Error refreshing answers:', err);
  } finally {
    isLiveRefreshing = false;
  }
}, LIVE_REFRESH_MS);
