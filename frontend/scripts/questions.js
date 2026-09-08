(function () {
const SESSION_CHECK_MS = 5000;
let roundMapCache = null;
const gameId = TriviaSession.id() || localStorage.getItem('gameId') || sessionStorage.getItem('gameId');
const membership = TriviaSession.membership(gameId);
if (!membership) { window.location.replace('play.html'); return; }
TriviaSession.select(gameId);
TriviaSession.save(membership);
const teamId = String(membership.teamId);
const teamName = membership.teamName;
const API_BASE = TriviaSession.base(gameId);
let currentQuestion = new URLSearchParams(window.location.search).get('q') || 1;
currentQuestion = Math.max(1, parseInt(currentQuestion, 10) || 1);
let maxQuestions = 21;
let questionConfig = {};
let hasResetAlerted = false;


const submitBtn = document.querySelector('.btn');
const submitLabel = submitBtn?.querySelector('.btn__label') || submitBtn;
const answerField = document.querySelector('.answer');
const pointsButtonsContainer = document.querySelector('.points-buttons');

if (submitBtn) submitBtn.disabled = true;

function setSubmitLabel(text) {
  if (submitLabel) submitLabel.textContent = text;
}

function getSubmitLabel() {
  return submitLabel ? submitLabel.textContent : '';
}

function setSubmittingState(isSubmitting) {
  if (!submitBtn) return;
  submitBtn.classList.toggle('is-submitting', isSubmitting);
  submitBtn.setAttribute('aria-busy', isSubmitting ? 'true' : 'false');
}

function formatPointsLabel(value) {
  const numeric = Number(value);
  if (numeric === 0.5) return '1/2';
  return String(value);
}

function isSubmitLocked() {
  return submitBtn?.dataset.locked === 'true';
}

async function confirmAnswerSaved(retries = 3) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await fetch(API_BASE + '/answers/' + currentQuestion, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to check answer');
      const answers = await res.json();
      const hasAnswered = answers.some(ans => ans.team_id === parseInt(teamId, 10) && (ans.answer || '').trim());
      if (hasAnswered) return true;
    } catch (err) {
      console.error('Error confirming saved answer:', err);
    }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  return false;
}

function updateSubmitDisabled() {
  if (!submitBtn || isSubmitLocked()) return;
  const answer = answerField ? answerField.value.trim() : '';
  const selectedBtn = pointsButtonsContainer?.querySelector('.points-btn-square.active');
  const hasPoints = Boolean(selectedBtn) && !selectedBtn.disabled && !selectedBtn.classList.contains('locked');
  const wasDisabled = submitBtn.disabled;
  submitBtn.disabled = !(answer && hasPoints);
  if (wasDisabled && !submitBtn.disabled) {
    submitBtn.classList.remove('btn-flash');
    void submitBtn.offsetWidth;
    submitBtn.classList.add('btn-flash');
    setTimeout(() => {
      submitBtn.classList.remove('btn-flash');
    }, 500);
  }
}

function ensureSparkles() {
  if (!submitBtn) return;
  const layer = submitBtn.querySelector('.btn__sparkle-layer');
  if (!layer || layer.children.length) return;
  const sparkleCount = 10;
  for (let i = 0; i < sparkleCount; i++) {
    const sparkle = document.createElement('span');
    sparkle.className = 'btn__sparkle';
    const x = (Math.random() * 120 - 60).toFixed(0);
    const y = (Math.random() * 60 - 30).toFixed(0);
    const delay = Math.floor(Math.random() * 300);
    sparkle.style.setProperty('--x', `${x}px`);
    sparkle.style.setProperty('--y', `${y}px`);
    sparkle.style.setProperty('--d', `${delay}ms`);
    layer.appendChild(sparkle);
  }
}

let validationPending = null;
async function validateGameSession() {
  if (hasResetAlerted) return false;
  if (validationPending) return validationPending;
  validationPending = (async () => {
    try {
      const data = await TriviaSession.request(API_BASE + '/team/' + teamId + '/exists');
      if (data.exists) return true;
    } catch (error) {
      if (error.status !== 404) { console.error(error); return false; }
    }
    hasResetAlerted = true;
    TriviaSession.clear(gameId);
    alert('Your session was deleted or reset, or your team was removed. Please join again.');
    window.location.replace('play.html');
    return false;
  })();
  try { return await validationPending; } finally { validationPending = null; }
}

async function updatePageForQuestion(questionNum) {
  const teamNameDisplay = document.getElementById('teamNameDisplay');
  if (teamNameDisplay) {
    if (teamName) teamNameDisplay.textContent = String(teamName);
    else teamNameDisplay.style.display = 'none';
  }
  const fallbackLabel = `Question ${questionNum}`;
  document.querySelector('.question-header').textContent = fallbackLabel;
  document.title = `Pub Trivia - ${fallbackLabel}`;

  const progress = document.querySelector('.question-progress');
  const progressBar = document.querySelector('.question-progress__bar');
  if (progress && progressBar) {
    progress.setAttribute('aria-valuemax', String(maxQuestions));
    const percent = Math.min(100, Math.max(0, (questionNum / maxQuestions) * 100));
    progress.setAttribute('aria-valuenow', String(questionNum));
    progressBar.style.width = `${percent}%`;
  }

  if (!await validateGameSession()) return;

  // Clear answer field for new question
  if (answerField) answerField.value = '';
  await loadQuestionConfig();
  await checkAnswerExists();
  updateSubmitDisabled();
}

async function loadRoundMap() {
  if (roundMapCache) return roundMapCache;
  const rounds = {};
  const requests = Array.from({ length: maxQuestions }, (_, idx) => idx + 1)
    .map(async (num) => {
      try {
        const res = await fetch(`${API_BASE}/question-config/${num}`, { cache: 'no-store' });
        if (!res.ok) return;
        const cfg = await res.json();
        rounds[num] = cfg.round;
      } catch (err) {
        console.error('Error loading question config for round map:', err);
      }
    });
  await Promise.all(requests);
  roundMapCache = rounds;
  return rounds;
}

async function getUsedPointsForRound(roundNumber) {
  try {
    const res = await fetch(API_BASE + '/all-answers', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load answers');
    const data = await res.json();
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const rounds = await loadRoundMap();
    const used = new Set();
    answers.forEach(ans => {
      if (ans.team_id !== parseInt(teamId, 10)) return;
      const round = rounds[ans.question_number];
      if (round !== roundNumber) return;
      const chosen = Number(ans.chosen_points);
      if (Number.isFinite(chosen)) used.add(chosen);
    });
    return used;
  } catch (err) {
    console.error('Error checking used points:', err);
    return new Set();
  }
}

async function getAnsweredQuestionsForTeam() {
  const answered = new Set();
  const res = await fetch(API_BASE + '/all-answers', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load answers');
  const data = await res.json();
  const answers = Array.isArray(data.answers) ? data.answers : [];
  answers.forEach(ans => {
    if (ans.team_id !== parseInt(teamId, 10)) return;
    const qNum = Number(ans.question_number);
    const answerText = (ans.answer || '').trim();
    if (Number.isFinite(qNum) && answerText) answered.add(qNum);
  });
  return answered;
}

async function redirectIfAnsweredQuestion() {
  try {
    const answered = await getAnsweredQuestionsForTeam();
    if (!answered.has(currentQuestion)) return false;
    let nextUnanswered = null;
    for (let i = 1; i <= maxQuestions; i += 1) {
      if (!answered.has(i)) {
        nextUnanswered = i;
        break;
      }
    }
    if (!nextUnanswered || nextUnanswered === currentQuestion) return false;
    window.location.replace(TriviaSession.url('questions.html', gameId, { q: nextUnanswered }));
    return true;
  } catch (err) {
    console.error('Error finding next unanswered question:', err);
    return false;
  }
}

async function checkAnswerExists() {
  try {
    const res = await fetch(API_BASE + '/answers/' + currentQuestion);
    if (!res.ok) throw new Error('Failed to check answer');
    const answers = await res.json();

    const hasAnswered = answers.some(ans => {
      if (ans.team_id !== parseInt(teamId, 10)) return false;
      return (ans.answer || '').trim().length > 0;
    });
    if (hasAnswered) {
      document.querySelector('.answer').disabled = true;
      if (submitBtn) submitBtn.disabled = true;
      if (submitBtn) submitBtn.dataset.locked = 'true';
      document.querySelectorAll('.points-btn-square').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
      });
      const answerField = answers.find(ans => ans.team_id === parseInt(teamId, 10));
      document.querySelector('.answer').value = answerField.answer;
      document.querySelector('.answer').style.opacity = '0.6';

      const bonusItem = document.querySelector('.bonus-answer');
      if (bonusItem && answerField.bonus_answer) {
        bonusItem.value = answerField.bonus_answer;
        bonusItem.disabled = true;
        bonusItem.style.opacity = '0.6';
      }

      if (submitBtn) submitBtn.style.opacity = '0.6';
      setSubmittingState(false);
      setSubmitLabel('Already Submitted');
    }
  } catch (err) {
    console.error('Error checking answer:', err);
  }
}

async function loadQuestionConfig() {
  try {
    const res = await fetch(API_BASE + '/question-config/' + currentQuestion, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load question config');
    questionConfig = await res.json();

    const label = questionConfig.label || `Question ${currentQuestion}`;
    document.querySelector('.question-header').textContent = label;
    document.title = `Pub Trivia - ${label}`;

    // Display category and icon if available
    const categoryDisplay = document.getElementById('categoryDisplay');
    const categoryIcon = document.getElementById('categoryIcon');
    const categoryLabel = document.getElementById('categoryLabel');
    
    if (questionConfig.category || questionConfig.icon) {
      categoryDisplay.style.display = 'flex';
      if (questionConfig.icon) {
        categoryIcon.textContent = questionConfig.icon;
        categoryIcon.style.display = 'inline';
      } else {
        categoryIcon.style.display = 'none';
      }
      if (questionConfig.category) {
        categoryLabel.textContent = questionConfig.category;
        categoryLabel.style.display = 'inline';
      } else {
        categoryLabel.style.display = 'none';
      }
    } else {
      categoryDisplay.style.display = 'none';
    }

    const pointsWrap = document.querySelector('.points-wrap');
    const pointsButtons = document.querySelector('.points-buttons');
    const bonusLabel = document.querySelector('.bonus-label');
    const bonusField = document.querySelector('.bonus-answer');

    // Always clear and repopulate points buttons
    pointsButtons.innerHTML = '';
    pointsButtons.dataset.selected = '';
    let allowedPoints = Array.isArray(questionConfig.allowedPoints) ? questionConfig.allowedPoints : [];
    if (!allowedPoints.length) {
      const fallback = Number.isFinite(questionConfig.defaultPoints) ? questionConfig.defaultPoints : 0;
      allowedPoints = [fallback];
    }
    allowedPoints.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'points-btn-square';
      btn.textContent = formatPointsLabel(p);
      btn.dataset.value = String(p);
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        pointsButtons.querySelectorAll('.points-btn-square').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pointsButtons.dataset.selected = String(p);
        updateSubmitDisabled();
      });
      pointsButtons.appendChild(btn);
    });

    pointsWrap.style.display = 'flex';
    const rounds = await loadRoundMap();
    const currentRound = rounds[currentQuestion];
    if (Number.isFinite(currentRound)) {
      const usedPoints = await getUsedPointsForRound(currentRound);
      pointsButtons.querySelectorAll('.points-btn-square').forEach(btn => {
        const value = Number(btn.dataset.value);
        if (usedPoints.has(value)) {
          btn.disabled = true;
          btn.classList.add('locked');
        }
      });
    }

    if (!questionConfig.allowChangePoints) {
      pointsButtons.querySelectorAll('.points-btn-square').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
      });
    }

    // Always show bonus answer box, but grey out and disable if not allowed
    bonusLabel.style.display = 'block';
    bonusField.style.display = 'block';
    if (!questionConfig.bonusAnswer) {
      bonusField.disabled = true;
      bonusField.style.opacity = '0.6';
    } else {
      bonusField.disabled = false;
      bonusField.style.opacity = '1';
    }
  } catch (err) {
    console.error('Error loading question config:', err);
  }
}

