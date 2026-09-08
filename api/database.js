const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

function openDatabase(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  try {
    const version = db.pragma('user_version', { simple: true });
    if (version > 1) throw new Error('Database was created by a newer version of Open Trivia Night.');
    if (version === 0) {
      const existing = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'games'").get();
      if (existing && filename !== ':memory:') {
        const backup = `${filename}.before-sessions-${Date.now()}.bak`;
        db.prepare('VACUUM INTO ?').run(backup);
        console.log(`Database backup: ${backup}`);
      }
      db.transaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, passcode TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
          CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, name TEXT, game_code TEXT);
          CREATE TABLE IF NOT EXISTS answers (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER, question_number INTEGER, answer TEXT, bonus_answer TEXT, chosen_points REAL DEFAULT 0, awarded_points REAL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS question_categories (question_number INTEGER PRIMARY KEY, category TEXT, icon TEXT);
        `);
        const columns = db.prepare('PRAGMA table_info(answers)').all();
        for (const column of ['chosen_points', 'awarded_points']) {
          if (!columns.some(item => item.name === column)) db.exec(`ALTER TABLE answers ADD COLUMN ${column} REAL DEFAULT 0`);
        }
        if (columns.some(item => item.name === 'points')) db.exec('UPDATE answers SET chosen_points = points WHERE chosen_points = 0');
        if (db.prepare('SELECT 1 FROM answers GROUP BY team_id, question_number HAVING COUNT(*) > 1').get()) throw new Error('Duplicate legacy answers need review before migration; existing data has been preserved.');
        if (db.prepare('SELECT 1 FROM teams LEFT JOIN games ON games.id = teams.game_id WHERE games.id IS NULL').get() || db.prepare('SELECT 1 FROM answers LEFT JOIN teams ON teams.id = answers.team_id WHERE teams.id IS NULL').get()) throw new Error('Orphaned legacy teams or answers need review before migration; existing data has been preserved.');
        db.exec("ALTER TABLE games ADD COLUMN name TEXT NOT NULL DEFAULT 'Trivia Night'; ALTER TABLE games ADD COLUMN active INTEGER NOT NULL DEFAULT 0; ALTER TABLE games ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;");
        let current = db.prepare('SELECT id, passcode FROM games ORDER BY created_at DESC, id DESC LIMIT 1').get();
        if (!current) {
          const result = db.prepare("INSERT INTO games (name, passcode) VALUES ('Trivia Night', '0000')").run();
          current = { id: result.lastInsertRowid, passcode: '0000' };
        }
        if (!/^\d{4}$/.test(current.passcode)) throw new Error('The legacy current game PIN must contain four digits before migration.');
        db.prepare('UPDATE games SET active = 1 WHERE id = ?').run(current.id);
        db.exec('ALTER TABLE question_categories RENAME TO legacy_question_categories');
        db.exec('CREATE TABLE question_categories (game_id INTEGER NOT NULL, question_number INTEGER NOT NULL, category TEXT, icon TEXT, PRIMARY KEY (game_id, question_number))');
        db.prepare('INSERT INTO question_categories SELECT ?, question_number, category, icon FROM legacy_question_categories').run(current.id);
        db.exec(`DROP TABLE legacy_question_categories;
          CREATE UNIQUE INDEX active_game_pin ON games(passcode) WHERE active = 1;
          CREATE INDEX teams_by_game ON teams(game_id);
          CREATE UNIQUE INDEX answer_by_team_question ON answers(team_id, question_number);
          PRAGMA user_version = 1;`);
      })();
    }
    return db;
  } catch (error) { db.close(); throw error; }
}
module.exports = { openDatabase };
