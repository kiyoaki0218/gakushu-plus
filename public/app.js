const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:3001/api' : '/api';
const KC_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:3000/api' : 'https://kc-server.vercel.app/api';

let currentUser = null;
let currentWallet = null;

// タイマー変数
let timerInterval = null;
let secondsElapsed = 0;
let isTimerRunning = false;

// クッキー操作ヘルパー
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/';
}
function getCookie(name) {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length));
  }
  return null;
}
function deleteCookie(name) {
  setCookie(name, '', -1);
}

// 起動時初期化
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupTimer();
  setupBookEvents();
  setupFolderEvents();
  setupDuelEvents();
  setupWalletEvents();
  setupBarcodeEvents();
  setupQuickRegisterEvents();
  setupEditModalEvents();
  setupCommentsModalEvents();
  setupLoginEvents();

  // ローカルストレージ or クッキーからログイン自動復元
  const savedSeed = localStorage.getItem('gakushu_plus_seed');
  const savedUser = localStorage.getItem('gakushu_plus_user') || getCookie('gakushu_plus_user');

  if (savedSeed) {
    // 1. 鍵ログインの復元
    await importWalletFromSeed(savedSeed);
    if (currentWallet) {
      await autoLoginWithKc(currentWallet.address);
    }
  } else if (savedUser) {
    // 2. ゲストログインの復元
    try {
      currentUser = JSON.parse(savedUser);
      showApp();
      loadUserData();
    } catch(e) {
      document.getElementById('login-modal').classList.remove('hidden');
    }
  } else {
    // ログインモーダル表示
    document.getElementById('login-modal').classList.remove('hidden');
  }
});

// 自動ログイン (鍵あり)
async function autoLoginWithKc(address) {
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kc_address: address })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      const userStr = JSON.stringify(currentUser);
      localStorage.setItem('gakushu_plus_user', userStr);
      setCookie('gakushu_plus_user', userStr, 365);
      showApp();
      loadUserData();
    } else {
      document.getElementById('login-modal').classList.remove('hidden');
    }
  } catch (e) {
    console.error('自動ログインエラー:', e);
    document.getElementById('login-modal').classList.remove('hidden');
  }
}

// タブ切り替え
function setupTabs() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      button.classList.add('active');
      const targetTab = document.getElementById(`tab-${tabName}`);
      if (targetTab) targetTab.classList.add('active');
      if (tabName === 'books') loadBooks();
      if (tabName === 'ranking') loadRankingAndDuels();
      if (tabName === 'wallet') refreshWalletInfo();
      if (tabName === 'timer') loadStudyLogs();
    });
  });
}

// ログイン処理の設定
function setupLoginEvents() {
  // 新規鍵生成
  document.getElementById('generate-login-seed-btn').addEventListener('click', () => {
    const keyPair = window.nacl.sign.keyPair();
    const seedBase64 = window.nacl.util.encodeBase64(keyPair.secretKey.slice(0, 32));
    document.getElementById('login-seed').value = seedBase64;
  });

  // ウォレット鍵でログイン
  document.getElementById('login-kc-btn').addEventListener('click', async () => {
    const seed = document.getElementById('login-seed').value.trim();
    const username = document.getElementById('login-username').value.trim();

    if (!seed) {
      alert('秘密鍵を入力するか、新規に生成してください。');
      return;
    }

    try {
      await importWalletFromSeed(seed);
      if (!currentWallet) return;

      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username || null,
          kc_address: currentWallet.address
        })
      });
      const data = await res.json();
      if (data.success) {
        currentUser = data.user;
        const userStr = JSON.stringify(currentUser);
        localStorage.setItem('gakushu_plus_user', userStr);
        localStorage.setItem('gakushu_plus_seed', seed);
        setCookie('gakushu_plus_user', userStr, 365);
        setCookie('gakushu_plus_seed', seed, 365);
        // ゲスト情報を削除
        localStorage.removeItem('gakushu_plus_guest_id');
        deleteCookie('gakushu_plus_guest_id');
        currentWallet = null;

        document.getElementById('login-modal').classList.add('hidden');
        showApp();
        loadUserData();
      } else {
        alert('ログインに失敗しました: ' + data.error);
      }
    } catch (e) {
      alert('ログインエラー: ' + e.message);
    }
  });

  // 鍵を使わずにゲストで始める
  document.getElementById('login-guest-btn').addEventListener('click', async () => {
    let guestId = localStorage.getItem('gakushu_plus_guest_id') || getCookie('gakushu_plus_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('gakushu_plus_guest_id', guestId);
      setCookie('gakushu_plus_guest_id', guestId, 365);
    }

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: guestId, kc_address: null })
      });
      const data = await res.json();
      if (data.success) {
        currentUser = data.user;
        const userStr = JSON.stringify(currentUser);
        localStorage.setItem('gakushu_plus_user', userStr);
        // クッキーにも保存（ブラウザ間で共通化できるよう365日）
        setCookie('gakushu_plus_user', userStr, 365);
        // 鍵情報を削除
        localStorage.removeItem('gakushu_plus_seed');
        deleteCookie('gakushu_plus_seed');
        currentWallet = null;

        document.getElementById('login-modal').classList.add('hidden');
        showApp();
        loadUserData();
      } else {
        alert('ゲストログインに失敗しました: ' + data.error);
      }
    } catch (e) {
      alert('ゲストログインエラー: ' + e.message);
    }
  });
}

function showApp() {
  document.getElementById('header-username').textContent = currentUser.username;
}

