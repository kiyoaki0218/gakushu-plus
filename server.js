const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ユーザーログイン・登録
app.post('/api/login', async (req, res) => {
  const { username, kc_address } = req.body;
  if (!username && !kc_address) {
    return res.status(400).json({ error: 'パラメータが不足しています' });
  }

  try {
    let user = null;
    if (kc_address) {
      // 1. 鍵ログイン (アドレスによる検索)
      user = await db.get('SELECT * FROM users WHERE kc_address = ?', [kc_address]);
      if (!user) {
        // 新規登録
        const baseUsername = username || `User_${kc_address.slice(0, 6)}`;
        let tryUsername = baseUsername;
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 10) {
          const existing = await db.get('SELECT * FROM users WHERE username = ?', [tryUsername]);
          if (!existing) {
            isUnique = true;
          } else {
            tryUsername = `${baseUsername}_${Math.floor(Math.random() * 1000)}`;
            attempts++;
          }
        }
        const result = await db.run('INSERT INTO users (username, kc_address) VALUES (?, ?)', [tryUsername, kc_address]);
        user = { id: result.lastID, username: tryUsername, kc_address };
      } else if (username && user.username !== username) {
        // 必要に応じて名前を更新
        await db.run('UPDATE users SET username = ? WHERE id = ?', [username, user.id]);
        user.username = username;
      }
    } else {
      // 2. 鍵なし（非ログインアカウント / ゲスト）
      user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
      if (!user) {
        const result = await db.run('INSERT INTO users (username, kc_address) VALUES (?, NULL)', [username]);
        user = { id: result.lastID, username, kc_address: null };
      }
    }
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ユーザー一覧 (対戦用)
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.all('SELECT id, username, kc_address FROM users');
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// フォルダ一覧取得
app.get('/api/folders/:user_id', async (req, res) => {
  try {
    const folders = await db.all('SELECT * FROM folders WHERE user_id = ? ORDER BY created_at ASC', [req.params.user_id]);
    res.json(folders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// フォルダ作成
app.post('/api/folders', async (req, res) => {
  const { user_id, name } = req.body;
  if (!user_id || !name) {
    return res.status(400).json({ error: 'パラメータが不足しています' });
  }
  try {
    const result = await db.run('INSERT INTO folders (user_id, name) VALUES (?, ?)', [user_id, name]);
    res.json({ success: true, id: result.lastID });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// フォルダ削除
app.delete('/api/folders/:id', async (req, res) => {
  try {
    await db.run('UPDATE books SET folder_id = NULL WHERE folder_id = ?', [req.params.id]);
    await db.run('DELETE FROM folders WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 学習記録の登録
app.post('/api/study-log', async (req, res) => {
  const { user_id, subject, duration_seconds, date, book_id } = req.body;
  if (!user_id || duration_seconds === undefined || !date) {
    return res.status(400).json({ error: 'パラメータが不足しています' });
  }

  try {
    await db.run(
      'INSERT INTO study_logs (user_id, subject, duration_seconds, date, book_id) VALUES (?, ?, ?, ?, ?)', 
      [user_id, subject || '', duration_seconds, date, book_id || null]
    );
    
    const activeDuels = await db.all(`
      SELECT * FROM study_duels 
      WHERE (challenger_id = ? OR opponent_id = ?) AND status = 'active'
    `, [user_id, user_id]);

    for (const duel of activeDuels) {
      if (duel.challenger_id === user_id) {
        await db.run('UPDATE study_duels SET challenger_time = challenger_time + ? WHERE id = ?', [duration_seconds, duel.id]);
      } else {
        await db.run('UPDATE study_duels SET opponent_time = opponent_time + ? WHERE id = ?', [duration_seconds, duel.id]);
      }
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 学習記録の削除
app.delete('/api/study-log/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM study_logs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 学習記録の編集
app.put('/api/study-log/:id', async (req, res) => {
  const { subject, duration_seconds, date, book_id } = req.body;
  try {
    await db.run(
      'UPDATE study_logs SET subject = ?, duration_seconds = ?, date = ?, book_id = ? WHERE id = ?',
      [subject || '', duration_seconds, date, book_id || null, req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// タイムライン取得 (いいね・コメント含む)
app.get('/api/study-timeline', async (req, res) => {
  const viewer_id = req.query.viewer_id ? parseInt(req.query.viewer_id) : 0;
  try {
    const logs = await db.all(`
      SELECT l.*, b.title as book_title, b.cover_url as book_cover, u.username,
             (SELECT COUNT(*) FROM study_log_likes WHERE study_log_id = l.id) as likes_count,
             (SELECT COUNT(*) FROM study_log_likes WHERE study_log_id = l.id AND user_id = ?) as is_liked,
             (SELECT COUNT(*) FROM study_log_comments WHERE study_log_id = l.id) as comments_count
      FROM study_logs l
      JOIN users u ON l.user_id = u.id
      LEFT JOIN books b ON l.book_id = b.id
      ORDER BY l.date DESC, l.id DESC
    `, [viewer_id]);
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 特定ユーザーの学習記録
app.get('/api/study-logs/:user_id', async (req, res) => {
  try {
    const logs = await db.all(`
      SELECT l.*, b.title as book_title 
      FROM study_logs l 
      LEFT JOIN books b ON l.book_id = b.id 
      WHERE l.user_id = ? 
      ORDER BY l.date DESC, l.id DESC
    `, [req.params.user_id]);
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// いいねのトグル
app.post('/api/study-log/:id/like', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'ユーザーIDが必要です' });

  try {
    const existing = await db.get(
      'SELECT * FROM study_log_likes WHERE study_log_id = ? AND user_id = ?',
      [req.params.id, user_id]
    );

    if (existing) {
      await db.run('DELETE FROM study_log_likes WHERE id = ?', [existing.id]);
      res.json({ success: true, liked: false });
    } else {
      await db.run('INSERT INTO study_log_likes (study_log_id, user_id) VALUES (?, ?)', [req.params.id, user_id]);
      res.json({ success: true, liked: true });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// コメント一覧の取得
app.get('/api/study-log/:id/comments', async (req, res) => {
  try {
    const comments = await db.all(`
      SELECT c.*, u.username 
      FROM study_log_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.study_log_id = ?
      ORDER BY c.created_at ASC
    `, [req.params.id]);
    res.json(comments);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// コメントの追加
app.post('/api/study-log/:id/comments', async (req, res) => {
  const { user_id, comment_text } = req.body;
  if (!user_id || !comment_text) return res.status(400).json({ error: 'パラメータが不足しています' });

  try {
    await db.run(
      'INSERT INTO study_log_comments (study_log_id, user_id, comment_text) VALUES (?, ?, ?)',
      [req.params.id, user_id, comment_text]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 本棚（参考書）一覧の取得
app.get('/api/books/:user_id', async (req, res) => {
  const { user_id } = req.params;
  try {
    const books = await db.all(`
      SELECT b.*, u.username as owner_name, u.kc_address as owner_kc,
             (CASE WHEN b.user_id = ? THEN 1 ELSE 0 END) as is_owner,
             (SELECT COUNT(*) FROM secret_purchases WHERE user_id = ? AND book_id = b.id) as is_purchased
      FROM books b
      JOIN users u ON b.user_id = u.id
    `, [user_id, user_id]);
    res.json(books);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 参考書の追加
app.post('/api/books', async (req, res) => {
  const { user_id, title, cover_url, folder_id } = req.body;
  if (!user_id || !title) {
    return res.status(400).json({ error: 'パラメータが不足しています' });
  }
  try {
    const result = await db.run(
      'INSERT INTO books (user_id, title, progress_percent, cover_url, folder_id) VALUES (?, ?, 0, ?, ?)', 
      [user_id, title, cover_url || null, folder_id || null]
    );
    res.json({ success: true, book_id: result.lastID });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 参考書のフォルダ移動 API
app.put('/api/books/:id/folder', async (req, res) => {
  const { folder_id } = req.body;
  try {
    await db.run('UPDATE books SET folder_id = ? WHERE id = ?', [folder_id || null, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 参考書の進捗更新
app.post('/api/books/progress', async (req, res) => {
  const { book_id, progress_percent } = req.body;
  if (book_id === undefined || progress_percent === undefined) {
    return res.status(400).json({ error: 'パラメータが不足しています' });
  }
  try {
    await db.run('UPDATE books SET progress_percent = ? WHERE id = ?', [progress_percent, book_id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 参考書のシークレット設定
app.post('/api/books/secret', async (req, res) => {
  const { book_id, is_secret, price_kc } = req.body;
  try {
    await db.run('UPDATE books SET is_secret = ?, price_kc = ? WHERE id = ?', [is_secret ? 1 : 0, price_kc || 0, book_id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// シークレット参考書の購入記録
app.post('/api/books/purchase', async (req, res) => {
  const { user_id, book_id, tx_id } = req.body;
  if (!user_id || !book_id || !tx_id) {
    return res.status(400).json({ error: 'パラメータが不足しています' });
  }
  try {
    await db.run('INSERT INTO secret_purchases (user_id, book_id, tx_id) VALUES (?, ?, ?)', [user_id, book_id, tx_id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 学習時間ランキング
app.get('/api/ranking', async (req, res) => {
  try {
    const ranking = await db.all(`
      SELECT u.id, u.username, COALESCE(SUM(l.duration_seconds), 0) as total_duration
      FROM users u
      LEFT JOIN study_logs l ON u.id = l.user_id
      GROUP BY u.id
      ORDER BY total_duration DESC
    `);
    res.json(ranking);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 対戦の作成
app.post('/api/duels', async (req, res) => {
  const { challenger_id, opponent_id, amount_kc, duration_days, tx_id } = req.body;
  if (!challenger_id || !opponent_id || !amount_kc || !duration_days) {
    return res.status(400).json({ error: 'パラメータが不足しています' });
  }
  try {
    const start_date = new Date().toISOString().split('T')[0];
    await db.run(`
      INSERT INTO study_duels (challenger_id, opponent_id, amount_kc, duration_days, start_date, status, tx_id)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `, [challenger_id, opponent_id, amount_kc, duration_days, start_date, tx_id || null]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 対戦リストの取得
app.get('/api/duels/:user_id', async (req, res) => {
  const { user_id } = req.params;
  try {
    const duels = await db.all(`
      SELECT d.*, 
             u1.username as challenger_name, u1.kc_address as challenger_kc,
             u2.username as opponent_name, u2.kc_address as opponent_kc
      FROM study_duels d
      JOIN users u1 ON d.challenger_id = u1.id
      JOIN users u2 ON d.opponent_id = u2.id
      WHERE d.challenger_id = ? OR d.opponent_id = ?
    `, [user_id, user_id]);
    res.json(duels);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 対戦への応答
app.post('/api/duels/respond', async (req, res) => {
  const { duel_id, accept, tx_id } = req.body;
  try {
    const duel = await db.get('SELECT * FROM study_duels WHERE id = ?', [duel_id]);
    if (!duel) {
      return res.status(404).json({ error: '対戦が見つかりません' });
    }
    const status = accept ? 'active' : 'rejected';
    const start_date = new Date().toISOString().split('T')[0];
    await db.run(
      'UPDATE study_duels SET status = ?, start_date = ?, tx_id = COALESCE(?, tx_id) WHERE id = ?', 
      [status, start_date, tx_id || null, duel_id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 对戦の完了
app.post('/api/duels/complete', async (req, res) => {
  const { duel_id } = req.body;
  try {
    const duel = await db.get('SELECT * FROM study_duels WHERE id = ?', [duel_id]);
    if (!duel || duel.status !== 'active') {
      return res.status(400).json({ error: '有効な対戦ではないか、すでに完了しています' });
    }

    let winner_id = null;
    if (duel.challenger_time > duel.opponent_time) {
      winner_id = duel.challenger_id;
    } else if (duel.opponent_time > duel.challenger_time) {
      winner_id = duel.opponent_id;
    }

    await db.run('UPDATE study_duels SET status = "completed", winner_id = ? WHERE id = ?', [winner_id, duel_id]);
    res.json({ success: true, winner_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Gakushu Plus サーバーがポート ${PORT} で起動しました。`);
});
