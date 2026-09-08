const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { openDatabase } = require('./database');

function createApp({ dbPath = path.resolve(__dirname, '..', 'data', 'quiz.db'), sharedDir = path.resolve(__dirname, '..', 'shared') } = {}) {
  const db = openDatabase(dbPath);
  const app = express();
  app.use(cors());
  app.use(express.json());
  const load = (name) => {
    const override = path.join(sharedDir, `${name}.json`);
    return JSON.parse(fs.readFileSync(fs.existsSync(override) ? override : path.join(sharedDir, `${name}.default.json`), 'utf8'));
  };
  let config, catalog;
  try { config = load('config'); catalog = load('categories'); } catch (error) { db.close(); throw error; }
  const categories = (Array.isArray(catalog) ? catalog : catalog.categories || []).filter(item => item && typeof item.label === 'string');
  const maxQuestions = Object.keys(config.questions || {}).length;
  const api = express.Router();
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); req.body ??= {}; next(); });
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const positiveId = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
  const questionNumber = (value) => {
    if (!positiveId(value) || !config.questions[Number(value)]) fail(400, 'Invalid question number');
    return Number(value);
  };
  const nameValue = (value) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) fail(400, 'Name must contain 1–80 characters');
    return value.trim();
  };
  const pinValue = (value, exceptId = 0) => {
    if (typeof value !== 'string' || !/^\d{4}$/.test(value)) fail(400, 'PIN must contain exactly four digits');
    if (db.prepare('SELECT id FROM games WHERE active = 1 AND passcode = ? AND id != ?').get(value, exceptId)) fail(409, 'That PIN is already in use. Choose another.');
    return value;
  };
  const newPin = () => {
    const used = new Set(db.prepare('SELECT passcode FROM games WHERE active = 1').all().map(game => game.passcode));
    const start = randomInt(10000);
    for (let index = 0; index < 10000; index++) {
      const pin = String((start + index) % 10000).padStart(4, '0');
      if (!used.has(pin)) return pin;
    }
    fail(409, 'All PINs are in use. Delete a session before creating another.');
  };
  const session = id => db.prepare('SELECT id, name, passcode, revision, created_at FROM games WHERE id = ? AND active = 1').get(id);
  const clearGame = id => {
    db.prepare('DELETE FROM answers WHERE team_id IN (SELECT id FROM teams WHERE game_id = ?)').run(id);
    db.prepare('DELETE FROM teams WHERE game_id = ?').run(id);
    db.prepare('DELETE FROM question_categories WHERE game_id = ?').run(id);
  };
  api.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  api.get('/config', (req, res) => res.json({ maxQuestions }));
  api.get('/categories', (req, res) => res.json({ categories }));
  api.get('/sessions', (req, res) => res.json(db.prepare('SELECT id, name, passcode, revision, created_at FROM games WHERE active = 1 ORDER BY id').all()));
  api.get('/available-pin', (req, res) => res.json({ passcode: newPin() }));
  api.post('/sessions', (req, res) => {
    const name = nameValue(req.body.name);
    const game = db.transaction(() => {
      const passcode = pinValue(req.body.passcode === undefined ? newPin() : req.body.passcode);
      return session(db.prepare('INSERT INTO games (name, passcode, active) VALUES (?, ?, 1)').run(name, passcode).lastInsertRowid);
    })();
    res.status(201).json(game);
  });
  api.post('/join', (req, res) => {
    const name = nameValue(req.body.name);
    const code = req.body.code;
    if (typeof code !== 'string' || !/^\d{4}$/.test(code)) fail(400, 'PIN must contain exactly four digits');
    const game = db.prepare('SELECT id, name FROM games WHERE active = 1 AND passcode = ?').get(code);
    if (!game) fail(401, 'Invalid PIN');
    const { lastInsertRowid: teamId } = db.prepare('INSERT INTO teams (game_id, name, game_code) VALUES (?, ?, ?)').run(game.id, name, code);
    res.json({ teamId, gameId: game.id, gameName: game.name });
  });
  const scoped = express.Router({ mergeParams: true });
  scoped.use((req, res, next) => {
    if (!positiveId(req.params.sessionId)) fail(400, 'Invalid session ID');
    req.game = session(Number(req.params.sessionId));
    if (!req.game) fail(404, 'This session no longer exists');
    next();
  });
  scoped.get('/', (req, res) => res.json(req.game));
  scoped.patch('/', (req, res) => {
    db.prepare('UPDATE games SET name = ? WHERE id = ?').run(nameValue(req.body.name), req.game.id);
    res.json(session(req.game.id));
  });
  scoped.delete('/', (req, res) => {
    db.transaction(() => { clearGame(req.game.id); db.prepare('DELETE FROM games WHERE id = ?').run(req.game.id); })();
    res.json({ ok: true });
  });
  scoped.post('/reset', (req, res) => {
    db.transaction(() => {
      const passcode = pinValue(req.body.passcode ?? req.game.passcode, req.game.id);
      clearGame(req.game.id);
      db.prepare('UPDATE games SET passcode = ?, revision = revision + 1 WHERE id = ?').run(passcode, req.game.id);
    })();
    res.json(session(req.game.id));
  });
  scoped.get('/question-config/:number', (req, res) => {
    const number = questionNumber(req.params.number);
    const stored = db.prepare('SELECT category, icon FROM question_categories WHERE game_id = ? AND question_number = ?').get(req.game.id, number);
    res.json({ ...config.questions[number], ...(stored || {}) });
  });
  scoped.post('/question-category', (req, res) => {
    const number = questionNumber(req.body.questionNumber);
    const { category = '', icon = '' } = req.body;
    if (typeof category !== 'string' || typeof icon !== 'string' || category.length > 120 || icon.length > 40) fail(400, 'Invalid category');
    if (!category.trim() && !icon.trim()) db.prepare('DELETE FROM question_categories WHERE game_id = ? AND question_number = ?').run(req.game.id, number);
    else db.prepare(`INSERT INTO question_categories (game_id, question_number, category, icon) VALUES (?, ?, ?, ?)
      ON CONFLICT(game_id, question_number) DO UPDATE SET category = excluded.category, icon = excluded.icon`).run(req.game.id, number, category.trim(), icon.trim());
    res.json({ ok: true });
  });
  const findTeam = (req, id) => {
    if (!positiveId(id)) fail(400, 'Invalid team ID');
    return db.prepare('SELECT id FROM teams WHERE game_id = ? AND id = ?').get(req.game.id, Number(id));
  };
  scoped.get('/team/:teamId/exists', (req, res) => res.json({ exists: !!findTeam(req, req.params.teamId) }));
  scoped.delete('/team/:teamId', (req, res) => {
    const team = findTeam(req, req.params.teamId);
    if (!team) fail(404, 'Team not found in this session');
    db.transaction(() => { db.prepare('DELETE FROM answers WHERE team_id = ?').run(team.id); db.prepare('DELETE FROM teams WHERE id = ?').run(team.id); })();
    res.json({ ok: true });
  });
  const answersSql = `SELECT answers.*, teams.name AS team_name FROM answers JOIN teams ON teams.id = answers.team_id WHERE teams.game_id = ?`;
  const teamsFor = id => db.prepare('SELECT id, name FROM teams WHERE game_id = ? ORDER BY id').all(id);
  scoped.get('/teams', (req, res) => res.json(teamsFor(req.game.id)));
  scoped.get('/answers/:question', (req, res) => res.json(db.prepare(answersSql + ' AND question_number = ?').all(req.game.id, questionNumber(req.params.question))));
  scoped.get('/all-answers', (req, res) => res.json({ teams: teamsFor(req.game.id), answers: db.prepare(answersSql).all(req.game.id) }));
  scoped.post('/answer', (req, res) => {
    const { teamId, question, answer, bonusAnswer, chosenPoints, awardedPoints, points } = req.body;
    const team = findTeam(req, teamId);
    if (!team) fail(404, 'Team not found in this session. Please join again.');
    const number = questionNumber(question);
    const chosen = chosenPoints ?? points ?? 0;
    if (typeof chosen !== 'number' || !Number.isFinite(chosen) || Math.abs(chosen) > 100000 || (awardedPoints !== undefined && (typeof awardedPoints !== 'number' || !Number.isFinite(awardedPoints) || Math.abs(awardedPoints) > 100000))) fail(400, 'Invalid points');
    const existing = db.prepare('SELECT * FROM answers WHERE team_id = ? AND question_number = ?').get(team.id, number);
    if (awardedPoints !== undefined) {
      db.prepare(`INSERT INTO answers (team_id, question_number, awarded_points) VALUES (?, ?, ?)
        ON CONFLICT(team_id, question_number) DO UPDATE SET awarded_points = excluded.awarded_points`).run(team.id, number, awardedPoints);
    } else {
      if (typeof answer !== 'string' || !answer.trim() || answer.length > 5000 || (bonusAnswer != null && (typeof bonusAnswer !== 'string' || bonusAnswer.length > 5000))) fail(400, 'Please enter a valid answer');
      if (existing?.answer?.trim()) fail(409, 'You already answered this question');
      db.prepare(`INSERT INTO answers (team_id, question_number, answer, bonus_answer, chosen_points) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(team_id, question_number) DO UPDATE SET answer = excluded.answer, bonus_answer = excluded.bonus_answer, chosen_points = excluded.chosen_points`).run(team.id, number, answer.trim(), bonusAnswer?.trim() || null, chosen);
    }
    res.json({ ok: true });
  });
  api.use('/sessions/:sessionId', scoped);
  api.use((req, res) => res.status(410).json({ error: 'Please reload the page to use the session-based app.' }));
  app.use('/api', api);
  const frontend = path.resolve(__dirname, '..', 'frontend');
  app.get('/', (req, res) => res.sendFile(path.join(frontend, 'play.html')));
  app.use(express.static(frontend, { maxAge: 0 }));
  app.use('/shared', express.static(sharedDir));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500);
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 500 ? 'Unable to complete the request' : error.message });
  });
  return { app, db };
}
module.exports = { createApp };