async function loadUserData() {
  loadStudyLogs();
  loadBooks();
  if (currentWallet) {
    refreshWalletInfo();
  } else {
    document.getElementById('header-balance-badge').textContent = 'ゲスト (0 KC)';
  }
}

// ===== 以下: 全機能実装 =====
// --- 繧ｿ繧､繝槭・讖溯・ ---
function setupTimer() {
  const timeDisplay = document.getElementById('timer-time');
  const startBtn = document.getElementById('timer-start-btn');
  const pauseBtn = document.getElementById('timer-pause-btn');
  const saveBtn = document.getElementById('timer-save-btn');

  startBtn.addEventListener('click', () => {
    isTimerRunning = true;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    saveBtn.disabled = true;
    
    timerInterval = setInterval(() => {
      secondsElapsed++;
      timeDisplay.textContent = formatTime(secondsElapsed);
    }, 1000);
  });

  pauseBtn.addEventListener('click', () => {
    isTimerRunning = false;
    clearInterval(timerInterval);
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    saveBtn.disabled = false;
  });

  saveBtn.addEventListener('click', async () => {
    const subject = document.getElementById('timer-subject').value;
    const bookSelect = document.getElementById('timer-book');
    const book_id = bookSelect.value ? parseInt(bookSelect.value) : null;
    const date = new Date().toISOString().split('T')[0];

    try {
      const res = await fetch(`${API_URL}/study-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          subject,
          duration_seconds: secondsElapsed,
          date,
          book_id
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`${subject}の学習時間 ${formatTime(secondsElapsed)} を記録しました！`);
        secondsElapsed = 0;
        timeDisplay.textContent = '00:00:00';
        saveBtn.disabled = true;
        loadStudyLogs();
      } else {
        alert('菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆: ' + data.error);
      }
    } catch (e) {
      alert('菫晏ｭ倅ｸｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: ' + e.message);
    }
  });
}

function formatTime(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

async function loadStudyLogs() {
  if (!currentUser) return;
  
  // 1. 繧ｵ繝槭Μ繝ｼ(閾ｪ蛻・・霄ｫ縺ｮ蜍牙ｼｷ譎る俣)
  try {
    const res = await fetch(`${API_URL}/study-logs/${currentUser.id}`);
    const logs = await res.json();
    let todaySec = 0;
    let weekSec = 0;
    const todayStr = new Date().toISOString().split('T')[0];
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    logs.forEach(log => {
      if (log.date === todayStr) {
        todaySec += log.duration_seconds;
      }
      const logDate = new Date(log.date);
      if (logDate >= oneWeekAgo) {
        weekSec += log.duration_seconds;
      }
    });

    document.getElementById('today-total-time').textContent = `${Math.round(todaySec / 60)}分`;
    document.getElementById('week-total-time').textContent = `${Math.round(weekSec / 60)}分`;
  } catch (e) {
    console.error('蟄ｦ鄙偵し繝槭Μ繝ｼ繝ｭ繝ｼ繝峨お繝ｩ繝ｼ:', e);
  }

  // 2. 繧ｿ繧､繝繝ｩ繧､繝ｳ陦ｨ遉ｺ (SNS讖溯・繧貞性繧)
  try {
    const res = await fetch(`${API_URL}/study-timeline?viewer_id=${currentUser.id}`);
    const timeline = await res.json();
    const list = document.getElementById('study-logs-list');
    list.innerHTML = '';

    if (timeline.length === 0) {
      list.innerHTML = '<div class="empty-item">縺ｾ縺蜍牙ｼｷ險倬鹸縺後≠繧翫∪縺帙ｓ縲ゆｸ逡ｪ荵励ｊ縺ｧ蜍牙ｼｷ縺励※險倬鹸縺励∪縺励ｇ縺・ｼ・/div>';
      return;
    }

    timeline.forEach(log => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      
      const isOwner = log.user_id === currentUser.id;
      const coverHtml = log.book_cover 
        ? `<img src="${escapeHtml(log.book_cover)}" class="timeline-book-cover" alt="譖ｸ蠖ｱ">` 
        : `<div class="timeline-book-cover" style="display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--text-secondary);">答</div>`;
      
      const bookTitleHtml = log.book_title 
        ? `<div class="timeline-book-title">当 ${escapeHtml(log.book_title)}</div>` 
        : '';

      const editDeleteButtons = isOwner 
        ? `
          <div class="timeline-header-right">
            <button class="btn secondary btn-sm" style="padding:2px 6px; font-size:11px;" onclick="openEditModal(${log.id}, '${escapeHtml(log.subject)}', ${log.book_id || 'null'}, ${log.duration_seconds}, '${log.date}')">邱ｨ髮・/button>
            <button class="btn danger btn-sm" style="padding:2px 6px; font-size:11px;" onclick="deleteStudyLog(${log.id})">蜑企勁</button>
          </div>
        ` 
        : '';

      item.innerHTML = `
        <div class="timeline-header">
          <div class="timeline-header-left">
            <span class="timeline-user">側 ${escapeHtml(log.username)}</span>
            <span class="timeline-date">${log.date}</span>
          </div>
          ${editDeleteButtons}
        </div>
        <div class="timeline-body">
          ${coverHtml}
          <div class="timeline-info">
            <div class="timeline-subject">${escapeHtml(log.subject)} - ${formatTime(log.duration_seconds)}</div>
            ${bookTitleHtml}
          </div>
        </div>
        <div class="timeline-actions">
          <button class="timeline-action-btn ${log.is_liked ? 'liked' : ''}" onclick="toggleLike(${log.id})">
            笶､・・<span id="like-count-${log.id}">${log.likes_count}</span> 縺・＞縺ｭ
          </button>
          <button class="timeline-action-btn" onclick="toggleComments(${log.id})">
            町 <span id="comment-count-${log.id}">${log.comments_count}</span> 繧ｳ繝｡繝ｳ繝・          </button>
        </div>
        <div id="comments-area-${log.id}" class="comments-section hidden">
          <ul id="comments-list-${log.id}" class="comments-list">
            <!-- 繧ｳ繝｡繝ｳ繝医′蜍慕噪縺ｫ謖ｿ蜈･縺輔ｌ縺ｾ縺・-->
          </ul>
          <div class="comment-input-form">
            <input type="text" id="comment-input-${log.id}" placeholder="繧ｳ繝｡繝ｳ繝医ｒ蜈･蜉・..">
            <button class="btn primary btn-sm" onclick="postComment(${log.id})">騾∽ｿ｡</button>
          </div>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) {
    console.error('繧ｿ繧､繝繝ｩ繧､繝ｳ繝ｭ繝ｼ繝峨お繝ｩ繝ｼ:', e);
  }
}

// 蜑企勁讖溯・
async function deleteStudyLog(id) {
  if (!confirm('本当にこの記録を削除しますか？')) return;
  try {
    const res = await fetch(`${API_URL}/study-log/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadStudyLogs();
    }
  } catch (e) {
    alert('蜑企勁縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ' + e.message);
  }
}

// 縺・＞縺ｭ繝医げ繝ｫ
async function toggleLike(id) {
  try {
    const res = await fetch(`${API_URL}/study-log/${id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id })
    });
    const data = await res.json();
    if (data.success) {
      loadStudyLogs();
    }
  } catch (e) {
    console.error('縺・＞縺ｭ繧ｨ繝ｩ繝ｼ:', e);
  }
}

// 繧ｳ繝｡繝ｳ繝域ｬ・・髢矩哩
async function toggleComments(id) {
  const area = document.getElementById(`comments-area-${id}`);
  area.classList.toggle('hidden');
  if (!area.classList.contains('hidden')) {
    loadComments(id);
  }
}

async function loadComments(id) {
  try {
    const res = await fetch(`${API_URL}/study-log/${id}/comments`);
    const comments = await res.json();
    const list = document.getElementById(`comments-list-${id}`);
    list.innerHTML = '';

    if (comments.length === 0) {
      list.innerHTML = '<li class="empty-item" style="color:var(--text-secondary); text-align:center;">繧ｳ繝｡繝ｳ繝医・縺ｾ縺縺ゅｊ縺ｾ縺帙ｓ縲・/li>';
      return;
    }

    comments.forEach(c => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="comment-user">${escapeHtml(c.username)}:</span><span class="comment-text">${escapeHtml(c.comment_text)}</span>`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error('繧ｳ繝｡繝ｳ繝医Ο繝ｼ繝峨お繝ｩ繝ｼ:', e);
  }
}

// 繧ｳ繝｡繝ｳ繝域兜遞ｿ
async function postComment(id) {
  const input = document.getElementById(`comment-input-${id}`);
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`${API_URL}/study-log/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, comment_text: text })
    });
    const data = await res.json();
    if (data.success) {
      input.value = '';
      loadComments(id);
      
      // 繧ｿ繧､繝繝ｩ繧､繝ｳ荳翫・繧ｳ繝｡繝ｳ繝井ｻｶ謨ｰ陦ｨ遉ｺ繧貞叉譎よ峩譁ｰ
      const countSpan = document.getElementById(`comment-count-${id}`);
      if (countSpan) {
        countSpan.textContent = parseInt(countSpan.textContent) + 1;
      }
    }
  } catch (e) {
    alert('繧ｳ繝｡繝ｳ繝域兜遞ｿ繧ｨ繝ｩ繝ｼ: ' + e.message);
  }
}

