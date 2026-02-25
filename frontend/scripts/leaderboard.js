const API_BASE = '/api';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;', '"':'&quot;', "'":'&#39;'})[m];
  });
}

let teamsList = [];
let totalPointsMap = {};

function calculateTotals(allAnswers) {
  totalPointsMap = {};
  allAnswers.forEach(ans => {
    if (!totalPointsMap[ans.team_id]) totalPointsMap[ans.team_id] = 0;
    totalPointsMap[ans.team_id] += ans.awarded_points || 0;
  });
}

function createLeaderboardRow(team, rank) {
  const total = totalPointsMap[team.id] ?? 0;
  const rowClass = rank === 1 ? 'is-top' : '';
  return `
      <tr data-team-id="${team.id}" class="${rowClass}">
        <td class="rank">${rank}</td>
        <td class="team">${escapeHtml(team.name)}</td>
        <td class="total">${total}</td>
      </tr>
    `;
}

async function loadAllAnswersAndTeams() {
  const ansRes = await fetch(API_BASE + '/all-answers');
  if (!ansRes.ok) throw new Error('Failed to load all answers');
  const ansData = await ansRes.json();
  const allAnswers = ansData.answers || [];
  const teamRes = await fetch(API_BASE + '/teams');
  if (!teamRes.ok) throw new Error('Failed to load teams');
  const teamData = await teamRes.json();
  teamsList = teamData || [];
  calculateTotals(allAnswers);
}

async function loadLeaderboard() {
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = '<tr><td colspan="3">Loading leaderboard...</td></tr>';
  try {
    await loadAllAnswersAndTeams();
    if (!teamsList || teamsList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">No teams yet</td></tr>';
      return;
    }
    const sortedTeams = teamsList.slice().sort((a, b) => {
      const totalA = totalPointsMap[a.id] ?? 0;
      const totalB = totalPointsMap[b.id] ?? 0;
      if (totalB !== totalA) return totalB - totalA;
      return String(a.name).localeCompare(String(b.name));
    });
    
    // Assign ranks, accounting for ties
    let currentRank = 1;
    let previousScore = null;
    const teamsWithRanks = sortedTeams.map((team, index) => {
      const score = totalPointsMap[team.id] ?? 0;
      if (previousScore !== null && score < previousScore) {
        currentRank = index + 1;
      }
      previousScore = score;
      return { team, rank: currentRank };
    });
    
    tbody.innerHTML = teamsWithRanks.map(({ team, rank }) => createLeaderboardRow(team, rank)).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="3">Failed to load leaderboard</td></tr>';
  }
}

loadLeaderboard();
