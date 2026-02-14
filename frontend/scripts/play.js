const API_BASE = 'https://zipfx.net:3000';
let maxQuestions = 20;

// UX: auto-advance + only digits
const digits = Array.from(document.querySelectorAll('.digit'));
const teamName = document.getElementById('teamName');
const joinBtn = document.getElementById('joinBtn');

if (joinBtn) joinBtn.disabled = true;

function updateJoinDisabled() {
  if (!joinBtn) return;
  const name = teamName ? teamName.value.trim() : '';
  const code = digits.map(d => d.value).join('');
  joinBtn.disabled = !(name && code.length === 4);
}

function readTeamValue(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function clearTeamSession() {
  localStorage.removeItem('teamId');
  localStorage.removeItem('teamName');
  localStorage.removeItem('gameId');
  sessionStorage.removeItem('teamId');
  sessionStorage.removeItem('teamName');
  sessionStorage.removeItem('gameId');
}

async function redirectIfActiveTeam() {
  const teamId = readTeamValue('teamId');
  const storedGameId = readTeamValue('gameId');
  if (!teamId || !storedGameId) return;

  try {
    const configRes = await fetch(API_BASE + '/config', { cache: 'no-store' });
    if (configRes.ok) {
      const cfg = await configRes.json();
      if (Number.isFinite(cfg.maxQuestions) && cfg.maxQuestions > 0) {
        maxQuestions = cfg.maxQuestions;
      }
    }
    const gameRes = await fetch(API_BASE + '/current-game', { cache: 'no-store' });
    if (!gameRes.ok) throw new Error('Failed to check game');
    const currentGame = await gameRes.json();
    if (!currentGame || currentGame.id !== parseInt(storedGameId, 10)) {
      clearTeamSession();
      return;
    }

    const answersRes = await fetch(API_BASE + '/all-answers', { cache: 'no-store' });
    if (!answersRes.ok) throw new Error('Failed to load answers');
    const data = await answersRes.json();
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const answered = new Set();
    answers.forEach(ans => {
      if (ans.team_id !== parseInt(teamId, 10)) return;
      const qNum = Number(ans.question_number);
      if (Number.isFinite(qNum)) answered.add(qNum);
    });

    let nextUnanswered = 1;
    for (let i = 1; i <= maxQuestions; i += 1) {
      if (!answered.has(i)) {
        nextUnanswered = i;
        break;
      }
    }

    window.location.replace(`questions.html?q=${nextUnanswered}`);
  } catch (err) {
    console.error('Error checking active team session:', err);
  }
}

redirectIfActiveTeam();

teamName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    joinBtn.click();
  }
});

teamName.addEventListener('input', updateJoinDisabled);

function sanitizeToDigit(v) {
  return (v || '').replace(/\D/g, '').slice(0, 1);
}

digits.forEach((el, idx) => {
  el.addEventListener('input', () => {
    el.value = sanitizeToDigit(el.value);
    if (el.value && idx < digits.length - 1) digits[idx + 1].focus();
    updateJoinDisabled();
  });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      joinBtn.click();
      return;
    }
    if (e.key === 'Backspace' && !el.value && idx > 0) {
      digits[idx - 1].focus();
    }
  });

  el.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text') || '';
    const nums = text.replace(/\D/g, '').slice(0, 4).split('');
    if (!nums.length) return;
    e.preventDefault();
    nums.forEach((n, i) => { if (digits[i]) digits[i].value = n; });
    const next = digits[Math.min(nums.length, 3)];
    if (next) next.focus();
    updateJoinDisabled();
  });
});

joinBtn.addEventListener('click', async () => {
  const code = digits.map(d => d.value).join('');
  const name = teamName.value.trim();

  if (!name) {
    alert('Please enter a team name.');
    teamName.focus();
    return;
  }

  if (code.length !== 4) {
    alert('Please enter a 4-digit passcode.');
    digits[0].focus();
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = 'Joining...';
  joinBtn.classList.add('is-joining');

  try {
    const res = await fetch(API_BASE + '/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to join game');
    }
    const data = await res.json();

    // Get current game ID
    const gameRes = await fetch(API_BASE + '/current-game');
    const gameData = await gameRes.json();

    localStorage.setItem('teamId', data.teamId);
    localStorage.setItem('teamName', name);
    localStorage.setItem('gameId', gameData.id);
    // Backward-compat for cached clients still reading sessionStorage
    sessionStorage.setItem('teamId', data.teamId);
    sessionStorage.setItem('teamName', name);
    sessionStorage.setItem('gameId', gameData.id);
    window.location.href = 'questions.html';
  } catch (err) {
    alert(`Error joining game: ${err.message}`);
  } finally {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Play';
    joinBtn.classList.remove('is-joining');
  }
});
