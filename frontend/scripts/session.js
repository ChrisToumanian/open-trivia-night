/* Shared URL and membership handling. Selection is always explicit per page/tab. */
const TriviaSession = (() => {
  function id() { return new URLSearchParams(location.search).get('sessionId'); }
  function url(page, gameId, params = {}) {
    const query = new URLSearchParams(params);
    if (gameId) query.set('sessionId', String(gameId));
    return page + (query.size ? '?' + query : '');
  }
  function select(gameId) {
    const next = new URL(location.href);
    if (gameId) next.searchParams.set('sessionId', String(gameId));
    else next.searchParams.delete('sessionId');
    history.replaceState(null, '', next);
  }
  function base(gameId) {
    if (!gameId || !/^\d+$/.test(String(gameId))) throw new Error('Please select a session');
    return '/api/sessions/' + encodeURIComponent(gameId);
  }
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(path, { cache: 'no-store', ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...options.headers } });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status });
      return data;
    } finally { clearTimeout(timeout); }
  }
  function membership(gameId) {
    if (!gameId) return null;
    try {
      const saved = sessionStorage.getItem('trivia.team.' + gameId) || localStorage.getItem('trivia.team.' + gameId);
      if (saved) return JSON.parse(saved);
      const legacyGame = localStorage.getItem('gameId') || sessionStorage.getItem('gameId');
      const legacyTeam = localStorage.getItem('teamId') || sessionStorage.getItem('teamId');
      if (String(legacyGame) === String(gameId) && legacyTeam) return { gameId: Number(gameId), teamId: Number(legacyTeam), teamName: localStorage.getItem('teamName') || sessionStorage.getItem('teamName') };
    } catch (error) { console.error('Unable to read saved team', error); }
    return null;
  }
  function save(team) {
    localStorage.setItem('trivia.team.' + team.gameId, JSON.stringify(team));
    sessionStorage.setItem('trivia.team.' + team.gameId, JSON.stringify(team));
  }
  function clear(gameId) {
    localStorage.removeItem('trivia.team.' + gameId);
    sessionStorage.removeItem('trivia.team.' + gameId);
    for (const storage of [localStorage, sessionStorage]) {
      if (storage.getItem('gameId') === String(gameId)) for (const key of ['gameId', 'teamId', 'teamName']) storage.removeItem(key);
    }
  }
  return { id, url, select, base, request, membership, save, clear };
})();
