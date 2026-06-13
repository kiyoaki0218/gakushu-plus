const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let SUPABASE_URL = process.env.SUPABASE_URL || 'https://iqiizntthptcgnbxglgg.supabase.co';
// 末尾に /rest/v1/ や /rest/v1 が付いていた場合は自動で削除する
if (SUPABASE_URL.endsWith('/rest/v1/')) {
  SUPABASE_URL = SUPABASE_URL.slice(0, -9);
} else if (SUPABASE_URL.endsWith('/rest/v1')) {
  SUPABASE_URL = SUPABASE_URL.slice(0, -8);
}
if (SUPABASE_URL.endsWith('/')) {
  SUPABASE_URL = SUPABASE_URL.slice(0, -1);
}

const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxaWl6bnR0aHB0Y2duYnhnbGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjE3OTksImV4cCI6MjA5NjgzNzc5OX0.mhH3Py3diW7SdCsK4JlyYbnTLvrKjA2QxQ91AfTRtYQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 非同期エラーハンドララッパー (Express 4で非同期エラーを安全にキャッチするため)
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ユーザーログイン・登録
app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, kc_address } = req.body;
  if (!username && !kc_address) return res.status(400).json({ error: 'パラメータ不足' });
  
  let user = null;
  if (kc_address) {
    const { data: existing } = await supabase.from('users').select('*').eq('kc_address', kc_address).maybeSingle();
    if (existing) {
      user = existing;
      if (username && user.username !== username) {
        await supabase.from('users').update({ username }).eq('id', user.id);
        user.username = username;
      }
    } else {
      let base = username || ('User_' + kc_address.slice(0,6));
      let tryName = base;
      for (let i=0; i<10; i++) {
        const { data: dup } = await supabase.from('users').select('id').eq('username', tryName).maybeSingle();
        if (!dup) break;
        tryName = base + '_' + Math.floor(Math.random()*1000);
      }
      const { data: newUser, error } = await supabase.from('users').insert({ username: tryName, kc_address }).select().single();
      if (error) throw error;
      user = newUser;
    }
  } else {
    const { data: existing } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
    if (existing) {
      user = existing;
    } else {
      const { data: newUser, error } = await supabase.from('users').insert({ username, kc_address: null }).select().single();
      if (error) throw error;
      user = newUser;
    }
  }
  res.json({ success: true, user });
}));

app.get('/api/users', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('users').select('id, username, kc_address');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}));

// フォルダ
app.get('/api/folders/:user_id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('folders').select('*').eq('user_id', req.params.user_id).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}));

app.post('/api/folders', asyncHandler(async (req, res) => {
  const { user_id, name } = req.body;
  if (!user_id || !name) return res.status(400).json({ error: 'パラメータ不足' });
  const { data, error } = await supabase.from('folders').insert({ user_id, name }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, id: data.id });
}));

app.delete('/api/folders/:id', asyncHandler(async (req, res) => {
  await supabase.from('books').update({ folder_id: null }).eq('folder_id', req.params.id);
  await supabase.from('folders').delete().eq('id', req.params.id);
  res.json({ success: true });
}));

// 学習記録
app.post('/api/study-log', asyncHandler(async (req, res) => {
  const { user_id, subject, duration_seconds, date, book_id } = req.body;
  if (!user_id || duration_seconds === undefined || !date) return res.status(400).json({ error: 'パラメータ不足' });
  
  await supabase.from('study_logs').insert({ user_id, subject: subject||'', duration_seconds, date, book_id: book_id||null });
  const { data: duels } = await supabase.from('study_duels').select('*').or('challenger_id.eq.'+user_id+',opponent_id.eq.'+user_id).eq('status','active');
  for (const d of (duels||[])) {
    if (d.challenger_id === user_id) await supabase.from('study_duels').update({ challenger_time: d.challenger_time + duration_seconds }).eq('id', d.id);
    else await supabase.from('study_duels').update({ opponent_time: d.opponent_time + duration_seconds }).eq('id', d.id);
  }
  res.json({ success: true });
}));

