const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const path = require('path');

const PORT = process.env.PORT || 8080;
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const SHARED_DIR = path.resolve(__dirname, '..', 'shared');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_PATH = path.resolve(DATA_DIR, 'quiz.db');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const db = new Database(DB_PATH);

// Load configuration
let config = {};
const CONFIG_OVERRIDE_PATH = path.resolve(SHARED_DIR, 'config.json');
const CONFIG_DEFAULT_PATH = path.resolve(SHARED_DIR, 'config.default.json');
const CONFIG_PATH = fs.existsSync(CONFIG_OVERRIDE_PATH) ? CONFIG_OVERRIDE_PATH : CONFIG_DEFAULT_PATH;
try {
  const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
  config = JSON.parse(configData);
} catch (err) {
  console.error('Error loading config.json:', err);
}

// Load categories list
let categories = [];
const CATEGORIES_OVERRIDE_PATH = path.resolve(SHARED_DIR, 'categories.json');
const CATEGORIES_DEFAULT_PATH = path.resolve(SHARED_DIR, 'categories.default.json');
const CATEGORIES_PATH = fs.existsSync(CATEGORIES_OVERRIDE_PATH) ? CATEGORIES_OVERRIDE_PATH : CATEGORIES_DEFAULT_PATH;
try {
  const categoriesData = fs.readFileSync(CATEGORIES_PATH, 'utf8');
  const parsed = JSON.parse(categoriesData);
  const list = Array.isArray(parsed) ? parsed : parsed.categories;
  if (Array.isArray(list)) {
    categories = list
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        label: typeof item.label === 'string' ? item.label : '',
        icon: typeof item.icon === 'string' ? item.icon : ''
      }));
  }
} catch (err) {
  console.error('Error loading categories.json:', err);
}

function getQuestionConfig(questionNum) {
  return config.questions && config.questions[questionNum] ? config.questions[questionNum] : {
    allowUserPoints: true,
    defaultPoints: 0,
    allowChangePoints: true
  };
}

function getQuestionCategory(questionNum) {
  return db.prepare('SELECT category, icon FROM question_categories WHERE question_number = ?').get(questionNum);
}

function getMaxQuestions() {
  if (!config.questions || typeof config.questions !== 'object') return 0;
  return Object.keys(config.questions).length;
}

// Schema
// Migration: add chosen_points and awarded_points columns if not present
db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  passcode TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER,
  name TEXT,
  game_code TEXT
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  question_number INTEGER,
  answer TEXT,
  bonus_answer TEXT,
  chosen_points INTEGER DEFAULT 0,
  awarded_points INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS question_categories (
  question_number INTEGER PRIMARY KEY,
  category TEXT,
  icon TEXT
);
`);

// Migrate old points column if present
try {
  const columns = db.prepare("PRAGMA table_info(answers)").all();
  const hasPoints = columns.some(col => col.name === 'points');
  const hasChosen = columns.some(col => col.name === 'chosen_points');
  if (hasPoints && hasChosen) {
    // Copy points to chosen_points if chosen_points is 0
    db.prepare('UPDATE answers SET chosen_points = points WHERE chosen_points = 0').run();
    // Remove points column (SQLite doesn't support DROP COLUMN directly, so skip for now)
  }
} catch (e) { console.error('Migration error:', e); }

// Get current game
function getCurrentGame() {
  return db.prepare('SELECT * FROM games ORDER BY created_at DESC LIMIT 1').get();
}

// Initialize with a game if none exists
if (!getCurrentGame()) {
  db.prepare('INSERT INTO games (passcode) VALUES (?)').run('0000');
}

// Create API router
const apiRouter = express.Router();

// Mount all API routes on the router
apiRouter.get('/current-game', (req, res) => {
  const game = getCurrentGame();
  res.json(game ? { id: game.id, passcode: game.passcode } : null);
});

// Get question configuration
apiRouter.get('/question-config/:number', (req, res) => {
  const questionNum = req.params.number;
  const questionConfig = getQuestionConfig(questionNum);
  const stored = getQuestionCategory(questionNum) || {};
  const category = typeof stored.category === 'string' ? stored.category : (questionConfig.category || '');
  const icon = typeof stored.icon === 'string' ? stored.icon : (questionConfig.icon || '');
  res.json({
    ...questionConfig,
    category,
    icon
  });
});

// Public config info for clients
apiRouter.get('/config', (req, res) => {
  res.json({ maxQuestions: getMaxQuestions() });
});

// Categories list for host dropdown
apiRouter.get('/categories', (req, res) => {
  res.json({ categories });
});

// Save category selection per question
apiRouter.post('/question-category', (req, res) => {
  const questionNumber = Number(req.body.questionNumber);
  if (!Number.isFinite(questionNumber) || questionNumber < 1) {
    return res.status(400).json({ error: 'Invalid question number' });
  }
  const category = typeof req.body.category === 'string' ? req.body.category.trim() : '';
  const icon = typeof req.body.icon === 'string' ? req.body.icon.trim() : '';
  if (!category && !icon) {
    db.prepare('DELETE FROM question_categories WHERE question_number = ?').run(questionNumber);
    return res.json({ ok: true });
  }
  db.prepare(`
    INSERT INTO question_categories (question_number, category, icon)
    VALUES (?, ?, ?)
    ON CONFLICT(question_number) DO UPDATE SET
      category = excluded.category,
      icon = excluded.icon
  `).run(questionNumber, category, icon);
  res.json({ ok: true });
});

// Join game
apiRouter.post('/join', (req, res) => {
  const { name, code } = req.body;
  const game = getCurrentGame();
  
  if (!game || game.passcode !== code) {
    return res.status(401).json({ error: 'Invalid passcode' });
  }
  
  const stmt = db.prepare('INSERT INTO teams (game_id, name, game_code) VALUES (?, ?, ?)');
  const info = stmt.run(game.id, name, code);
  res.json({ teamId: info.lastInsertRowid });
});

// Submit answer
apiRouter.post('/answer', (req, res) => {
  const { teamId, question, answer, bonusAnswer, chosenPoints, awardedPoints, points } = req.body;
  // If points is present and neither chosenPoints nor awardedPoints, treat as chosenPoints (legacy)
  const chosen = chosenPoints !== undefined ? chosenPoints : (points !== undefined ? points : undefined);
  const awarded = awardedPoints !== undefined ? awardedPoints : undefined;
  const existing = db.prepare('SELECT id FROM answers WHERE team_id = ? AND question_number = ?').get(teamId, question);
  if (existing) {
    // If host is awarding points, only update awarded_points
    if (awarded !== undefined) {
      db.prepare('UPDATE answers SET awarded_points = ? WHERE id = ?')
        .run(awarded, existing.id);
    } else if (answer !== undefined || bonusAnswer !== undefined || chosen !== undefined) {
      db.prepare('UPDATE answers SET answer = ?, bonus_answer = ?, chosen_points = ? WHERE id = ?')
        .run(answer || null, bonusAnswer || null, chosen || 0, existing.id);
    } else {
      return res.status(409).json({ error: 'Answer already submitted' });
    }
  } else {
    db.prepare(`INSERT INTO answers (team_id, question_number, answer, bonus_answer, chosen_points, awarded_points) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(teamId, question, answer, bonusAnswer || null, chosen || 0, awarded || 0);
  }
  res.json({ ok: true });
});