// --- 蜿り・嶌讖溯・ ---
function setupBookEvents() {
  const addTrigger = document.getElementById('add-book-trigger');
  const addForm = document.getElementById('add-book-form');
  const saveBtn = document.getElementById('save-book-btn');

  addTrigger.addEventListener('click', () => {
    addForm.classList.toggle('hidden');
  });

  saveBtn.addEventListener('click', async () => {
    const title = document.getElementById('new-book-title').value.trim();
    if (!title) return;

    try {
      const res = await fetch(`${API_URL}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, title })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('new-book-title').value = '';
        addForm.classList.add('hidden');
        loadBooks();
      }
    } catch (e) {
      alert('蜿り・嶌霑ｽ蜉繧ｨ繝ｩ繝ｼ: ' + e.message);
    }
  });
}

async function loadBooks() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_URL}/books/${currentUser.id}`);
    const books = await res.json();
    const grid = document.getElementById('books-list');
    grid.innerHTML = '';

    updateTimerBookSelect(books);

    books.forEach(book => {
      const card = document.createElement('div');
      card.className = 'book-card';

      const isBlur = book.is_secret && !book.is_owner && !book.is_purchased;
      
      let coverHtml = '';
      if (book.cover_url) {
        coverHtml = `<img src="${escapeHtml(book.cover_url)}" class="book-cover-img ${isBlur ? 'secret-blurred' : ''}" alt="譖ｸ蠖ｱ">`;
      } else {
        coverHtml = `<div class="book-cover-img ${isBlur ? 'secret-blurred' : ''}" style="display:flex;align-items:center;justify-content:center;font-size:32px;color:var(--text-secondary);">答</div>`;
      }

      let progressSection = '';
      if (!isBlur) {
        progressSection = `
          <div class="book-progress-wrapper">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${book.progress_percent}%"></div>
            </div>
            <div class="progress-text">
              <span>騾ｲ謐礼紫</span>
              <span>${book.progress_percent}%</span>
            </div>
          </div>
        `;
      }

      let actionsSection = '';
      if (book.is_owner) {
        actionsSection = `
          <div class="book-actions">
            <div class="form-group" style="margin-bottom: 5px;">
              <label style="font-size: 11px;">騾ｲ謐励ｒ譖ｴ譁ｰ:</label>
              <input type="range" min="0" max="100" value="${book.progress_percent}" onchange="updateProgress(${book.id}, this.value)" style="width: 100%;">
            </div>
            <div class="secret-setting-box">
              <label>繧ｷ繝ｼ繧ｯ繝ｬ繝・ヨ (KC雋ｩ螢ｲ):</label>
              <input type="checkbox" ${book.is_secret ? 'checked' : ''} onchange="toggleSecret(${book.id}, this.checked, document.getElementById('price-${book.id}').value)">
              <input type="number" id="price-${book.id}" value="${book.price_kc || 10}" min="1" style="width:50px;"> KC
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        ${coverHtml}
        <div class="book-details">
          <div>
            <div class="book-title ${isBlur ? 'secret-blurred' : ''}">${escapeHtml(book.title)} ${book.is_secret ? '<span class="badge-secret">SECRET</span>' : ''}</div>
            <div class="book-owner">謇譛芽・ ${escapeHtml(book.owner_name)}</div>
            ${progressSection}
          </div>
          ${actionsSection}
        </div>
      `;

      if (isBlur) {
        const overlay = document.createElement('div');
        overlay.className = 'secret-lock-overlay';
        overlay.innerHTML = `
          <h3>白 繧ｷ繝ｼ繧ｯ繝ｬ繝・ヨ</h3>
          <p>騾ｲ謐励ｒ髢ｲ隕ｧ縺吶ｋ縺ｫ縺ｯ <strong>${book.price_kc} KC</strong> 繧呈髪謇輔≧蠢・ｦ√′縺ゅｊ縺ｾ縺吶・/p>
          <button class="btn primary btn-sm" onclick="purchaseBook(${book.id}, '${book.owner_kc}', ${book.price_kc})">雉ｼ蜈･</button>
        `;
        card.appendChild(overlay);
      }

      grid.appendChild(card);
    });
  } catch (e) {
    console.error('蜿り・嶌繝ｭ繝ｼ繝峨お繝ｩ繝ｼ:', e);
  }
}

// 繝峨Ο繝・・繝繧ｦ繝ｳ譖ｴ譁ｰ
function updateTimerBookSelect(books) {
  const select = document.getElementById('timer-book');
  const editSelect = document.getElementById('edit-log-book');
  
  select.innerHTML = '<option value="">-- 譛ｪ邏蝉ｻ倥￠ --</option>';
  editSelect.innerHTML = '<option value="">-- 譛ｪ邏蝉ｻ倥￠ --</option>';
  
  const myBooks = books.filter(b => b.is_owner === 1);
  myBooks.forEach(book => {
    const opt = document.createElement('option');
    opt.value = book.id;
    opt.textContent = book.title;
    select.appendChild(opt);

    const optEdit = opt.cloneNode(true);
    editSelect.appendChild(optEdit);
  });
}

async function updateProgress(bookId, val) {
  try {
    const res = await fetch(`${API_URL}/books/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: bookId, progress_percent: parseInt(val) })
    });
    const data = await res.json();
    if (data.success) {
      loadBooks();
    }
  } catch (e) {
    alert('騾ｲ謐玲峩譁ｰ繧ｨ繝ｩ繝ｼ: ' + e.message);
  }
}

async function toggleSecret(bookId, isSecret, price) {
  try {
    const res = await fetch(`${API_URL}/books/secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: bookId, is_secret: isSecret, price_kc: parseFloat(price) })
    });
    const data = await res.json();
    if (data.success) {
      alert(isSecret ? '参考書をシークレット化しました。' : 'シークレット設定を解除しました。');
      loadBooks();
    }
  } catch (e) {
    alert('繧ｷ繝ｼ繧ｯ繝ｬ繝・ヨ險ｭ螳壹お繝ｩ繝ｼ: ' + e.message);
  }
}

