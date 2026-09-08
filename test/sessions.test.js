const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, readdirSync, rmSync, realpathSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, relative, isAbsolute } = require('node:path');
const Database = require('better-sqlite3');
const { createApp } = require('../api/app');
const { openDatabase } = require('../api/database');

function removeFixture(directory) {
  const target = realpathSync(directory);
  const within = relative(realpathSync(tmpdir()), target);
  if (!within || within.startsWith('..') || isAbsolute(within) || !within.startsWith('trivia-')) throw new Error('Refusing to remove unexpected fixture directory');
  rmSync(target, { recursive: true, force: true });
}

async function fixture(t) {
  const { app, db } = createApp({ dbPath: ':memory:' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const request = async (path, method = 'GET', body, status = 200) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  };
  return { request, db };
}

test('two sessions isolate teams, answers, scores, categories, resets and deletion', async t => {
  const { request, db } = await fixture(t);
  const a = await request('/sessions', 'POST', { name: 'Tuesday', passcode: '0123' }, 201);
  const b = await request('/sessions', 'POST', { name: 'Wednesday', passcode: '4567' }, 201);
  const A = '/sessions/' + a.id, B = '/sessions/' + b.id;
  const ta = await request('/join', 'POST', { name: 'Same Team', code: '0123' });
  const tb = await request('/join', 'POST', { name: 'Same Team', code: '4567' });
  assert.equal(ta.gameId, a.id); assert.equal(tb.gameId, b.id);
  await Promise.all([
    request(A + '/answer', 'POST', { teamId: ta.teamId, question: 1, answer: 'A answer', chosenPoints: 3 }),
    request(B + '/answer', 'POST', { teamId: tb.teamId, question: 1, answer: 'B answer', chosenPoints: 5 })
  ]);
  await request(A + '/answer', 'POST', { teamId: ta.teamId, question: 1, awardedPoints: 2.5 });
  await request(B + '/answer', 'POST', { teamId: tb.teamId, question: 1, awardedPoints: 5 });
  await request(A + '/question-category', 'POST', { questionNumber: 1, category: 'Science', icon: 'S' });
  await request(B + '/question-category', 'POST', { questionNumber: 1, category: 'Music', icon: 'M' });
  assert.equal((await request(A + '/question-config/1')).category, 'Science');
  assert.equal((await request(B + '/question-config/1')).category, 'Music');
  const aa = await request(A + '/all-answers'), bb = await request(B + '/all-answers');
  assert.equal(aa.teams.length, 1); assert.equal(bb.teams.length, 1);
  assert.equal(aa.answers[0].answer, 'A answer'); assert.equal(aa.answers[0].awarded_points, 2.5);
  assert.equal(bb.answers[0].answer, 'B answer'); assert.equal(bb.answers[0].awarded_points, 5);
  await request(A + '/answer', 'POST', { teamId: tb.teamId, question: 1, awardedPoints: 100 }, 404);
  await request(A + '/answer', 'POST', { teamId: tb.teamId, question: 2, answer: 'wrong game' }, 404);
  await request(A + '/team/' + tb.teamId, 'DELETE', undefined, 404);
  assert.equal((await request(A + '/team/' + tb.teamId + '/exists')).exists, false);
  const renamed = await request(A, 'PATCH', { name: 'Tuesday renamed' });
  assert.equal(renamed.passcode, '0123'); assert.equal(renamed.id, a.id);
  const reset = await request(A + '/reset', 'POST', { passcode: '0987' });
  assert.equal(reset.id, a.id); assert.equal(reset.name, 'Tuesday renamed'); assert.equal(reset.revision, 1);
  assert.deepEqual(await request(A + '/all-answers'), { teams: [], answers: [] });
  assert.equal((await request(A + '/team/' + ta.teamId + '/exists')).exists, false);
  assert.equal((await request(A + '/question-config/1')).category, undefined);
  assert.deepEqual(await request(B + '/all-answers'), bb);
  await request('/join', 'POST', { name: 'Old PIN', code: '0123' }, 401);
  await request(A + '/answer', 'POST', { teamId: ta.teamId, question: 2, answer: 'stale' }, 404);
  const nextTeam = await request('/join', 'POST', { name: 'New team', code: '0987' });
  await request(A + '/answer', 'POST', { teamId: nextTeam.teamId, question: 1, answer: 'new' });
  await request(A, 'DELETE');
  await request(A, 'GET', undefined, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams WHERE game_id = ?').get(a.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM answers WHERE team_id = ?').get(nextTeam.teamId).n, 0);
  assert.deepEqual(await request(B + '/all-answers'), bb);
});