app.delete('/api/study-log/:id', asyncHandler(async (req, res) => {
  await supabase.from('study_logs').delete().eq('id', req.params.id);
  res.json({ success: true });
}));

app.put('/api/study-log/:id', asyncHandler(async (req, res) => {
  const { subject, duration_seconds, date, book_id } = req.body;
  await supabase.from('study_logs').update({ subject: subject||'', duration_seconds, date, book_id: book_id||null }).eq('id', req.params.id);
  res.json({ success: true });
}));

// タイムライン
app.get('/api/study-timeline', asyncHandler(async (req, res) => {
  const viewer_id = parseInt(req.query.viewer_id) || 0;
  const { data: logs, error } = await supabase.from('study_logs')
    .select('*, users!user_id(username), books!book_id(title,cover_url), study_log_likes(user_id), study_log_comments(id)')
    .order('date', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  const result = (logs || []).map(l => ({
    ...l,
    username: l.users?.username||'不明',
    book_title: l.books?.title||null,
    book_cover: l.books?.cover_url||null,
    likes_count: l.study_log_likes?.length||0,
    is_liked: (l.study_log_likes||[]).some(x=>x.user_id===viewer_id)?1:0,
    comments_count: l.study_log_comments?.length||0,
    users:undefined, books:undefined, study_log_likes:undefined, study_log_comments:undefined
  }));
  res.json(result);
}));

app.get('/api/study-logs/:user_id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('study_logs')
    .select('*, books!book_id(title)').eq('user_id', req.params.user_id)
    .order('date',{ascending:false}).order('id',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(l=>({...l, book_title:l.books?.title||null, books:undefined})));
}));

// いいね
app.post('/api/study-log/:id/like', asyncHandler(async (req, res) => {
  const { user_id } = req.body;
  const study_log_id = parseInt(req.params.id);
  const { data: ex } = await supabase.from('study_log_likes').select('id').eq('study_log_id', study_log_id).eq('user_id', user_id).maybeSingle();
  if (ex) { 
    await supabase.from('study_log_likes').delete().eq('id', ex.id); 
    res.json({ success:true, liked:false }); 
  } else { 
    await supabase.from('study_log_likes').insert({ study_log_id, user_id }); 
    res.json({ success:true, liked:true }); 
  }
}));

// コメント
app.get('/api/study-log/:id/comments', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('study_log_comments')
    .select('*, users!user_id(username)').eq('study_log_id', req.params.id).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(c=>({...c, username:c.users?.username||'不明', users:undefined})));
}));

app.post('/api/study-log/:id/comments', asyncHandler(async (req, res) => {
  const { user_id, comment_text } = req.body;
  if (!user_id || !comment_text) return res.status(400).json({ error: 'パラメータ不足' });
  await supabase.from('study_log_comments').insert({ study_log_id: parseInt(req.params.id), user_id, comment_text });
  res.json({ success: true });
}));

// 本棚
app.get('/api/books/:user_id', asyncHandler(async (req, res) => {
  const uid = parseInt(req.params.user_id);
  const { data, error } = await supabase.from('books')
    .select('*, users!user_id(username,kc_address), secret_purchases!book_id(user_id)');
  if (error) throw error;
  res.json((data || []).map(b=>({
    ...b,
    owner_name: b.users?.username||'不明',
    owner_kc: b.users?.kc_address||null,
    is_owner: b.user_id===uid?1:0,
    is_purchased: (b.secret_purchases||[]).some(p=>p.user_id===uid)?1:0,
    users:undefined, secret_purchases:undefined
  })));
}));

app.post('/api/books', asyncHandler(async (req, res) => {
  const { user_id, title, cover_url, folder_id } = req.body;
  if (!user_id || !title) return res.status(400).json({ error: 'パラメータ不足' });
  const { data, error } = await supabase.from('books').insert({ user_id, title, progress_percent:0, cover_url:cover_url||null, folder_id:folder_id||null }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success:true, book_id:data.id });
}));