// 繧ｷ繝ｼ繧ｯ繝ｬ繝・ヨ蜿り・嶌縺ｮ雉ｼ蜈･
async function purchaseBook(bookId, ownerAddress, price) {
  if (!currentWallet) {
    alert('購入にはウォレット連携が必要です。「ウォレット連携」タブで設定してください。');
    return;
  }
  if (currentWallet.balance < price) {
    alert('KC残高が不足しています。');
    return;
  }
  if (!ownerAddress || ownerAddress === 'null') {
    alert('所有者のウォレットアドレスが登録されていません。');
    return;
  }

  const confirmPay = confirm(`${price} KC を支払ってこの参考書を閲覧しますか？`);
  if (!confirmPay) return;

  try {
    const balanceRes = await fetch(`${KC_URL}/balance/${currentWallet.address}`);
    const balanceData = await balanceRes.json();
    const nonce = balanceData.nonce;

    const message = `${currentWallet.address}:${ownerAddress}:${price}:${nonce}`;
    const signature = generateSignature(message, currentWallet.secretKey);

    const sendRes = await fetch(`${KC_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: currentWallet.address,
        to: ownerAddress,
        amount: price,
        nonce,
        signature,
        publicKey: currentWallet.publicKey
      })
    });
    const sendData = await sendRes.json();

    if (!sendData.success) {
      alert('騾・≡縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ' + sendData.error);
      return;
    }

    const txId = sendData.txId;

    const purchaseRes = await fetch(`${API_URL}/books/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        book_id: bookId,
        tx_id: txId
      })
    });
    const purchaseData = await purchaseRes.json();

    if (purchaseData.success) {
      alert('購入が完了しました！');
      loadBooks();
      refreshWalletInfo();
    } else {
      alert('雉ｼ蜈･險倬鹸縺ｮ菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆: ' + purchaseData.error);
    }
  } catch (e) {
    alert('雉ｼ蜈･蜃ｦ逅・ｸｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: ' + e.message);
  }
}

