const API_BASE = '/api';

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

// A plain join URL always permits joining another PIN. An explicit session
// link can resume that session without affecting any other open player tab.
async function resumeSession() {
  const id = TriviaSession.id();
  const team = TriviaSession.membership(id);
  if (!team) return;
  try {
    const valid = await TriviaSession.request(TriviaSession.base(id) + '/team/' + team.teamId + '/exists');
    if (!valid.exists) { TriviaSession.clear(id); return; }
    TriviaSession.save(team);
    window.location.replace(TriviaSession.url('questions.html', id));
  } catch (error) {
    if (error.status === 404) TriviaSession.clear(id);
  }
}
resumeSession();

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

    TriviaSession.save({ teamId: data.teamId, gameId: data.gameId, teamName: name });
    window.location.href = TriviaSession.url('questions.html', data.gameId);
  } catch (err) {
    alert(`Error joining game: ${err.message}`);
  } finally {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Play';
    joinBtn.classList.remove('is-joining');
  }
});