// Host view - get answers for a question in current game
apiRouter.get('/answers/:question', (req, res) => {
  const game = getCurrentGame();
  if (!game) {
    return res.json([]);
  }
  const rows = db.prepare(`
    SELECT teams.id, teams.name, answers.*
    FROM answers
    JOIN teams ON teams.id = answers.team_id
    WHERE question_number = ? AND teams.game_id = ?
  `).all(req.params.question, game.id);

  res.json(rows);
});

// Teams list for current game
apiRouter.get('/teams', (req, res) => {
  const game = getCurrentGame();
  if (!game) {
    return res.json([]);
  }
  const rows = db.prepare('SELECT id, name, game_code FROM teams WHERE game_id = ?').all(game.id);
  res.json(rows);
});

// Reset game (clear all data for current game, create new game)
apiRouter.post('/reset', (req, res) => {
  const { passcode } = req.body;
  
  if (!passcode || passcode.length !== 4) {
    return res.status(400).json({ error: 'Passcode must be 4 digits' });
  }
  
  const game = getCurrentGame();
  if (game) {
    db.prepare('DELETE FROM answers WHERE team_id IN (SELECT id FROM teams WHERE game_id = ?)').run(game.id);
    db.prepare('DELETE FROM teams WHERE game_id = ?').run(game.id);
  }
  db.prepare('DELETE FROM question_categories').run();
  
  const newGame = db.prepare('INSERT INTO games (passcode) VALUES (?)').run(passcode);
  res.json({ ok: true, gameId: newGame.lastInsertRowid, passcode });
});

// Get all answers for all questions for the current game
apiRouter.get('/all-answers', (req, res) => {
  const game = getCurrentGame();
  if (!game) {
    return res.json([]);
  }
  // Get all teams for the current game
  const teams = db.prepare('SELECT id, name FROM teams WHERE game_id = ?').all(game.id);
  // Get all answers for the current game
  const answers = db.prepare(`
    SELECT teams.id as team_id, teams.name as team_name, answers.question_number, answers.answer, answers.bonus_answer, answers.chosen_points, answers.awarded_points
    FROM answers
    JOIN teams ON teams.id = answers.team_id
    WHERE teams.game_id = ?
  `).all(game.id);
  res.json({ teams, answers });
});

// Mount static files at root
app.use(express.static(FRONTEND_DIR));
app.use('/shared', express.static(SHARED_DIR));

// Mount API routes under /api
app.use('/api', apiRouter);

// Start server (with conditional HTTPS support)
const SSL_KEY_PATH = '/etc/letsencrypt/live/zipfx.net/privkey.pem';
const SSL_CERT_PATH = '/etc/letsencrypt/live/zipfx.net/fullchain.pem';

if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
  // Use HTTPS if SSL certificates are available
  const sslOptions = {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH)
  };
  
  https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`HTTPS server running on :${PORT}`);
  });
} else {
  // Use HTTP for development or Cloud Run (which handles HTTPS termination)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP server running on :${PORT}`);
  });
}