test('PIN validation, uniqueness, empty state and retired endpoints', async t => {
  const { request } = await fixture(t);
  for (const passcode of ['abcd', '123', 1234, '12345']) await request('/sessions', 'POST', { name: 'Bad PIN', passcode }, 400);
  await request('/sessions', 'POST', { name: '  ', passcode: '1234' }, 400);
  await request('/sessions', 'POST', { name: 'Duplicate', passcode: '0000' }, 409);
  const a = await request('/sessions', 'POST', { name: 'Other', passcode: '0001' }, 201);
  await request('/sessions/' + a.id + '/reset', 'POST', { passcode: '0000' }, 409);
  assert.equal((await request('/sessions/' + a.id)).passcode, '0001');
  const suggested = await request('/available-pin');
  assert.match(suggested.passcode, /^\d{4}$/); assert.notEqual(suggested.passcode, '0000'); assert.notEqual(suggested.passcode, '0001');
  const auto = await request('/sessions', 'POST', { name: 'Auto' }, 201);
  assert.match(auto.passcode, /^\d{4}$/);
  await request('/sessions/not-an-id', 'GET', undefined, 400);
  for (const route of ['/current-game', '/all-answers', '/teams']) await request(route, 'GET', undefined, 410);
  await request('/reset', 'POST', { passcode: '9999' }, 410);
  await request('/answer', 'POST', { teamId: 1 }, 410);
  for (const game of await request('/sessions')) await request('/sessions/' + game.id, 'DELETE');
  assert.deepEqual(await request('/sessions'), []);
  const recreated = await request('/sessions', 'POST', { name: 'New', passcode: '0000' }, 201);
  assert.equal(recreated.passcode, '0000');
});

test('scoring before an answer preserves scores; duplicate submissions are rejected', async t => {
  const { request } = await fixture(t);
  const [game] = await request('/sessions');
  const base = '/sessions/' + game.id;
  const { teamId } = await request('/join', 'POST', { name: 'Team', code: '0000' });
  await request(base + '/answer', 'POST', { teamId, question: 1, awardedPoints: 2.5 });
  await request(base + '/answer', 'POST', { teamId, question: 1, answer: 'First', points: 3 });
  await request(base + '/answer', 'POST', { teamId, question: 1, answer: 'Changed' }, 409);
  const [answer] = await request(base + '/answers/1');
  assert.equal(answer.awarded_points, 2.5); assert.equal(answer.chosen_points, 3); assert.equal(answer.answer, 'First');
  for (const question of [0, -1, 1.5, 999]) await request(base + '/answer', 'POST', { teamId, question, answer: 'Invalid' }, 400);
  await request(base + '/answer', 'POST', { teamId, question: 2, awardedPoints: '5' }, 400);
  await request(base + '/team/' + teamId, 'DELETE');
  assert.deepEqual(await request(base + '/answers/1'), []);
});

function legacy(filename, { duplicate = false } = {}) {
  const db = new Database(filename);
  db.exec(`CREATE TABLE games (id INTEGER PRIMARY KEY AUTOINCREMENT, passcode TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, name TEXT, game_code TEXT);
    CREATE TABLE answers (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER, question_number INTEGER, answer TEXT, bonus_answer TEXT, points INTEGER);
    CREATE TABLE question_categories (question_number INTEGER PRIMARY KEY, category TEXT, icon TEXT);
    INSERT INTO games (passcode, created_at) VALUES ('0000', '2026-09-08'), ('0000', '2026-09-08');
    INSERT INTO teams (game_id, name) VALUES (2, 'Existing team');
    INSERT INTO answers (team_id, question_number, answer, points) VALUES (1, 1, 'Preserved', 3);
    INSERT INTO question_categories VALUES (1, 'History', 'H');`);
  if (duplicate) db.exec("INSERT INTO answers (team_id, question_number, answer) VALUES (1, 1, 'Duplicate')");
  db.close();
}
test('legacy migration backs up data, uses deterministic newest game, and is idempotent', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trivia-migration-'));
  const filename = join(directory, 'quiz.db');
  try {
    legacy(filename);
    let db = openDatabase(filename);
    assert.equal(db.pragma('user_version', { simple: true }), 1);
    assert.equal(db.prepare('SELECT id FROM games WHERE active = 1').get().id, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM games').get().n, 2);
    assert.equal(db.prepare('SELECT chosen_points FROM answers').get().chosen_points, 3);
    assert.equal(db.prepare('SELECT game_id FROM question_categories').get().game_id, 2);
    db.prepare('UPDATE answers SET chosen_points = 0').run();
    db.close();
    db = openDatabase(filename);
    assert.equal(db.prepare('SELECT chosen_points FROM answers').get().chosen_points, 0);
    db.close();
    const backups = readdirSync(directory).filter(name => name.endsWith('.bak'));
    assert.equal(backups.length, 1);
    const backup = new Database(join(directory, backups[0]), { readonly: true });
    assert.equal(backup.pragma('user_version', { simple: true }), 0);
    assert.equal(backup.prepare('SELECT answer FROM answers').get().answer, 'Preserved');
    backup.close();
  } finally { removeFixture(directory); }
});
test('ambiguous legacy answers fail migration without discarding data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trivia-ambiguous-'));
  const filename = join(directory, 'quiz.db');
  try {
    legacy(filename, { duplicate: true });
    assert.throws(() => openDatabase(filename), /Duplicate legacy answers/);
    const db = new Database(filename);
    assert.equal(db.pragma('user_version', { simple: true }), 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM answers').get().n, 2);
    db.close();
  } finally { removeFixture(directory); }
});
test('deleting the final session persists across server restarts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trivia-empty-'));
  const filename = join(directory, 'quiz.db');
  try {
    let db = openDatabase(filename);
    db.exec('DELETE FROM games'); db.close();
    db = openDatabase(filename);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM games').get().n, 0);
    db.close();
  } finally { removeFixture(directory); }
});