// --- 邱ｨ髮・Δ繝ｼ繝繝ｫ ---
function setupEditModalEvents() {
  const modal = document.getElementById('edit-modal');
  const cancelBtn = document.getElementById('edit-cancel-btn');
  const saveBtn = document.getElementById('edit-save-btn');

  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  saveBtn.addEventListener('click', async () => {
    const id = document.getElementById('edit-log-id').value;
    const subject = document.getElementById('edit-log-subject').value;
    const bookSelect = document.getElementById('edit-log-book');
    const book_id = bookSelect.value ? parseInt(bookSelect.value) : null;
    const duration_minutes = parseInt(document.getElementById('edit-log-duration').value);
    const date = document.getElementById('edit-log-date').value.trim();

    if (!duration_minutes || !date) {
      alert('縺吶∋縺ｦ縺ｮ鬆・岼繧貞・蜉帙＠縺ｦ縺上□縺輔＞');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/study-log/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          duration_seconds: duration_minutes * 60,
          date,
          book_id
        })
      });
      const data = await res.json();
      if (data.success) {
        modal.classList.add('hidden');
        loadStudyLogs();
      }
    } catch (e) {
      alert('邱ｨ髮・・菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆: ' + e.message);
    }
  });
}

window.openEditModal = function(id, subject, bookId, durationSeconds, date) {
  document.getElementById('edit-log-id').value = id;
  document.getElementById('edit-log-subject').value = subject;
  document.getElementById('edit-log-book').value = bookId === null ? '' : bookId;
  document.getElementById('edit-log-duration').value = Math.round(durationSeconds / 60);
  document.getElementById('edit-log-date').value = date;
  document.getElementById('edit-modal').classList.remove('hidden');
};

// --- 繝ｩ繝ｳ繧ｭ繝ｳ繧ｰ & 蟇ｾ豎ｺ讖溯・ ---
function setupDuelEvents() {
  document.getElementById('create-duel-btn').addEventListener('click', async () => {
    const opponentId = document.getElementById('duel-opponent').value;
    const amount = parseFloat(document.getElementById('duel-amount').value);
    const duration = parseInt(document.getElementById('duel-duration').value);

    if (!opponentId) {
      alert('対戦相手を選択してください。');
      return;
    }

    if (!currentWallet) {
      alert('対決の作成にはウォレット連携が必要です。');
      return;
    }

    if (currentWallet.balance < amount) {
      alert('残高が不足しています。');
      return;
    }

    const confirmDuel = confirm(`本当に ${amount} KC をプールして対決を申請しますか？`);
    if (!confirmDuel) return;

    try {
      const systemPoolAddress = '0000000000000000000000000000000000000000';
      const balanceRes = await fetch(`${KC_URL}/balance/${currentWallet.address}`);
      const balanceData = await balanceRes.json();
      const nonce = balanceData.nonce;

      const message = `${currentWallet.address}:${systemPoolAddress}:${amount}:${nonce}`;
      const signature = generateSignature(message, currentWallet.secretKey);

      const sendRes = await fetch(`${KC_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: currentWallet.address,
          to: systemPoolAddress,
          amount,
          nonce,
          signature,
          publicKey: currentWallet.publicKey
        })
      });
      const sendData = await sendRes.json();

      if (!sendData.success) {
        alert('繝励・繝ｫ繝・・繧ｸ繝・ヨ縺ｮ騾・≡縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ' + sendData.error);
        return;
      }

      const txId = sendData.txId;

      const duelRes = await fetch(`${API_URL}/duels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenger_id: currentUser.id,
          opponent_id: parseInt(opponentId),
          amount_kc: amount,
          duration_days: duration,
          tx_id: txId
        })
      });
      const duelData = await duelRes.json();

      if (duelData.success) {
        alert('対決の申請が完了しました！');
        loadRankingAndDuels();
        refreshWalletInfo();
      }
    } catch (e) {
      alert('蟇ｾ豎ｺ逕ｳ隲九お繝ｩ繝ｼ: ' + e.message);
    }
  });
}