if (answerField) {
  answerField.addEventListener('input', updateSubmitDisabled);
}

if (submitBtn) submitBtn.addEventListener('click', async () => {
  const answer = document.querySelector('.answer').value.trim();
  if (!answer) {
    alert('Please enter an answer.');
    return;
  }
  submitBtn.disabled = true;
  const originalText = getSubmitLabel();
  setSubmitLabel('Submitting...');
  ensureSparkles();
  setSubmittingState(true);
  let duplicateAnswered = false;
  try {
    const bonusField = document.querySelector('.bonus-answer');
    const bonusAnswer = bonusField.style.display === 'none' ? null : bonusField.value.trim();
    const pointsButtons = document.querySelector('.points-buttons');
    const selectedBtn = pointsButtons?.querySelector('.points-btn-square.active');
    if (!selectedBtn || selectedBtn.classList.contains('locked')) {
      alert('Please choose an available points value.');
      submitBtn.disabled = false;
      setSubmittingState(false);
      setSubmitLabel(originalText);
      return;
    }
    const points = Number.parseFloat(selectedBtn.dataset.value || '0');
    if (!Number.isFinite(points)) {
      alert('Please choose an available points value.');
      submitBtn.disabled = false;
      setSubmittingState(false);
      setSubmitLabel(originalText);
      return;
    }
    if (!await validateGameSession()) throw new Error('Unable to validate your team. Please try again.');
    const res = await fetch(API_BASE + '/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: parseInt(teamId), question: currentQuestion, answer, bonusAnswer, points })
    });
    if (!res.ok) {
      if (res.status === 409) {
        const redirected = await redirectIfAnsweredQuestion();
        if (redirected) return;
        duplicateAnswered = true;
      }
      throw new Error(duplicateAnswered ? 'You already answered this question.' : 'Failed to submit answer');
    }
    const saved = await confirmAnswerSaved();
    if (!saved) {
      throw new Error('Answer not saved yet. Please try again.');
    }
    // Move to next question after successful submit (if not at max)
    if (currentQuestion < maxQuestions) {
      currentQuestion++;
      setTimeout(() => {
        window.location.href = TriviaSession.url('questions.html', gameId, { q: currentQuestion });
      }, 1400);
    } else {
      alert(`Congratulations, you have completed the game!`);
      if (answerField) answerField.disabled = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.locked = 'true';
        submitBtn.style.opacity = '0.6';
      }
      document.querySelectorAll('.points-btn-square').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
      });
      const bonusField = document.querySelector('.bonus-answer');
      if (bonusField) {
        bonusField.disabled = true;
        bonusField.style.opacity = '0.6';
      }
      setSubmittingState(false);
      setSubmitLabel('Submitted');
    }
  } catch (err) {
    alert(`Error submitting answer: ${err.message}`);
    submitBtn.disabled = false;
    setSubmittingState(false);
    setSubmitLabel(originalText);
  }
});

TriviaSession.request(API_BASE).then(game => {
  document.getElementById('gameNameDisplay').textContent = game.name;
}).catch(error => console.error(error));

// Initialize page for current question + session validation
(async () => {
  const ok = await validateGameSession();
  if (!ok) return;
  try {
    const configRes = await fetch('/api/config', { cache: 'no-store' });
    if (configRes.ok) {
      const cfg = await configRes.json();
      if (Number.isFinite(cfg.maxQuestions) && cfg.maxQuestions > 0) {
        maxQuestions = cfg.maxQuestions;
      }
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
  if (currentQuestion > maxQuestions) currentQuestion = maxQuestions;
  const redirected = await redirectIfAnsweredQuestion();
  if (redirected) return;
  await updatePageForQuestion(currentQuestion);

  // Periodic session validation (handles reset while user is idle)
  setInterval(validateGameSession, SESSION_CHECK_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      validateGameSession();

    }
  });
})();

})();
