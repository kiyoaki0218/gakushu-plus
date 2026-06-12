const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'gakushu_plus.db');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    kc_address TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    folder_id INTEGER,
    title TEXT,
    progress_percent INTEGER DEFAULT 0,
    is_secret INTEGER DEFAULT 0,
    price_kc REAL DEFAULT 0,
    cover_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(folder_id) REFERENCES folders(id)
  )`);

  // マイグレーション: books に cover_url がなければ追加
  db.all("PRAGMA table_info(books)", (err, columns) => {
    if (!err) {
      if (!columns.some(c => c.name === 'cover_url')) {
        db.run("ALTER TABLE books ADD COLUMN cover_url TEXT");
      }
      if (!columns.some(c => c.name === 'folder_id')) {
        db.run("ALTER TABLE books ADD COLUMN folder_id INTEGER");
      }
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS study_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    subject TEXT,
    duration_seconds INTEGER,
    date TEXT,
    book_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(book_id) REFERENCES books(id)
  )`);

  db.all("PRAGMA table_info(study_logs)", (err, columns) => {
    if (!err && !columns.some(c => c.name === 'book_id')) {
      db.run("ALTER TABLE study_logs ADD COLUMN book_id INTEGER");
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS study_log_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_log_id INTEGER,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(study_log_id, user_id),
    FOREIGN KEY(study_log_id) REFERENCES study_logs(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS study_log_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_log_id INTEGER,
    user_id INTEGER,
    comment_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(study_log_id) REFERENCES study_logs(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS secret_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    book_id INTEGER,
    tx_id TEXT,
    purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(book_id) REFERENCES books(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS study_duels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id INTEGER,
    opponent_id INTEGER,
    amount_kc REAL,
    duration_days INTEGER,
    start_date TEXT,
    challenger_time INTEGER DEFAULT 0,
    opponent_time INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    winner_id INTEGER,
    tx_id TEXT,
    FOREIGN KEY(challenger_id) REFERENCES users(id),
    FOREIGN KEY(opponent_id) REFERENCES users(id)
  )`);
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = { db, run, get, all };