async function loadRankingAndDuels() {
  if (!currentUser) return;

  try {
    const res = await fetch(`${API_URL}/ranking`);
    const ranking = await res.json();
    const list = document.getElementById('ranking-list');
    list.innerHTML = '';

    ranking.forEach((user, index) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${index + 1}. ${escapeHtml(user.username)}</span> <span>${Math.round(user.total_duration / 60)}蛻・/span>`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error('繝ｩ繝ｳ繧ｭ繝ｳ繧ｰ隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ:', e);
  }

  try {
    const res = await fetch(`${API_URL}/users`);
    const users = await res.json();
    const select = document.getElementById('duel-opponent');
    select.innerHTML = '<option value="">-- 蟇ｾ謌ｦ逶ｸ謇九ｒ驕ｸ謚・--</option>';

    users.forEach(user => {
      if (user.id !== currentUser.id) {
        const opt = document.createElement('option');
        opt.value = user.id;
        opt.textContent = user.username;
        select.appendChild(opt);
      }
    });
  } catch (e) {
    console.error('繝ｦ繝ｼ繧ｶ繝ｼ荳隕ｧ隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ:', e);
  }

  try {
    const res = await fetch(`${API_URL}/duels/${currentUser.id}`);
    const duels = await res.json();
    const list = document.getElementById('duels-list');
    list.innerHTML = '';

    if (duels.length === 0) {
      list.innerHTML = '<div class="empty-item">迴ｾ蝨ｨ騾ｲ陦御ｸｭ縺ｮ蟇ｾ豎ｺ縺ｯ縺ゅｊ縺ｾ縺帙ｓ縲・/div>';
      return;
    }

    duels.forEach(duel => {
      const isChallenger = duel.challenger_id === currentUser.id;
      const statusText = getStatusJp(duel.status);

      const div = document.createElement('div');
      div.className = `duel-item ${duel.status}`;
      
      let statsHtml = '';
      if (duel.status === 'active' || duel.status === 'completed') {
        statsHtml = `
          <div class="duel-stats">
            <div>${duel.challenger_name}: ${Math.round(duel.challenger_time / 60)}蛻・/div>
            <div>${duel.opponent_name}: ${Math.round(duel.opponent_time / 60)}蛻・/div>
          </div>
        `;
      }

      let actionHtml = '';
      if (duel.status === 'pending' && !isChallenger) {
        actionHtml = `
          <div class="duel-actions">
            <button class="btn success btn-sm" onclick="respondDuel(${duel.id}, true, ${duel.amount_kc})">蜿励￠縺ｦ遶九▽ (繝・・繧ｸ繝・ヨ)</button>
            <button class="btn secondary btn-sm" onclick="respondDuel(${duel.id}, false, 0)">諡貞凄縺吶ｋ</button>
          </div>
        `;
      } else if (duel.status === 'active') {
        actionHtml = `
          <div class="duel-actions">
            <button class="btn danger btn-sm" onclick="completeDuel(${duel.id})">邨先棡蛻､螳壹・螳御ｺ・☆繧・/button>
          </div>
        `;
      }

      div.innerHTML = `
        <div class="duel-header">
          <span>笞費ｸ・${duel.challenger_name} VS ${duel.opponent_name} [${statusText}]</span>
          <span>雉ｭ縺鷹≡: ${duel.amount_kc} KC</span>
        </div>
        <div>期間: ${duel.duration_days}日間 (開始: ${duel.start_date || '未開始'})</div>
        ${statsHtml}
        ${actionHtml}
      `;
      list.appendChild(div);
    });
  } catch (e) {
    console.error('蟇ｾ豎ｺ繝ｪ繧ｹ繝郁ｪｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ:', e);
  }
}

function getStatusJp(status) {
  switch (status) {
    case 'pending': return '申請中';
    case 'active': return '対決中';
    case 'completed': return '対決終了';
    case 'rejected': return '拒否されました';
    default: return status;
  }
}

async function respondDuel(duelId, accept, amount) {
  if (accept) {
    if (!currentWallet) {
      alert('対決を受けるにはウォレット連携が必要です。');
      return;
    }
    if (currentWallet.balance < amount) {
      alert('KC残高が不足しています。');
      return;
    }

    const confirmAccept = confirm(`本当に ${amount} KC をプールして対決を開始しますか？`);
    if (!confirmAccept) return;

    try {
      const systemPoolAddress = '0000000000000000000000000000000000000000';
      const balanceRes = await fetch(`${KC_URL}/balance/${currentWallet.address}`);
      const balanceData = await balanceRes.json();
      const nonce = balanceData.nonce;

      const message = `${currentWallet.address}:${systemPoolAddress}:${amount}:${nonce}`;
      const signature = generateSignature(message, currentWallet.secretKey);

      const sendRes = await fetch(`${KC_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: currentWallet.address,
          to: systemPoolAddress,
          amount,
          nonce,
          signature,
          publicKey: currentWallet.publicKey
        })
      });
      const sendData = await sendRes.json();

      if (!sendData.success) {
        alert('繝・・繧ｸ繝・ヨ縺ｮ騾・≡縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ' + sendData.error);
        return;
      }

      const txId = sendData.txId;

      const res = await fetch(`${API_URL}/duels/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duel_id: duelId, accept: true, tx_id: txId })
      });
      const data = await res.json();
      if (data.success) {
        alert('対決を開始しました！');
        loadRankingAndDuels();
        refreshWalletInfo();
      }
    } catch (e) {
      alert('繧ｨ繝ｩ繝ｼ: ' + e.message);
    }
  } else {
    try {
      const res = await fetch(`${API_URL}/duels/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duel_id: duelId, accept: false })
      });
      const data = await res.json();
      if (data.success) {
        alert('対決を拒否しました。');
        loadRankingAndDuels();
      }
    } catch (e) {
      alert('繧ｨ繝ｩ繝ｼ: ' + e.message);
    }
  }
}