app.put('/api/books/:id/folder', asyncHandler(async (req, res) => {
  await supabase.from('books').update({ folder_id: req.body.folder_id||null }).eq('id', req.params.id);
  res.json({ success:true });
}));

app.post('/api/books/progress', asyncHandler(async (req, res) => {
  const { book_id, progress_percent } = req.body;
  await supabase.from('books').update({ progress_percent }).eq('id', book_id);
  res.json({ success:true });
}));

app.post('/api/books/secret', asyncHandler(async (req, res) => {
  const { book_id, is_secret, price_kc } = req.body;
  await supabase.from('books').update({ is_secret: is_secret?1:0, price_kc: price_kc||0 }).eq('id', book_id);
  res.json({ success:true });
}));

app.post('/api/books/purchase', asyncHandler(async (req, res) => {
  const { user_id, book_id, tx_id } = req.body;
  if (!user_id||!book_id||!tx_id) return res.status(400).json({ error: 'パラメータ不足' });
  await supabase.from('secret_purchases').insert({ user_id, book_id, tx_id });
  res.json({ success:true });
}));

// ランキング
app.get('/api/ranking', asyncHandler(async (req, res) => {
  const { data: users } = await supabase.from('users').select('id, username');
  const { data: logs } = await supabase.from('study_logs').select('user_id, duration_seconds');
  const totals = {};
  for (const l of (logs||[])) totals[l.user_id] = (totals[l.user_id]||0) + l.duration_seconds;
  res.json((users||[]).map(u=>({...u, total_duration:totals[u.id]||0})).sort((a,b)=>b.total_duration-a.total_duration));
}));

// 対戦
app.post('/api/duels', asyncHandler(async (req, res) => {
  const { challenger_id, opponent_id, amount_kc, duration_days, tx_id } = req.body;
  const start_date = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('study_duels').insert({ challenger_id, opponent_id, amount_kc, duration_days, start_date, status:'pending', tx_id:tx_id||null });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success:true });
}));

app.get('/api/duels/:user_id', asyncHandler(async (req, res) => {
  const uid = parseInt(req.params.user_id);
  const { data, error } = await supabase.from('study_duels')
    .select('*, challenger:users!challenger_id(username,kc_address), opponent:users!opponent_id(username,kc_address)')
    .or('challenger_id.eq.'+uid+',opponent_id.eq.'+uid);
  if (error) throw error;
  res.json((data||[]).map(d=>({...d, challenger_name:d.challenger?.username, challenger_kc:d.challenger?.kc_address, opponent_name:d.opponent?.username, opponent_kc:d.opponent?.kc_address, challenger:undefined, opponent:undefined})));
}));

app.post('/api/duels/respond', asyncHandler(async (req, res) => {
  const { duel_id, accept, tx_id } = req.body;
  const start_date = new Date().toISOString().split('T')[0];
  await supabase.from('study_duels').update({ status: accept?'active':'rejected', start_date, ...(tx_id?{tx_id}:{}) }).eq('id', duel_id);
  res.json({ success:true });
}));

app.post('/api/duels/complete', asyncHandler(async (req, res) => {
  const { data: duel } = await supabase.from('study_duels').select('*').eq('id', req.body.duel_id).single();
  if (!duel || duel.status !== 'active') return res.status(400).json({ error: '無効な対戦' });
  let winner_id = null;
  if (duel.challenger_time > duel.opponent_time) winner_id = duel.challenger_id;
  else if (duel.opponent_time > duel.challenger_time) winner_id = duel.opponent_id;
  await supabase.from('study_duels').update({ status:'completed', winner_id }).eq('id', req.body.duel_id);
  res.json({ success:true, winner_id });
}));

// グローバルエラーハンドリングミドルウェア (非同期エラーをキャッチしJSONで返す)
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