async function completeDuel(duelId) {
  try {
    const res = await fetch(`${API_URL}/duels/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duel_id: duelId })
    });
    const data = await res.json();
    if (data.success) {
      if (data.winner_id) {
        alert(`対決完了！勝者はユーザーID ${data.winner_id} です。`);
      } else {
        alert('対決完了！引き分けでした。');
      }
      loadRankingAndDuels();
      refreshWalletInfo();
    }
  } catch (e) {
    alert('蟇ｾ豎ｺ縺ｮ螳御ｺ・・逅・お繝ｩ繝ｼ: ' + e.message);
  }
}

// --- 繧ｦ繧ｩ繝ｬ繝・ヨ險ｭ螳・---
function setupWalletEvents() {
  document.getElementById('generate-wallet-btn').addEventListener('click', () => {
    const keyPair = window.nacl.sign.keyPair();
    const seedBase64 = window.nacl.util.encodeBase64(keyPair.secretKey.slice(0, 32));
    document.getElementById('wallet-seed').value = seedBase64;
    importWalletFromSeed(seedBase64);
  });

  document.getElementById('import-wallet-btn').addEventListener('click', () => {
    const seed = document.getElementById('wallet-seed').value.trim();
    if (!seed) {
      alert('秘密鍵を入力してください。');
      return;
    }
    importWalletFromSeed(seed);
  });

  document.getElementById('register-kc-btn').addEventListener('click', async () => {
    if (!currentWallet) return;
    const inviteCode = document.getElementById('invite-code').value.trim();

    try {
      const res = await fetch(`${KC_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: currentWallet.publicKey,
          inviteCode
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        refreshWalletInfo();
      } else {
        alert('逋ｻ骭ｲ縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ' + data.error);
      }
    } catch (e) {
      alert('騾壻ｿ｡繧ｨ繝ｩ繝ｼ: ' + e.message);
    }
  });
}

async function importWalletFromSeed(seedBase64) {
  try {
    const seedBytes = window.nacl.util.decodeBase64(seedBase64);
    let keyPair;
    if (seedBytes.length === 64) {
      keyPair = window.nacl.sign.keyPair.fromSecretKey(seedBytes);
    } else if (seedBytes.length === 32) {
      keyPair = window.nacl.sign.keyPair.fromSeed(seedBytes);
    } else {
      throw new Error("鍵のサイズが正しくありません (32バイトまたは64バイトである必要があります)");
    }

    const publicKeyBase64 = window.nacl.util.encodeBase64(keyPair.publicKey);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyPair.publicKey);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const address = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);

    currentWallet = {
      publicKey: publicKeyBase64,
      secretKey: keyPair.secretKey,
      address: address,
      balance: 0,
      nonce: 0
    };

    localStorage.setItem('gakushu_plus_seed', seedBase64);

    document.getElementById('wallet-address').textContent = address;
    document.getElementById('wallet-seed').value = seedBase64;
    document.getElementById('wallet-register-section').classList.remove('hidden');

    if (currentUser) {
      await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, kc_address: address })
      });
    }

    refreshWalletInfo();
  } catch (e) {
    alert('秘密鍵のインポートに失敗しました: ' + e.message);
    localStorage.removeItem('gakushu_plus_seed');
    deleteCookie('gakushu_plus_seed');
    document.getElementById('login-modal').classList.remove('hidden');
  }
}

async function refreshWalletInfo() {
  if (!currentWallet) return;
  
  try {
    const res = await fetch(`${KC_URL}/balance/${currentWallet.address}`);
    if (res.status === 404) {
      document.getElementById('wallet-connection-status').textContent = '譛ｪ逋ｻ骭ｲ (繧｢繝峨Ξ繧ｹ縺ｯ逕滓・貂医∩)';
      document.getElementById('wallet-connection-status').className = 'status-value offline';
      document.getElementById('wallet-balance').textContent = '0 KC';
      document.getElementById('header-balance-badge').textContent = '0 KC';
      currentWallet.balance = 0;
      currentWallet.nonce = 0;
    } else {
      const data = await res.json();
      currentWallet.balance = data.balance;
      currentWallet.nonce = data.nonce;
      
      document.getElementById('wallet-connection-status').textContent = '接続完了';
      document.getElementById('wallet-connection-status').className = 'status-value online';
      document.getElementById('wallet-balance').textContent = `${data.balance} KC`;
      document.getElementById('header-balance-badge').textContent = `${data.balance} KC`;
    }
  } catch (e) {
    document.getElementById('wallet-connection-status').textContent = '繧ｪ繝輔Λ繧､繝ｳ (Fiction Money譛ｪ襍ｷ蜍・';
    document.getElementById('wallet-connection-status').className = 'status-value offline';
  }
}

// --- 繧ｿ繧､繝槭・逕ｻ髱｢逕ｨ繧ｯ繧､繝・け逋ｻ骭ｲ讖溯・ ---
function setupQuickRegisterEvents() {
  const trigger = document.getElementById('quick-register-trigger');
  const box = document.getElementById('quick-register-box');
  const importBtn = document.getElementById('quick-isbn-import-btn');
  const startBtn = document.getElementById('quick-start-scan-btn');
  const stopBtn = document.getElementById('quick-stop-scan-btn');

  trigger.addEventListener('click', () => {
    box.classList.toggle('hidden');
  });

  importBtn.addEventListener('click', async () => {
    const isbn = document.getElementById('quick-isbn-input').value.trim();
    const result = await importBookByIsbn(isbn, true);
    if (result) {
      document.getElementById('quick-isbn-input').value = '';
      box.classList.add('hidden');
    }
  });

  let html5QrcodeScanner = null;

  startBtn.addEventListener('click', () => {
    const readerDiv = document.getElementById('quick-barcode-reader');
    readerDiv.style.display = 'block';
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    html5QrcodeScanner = new Html5Qrcode("quick-barcode-reader");
    html5QrcodeScanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 200, height: 120 }
      },
      async (decodedText, decodedResult) => {
        stopQuickScanAction();
        const result = await importBookByIsbn(decodedText, true);
        if (result) {
          box.classList.add('hidden');
        }
      },
      (errorMessage) => {}
    ).catch(err => {
      alert("繧ｫ繝｡繝ｩ縺ｮ蛻晄悄蛹悶↓螟ｱ謨励＠縺ｾ縺励◆: " + err);
      stopQuickScanAction();
    });
  });

  stopBtn.addEventListener('click', () => {
    stopQuickScanAction();
  });

  function stopQuickScanAction() {
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    document.getElementById('quick-barcode-reader').style.display = 'none';
    if (html5QrcodeScanner) {
      html5QrcodeScanner.stop().then(() => {
        html5QrcodeScanner = null;
      }).catch(err => {
        console.error("繧ｹ繧ｭ繝｣繝ｳ蛛懈ｭ｢荳ｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆:", err);
      });
    }
  }
}

// --- 譛ｬ譽夂判髱｢逕ｨ繝舌・繧ｳ繝ｼ繝・(ISBN) 繧ｹ繧ｭ繝｣繝ｳ縺翫ｈ縺ｳ閾ｪ蜍輔う繝ｳ繝昴・繝域ｩ溯・ ---
function setupBarcodeEvents() {
  const importBtn = document.getElementById('isbn-import-btn');
  const startBtn = document.getElementById('start-scan-btn');
  const stopBtn = document.getElementById('stop-scan-btn');

  importBtn.addEventListener('click', async () => {
    const isbn = document.getElementById('isbn-input').value.trim();
    await importBookByIsbn(isbn, false);
  });

  let html5QrcodeScanner = null;

  startBtn.addEventListener('click', () => {
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    html5QrcodeScanner = new Html5Qrcode("barcode-reader");
    html5QrcodeScanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 150 }
      },
      async (decodedText, decodedResult) => {
        stopScanAction();
        await importBookByIsbn(decodedText, false);
      },
      (errorMessage) => {}
    ).catch(err => {
      alert("繧ｫ繝｡繝ｩ縺ｮ蛻晄悄蛹悶↓螟ｱ謨励＠縺ｾ縺励◆: " + err);
      stopScanAction();
    });
  });

  stopBtn.addEventListener('click', () => {
    stopScanAction();
  });

  function stopScanAction() {
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    if (html5QrcodeScanner) {
      html5QrcodeScanner.stop().then(() => {
        html5QrcodeScanner = null;
      }).catch(err => {
        console.error("繧ｹ繧ｭ繝｣繝ｳ蛛懈ｭ｢荳ｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆:", err);
      });
    }
  }
}

// ISBN縺九ｉ譖ｸ邀肴ュ蝣ｱ繧貞叙蠕励＠縺ｦ繧､繝ｳ繝昴・繝・(繧ｯ繧､繝・け逋ｻ骭ｲ蟇ｾ蠢・
async function importBookByIsbn(isbn, selectAutomatically = false) {
  isbn = isbn.replace(/-/g, '').trim();
  if (!isbn || isbn.length !== 13) {
    alert('正しい13桁のISBNコードを入力してください。');
    return false;
  }

  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    const data = await res.json();
    
    if (data && data[0] && data[0].summary && data[0].summary.title) {
      const title = data[0].summary.title;
      const cover_url = data[0].summary.cover || null;

      // 繧ｵ繝ｼ繝舌・縺ｫ蜿り・嶌繧堤匳骭ｲ
      const regRes = await fetch(`${API_URL}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, title, cover_url })
      });
      const regData = await regRes.json();
      
      if (regData.success) {
        alert(`参考書「${title}」を自動インポートしました！`);
        document.getElementById('isbn-input').value = '';
        
        await loadBooks();

        if (selectAutomatically) {
          const bookSelect = document.getElementById('timer-book');
          for (let i = 0; i < bookSelect.options.length; i++) {
            if (bookSelect.options[i].text === title) {
              bookSelect.selectedIndex = i;
              break;
            }
          }
        }
        return true;
      } else {
        alert('蜿り・嶌縺ｮ逋ｻ骭ｲ縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ' + regData.error);
      }
    } else {
      alert('書籍情報が見つかりませんでした。ISBNコードを確認してください。');
    }
  } catch (e) {
    alert('譖ｸ邀肴ュ蝣ｱ縺ｮ蜿門ｾ嶺ｸｭ縺ｫ騾壻ｿ｡繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: ' + e.message);
  }
  return false;
}

function generateSignature(message, secretKey) {
  const msgBytes = window.nacl.util.decodeUTF8(message);
  const signatureBytes = window.nacl.sign.detached(msgBytes, secretKey);
  return window.nacl.util.encodeBase64(signatureBytes);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}



// ===== フォルダ管理機能 =====
function setupFolderEvents() {
  // フォルダ作成ボタン
  const createBtn = document.getElementById('create-folder-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('new-folder-name');
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) { alert('フォルダ名を入力してください'); return; }
      try {
        const res = await fetch(`${API_URL}/folders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, name })
        });
        const data = await res.json();
        if (data.success) {
          if (nameInput) nameInput.value = '';
          loadBooks();
        }
      } catch (e) { alert('フォルダ作成エラー: ' + e.message); }
    });
  }
}

// ===== コメントモーダル =====
function setupCommentsModalEvents() {
  const closeBtn = document.getElementById('comments-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('comments-modal').classList.add('hidden');
    });
  }
}

