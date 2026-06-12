const API_URL = 'http://localhost:3001/api';
const KC_URL = 'http://localhost:3000/api';

let currentUser = null;
let currentWallet = null; // { publicKey, secretKey, address, balance, nonce }

// 繧ｿ繧､繝槭・螟画焚
let timerInterval = null;
let secondsElapsed = 0;
let isTimerRunning = false;

// 襍ｷ蜍墓凾蛻晄悄蛹・document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupTimer();
  setupBookEvents();
  setupDuelEvents();
  setupWalletEvents();
  setupBarcodeEvents();
  setupQuickRegisterEvents();
  setupEditModalEvents();

  // 繝ｭ繝ｼ繧ｫ繝ｫ繧ｹ繝医Ξ繝ｼ繧ｸ縺九ｉ繝ｭ繧ｰ繧､繝ｳ繝ｦ繝ｼ繧ｶ繝ｼ繧貞ｾｩ蜈・  const savedUser = localStorage.getItem('gakushu_plus_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showApp();
    loadUserData();
  } else {
    document.getElementById('login-modal').classList.remove('hidden');
  }

  // 繝ｭ繝ｼ繧ｫ繝ｫ繧ｹ繝医Ξ繝ｼ繧ｸ縺九ｉ繧ｦ繧ｩ繝ｬ繝・ヨ繧貞ｾｩ蜈・  const savedSeed = localStorage.getItem('gakushu_plus_seed');
  if (savedSeed) {
    importWalletFromSeed(savedSeed);
  }
});

// 繧ｿ繝門・繧頑崛縺・function setupTabs() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      
      button.classList.add('active');
      const targetTab = document.getElementById(`tab-${tabName}`);
      if (targetTab) {
        targetTab.classList.add('active');
      }

      if (tabName === 'books') loadBooks();
      if (tabName === 'ranking') loadRankingAndDuels();
      if (tabName === 'wallet') refreshWalletInfo();
      if (tabName === 'timer') loadStudyLogs();
    });
  });
}

// 繝ｭ繧ｰ繧､繝ｳ蜃ｦ逅・document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  if (!username) {
    alert('繝ｦ繝ｼ繧ｶ繝ｼ蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞');
    return;
  }

  try {
    let kc_address = null;
    if (currentWallet) {
      kc_address = currentWallet.address;
    }

    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, kc_address })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('gakushu_plus_user', JSON.stringify(currentUser));
      document.getElementById('login-modal').classList.add('hidden');
      showApp();
      loadUserData();
    } else {
      alert('繝ｭ繧ｰ繧､繝ｳ縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ' + data.error);
    }
  } catch (e) {
    alert('繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: ' + e.message);
  }
});

function showApp() {
  document.getElementById('header-username').textContent = currentUser.username;
}

async function loadUserData() {
  loadStudyLogs();
  loadBooks();
  if (currentWallet) {
    refreshWalletInfo();
  }
}

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
        alert(`${subject}縺ｮ蟄ｦ鄙呈凾髢・${formatTime(secondsElapsed)} 繧定ｨ倬鹸縺励∪縺励◆・～);
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

// 繧ｿ繧､繝繝ｩ繧､繝ｳ縺ｨ蟄ｦ鄙偵し繝槭Μ繝ｼ縺ｮ繝ｭ繝ｼ繝・async function loadStudyLogs() {
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

    document.getElementById('today-total-time').textContent = `${Math.round(todaySec / 60)}蛻・;
    document.getElementById('week-total-time').textContent = `${Math.round(weekSec / 60)}蛻・;
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
  if (!confirm('譛ｬ蠖薙↓縺薙・險倬鹸繧貞炎髯､縺励∪縺吶°・・)) return;
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

// 繧ｳ繝｡繝ｳ繝井ｸ隕ｧ縺ｮ繝ｭ繝ｼ繝・async function loadComments(id) {
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
      alert(isSecret ? '蜿り・嶌繧偵す繝ｼ繧ｯ繝ｬ繝・ヨ蛹悶＠縺ｾ縺励◆縲・ : '繧ｷ繝ｼ繧ｯ繝ｬ繝・ヨ險ｭ螳壹ｒ隗｣髯､縺励∪縺励◆縲・);
      loadBooks();
    }
  } catch (e) {
    alert('繧ｷ繝ｼ繧ｯ繝ｬ繝・ヨ險ｭ螳壹お繝ｩ繝ｼ: ' + e.message);
  }
}

// 繧ｷ繝ｼ繧ｯ繝ｬ繝・ヨ蜿り・嶌縺ｮ雉ｼ蜈･
async function purchaseBook(bookId, ownerAddress, price) {
  if (!currentWallet) {
    alert('雉ｼ蜈･縺ｫ縺ｯ繧ｦ繧ｩ繝ｬ繝・ヨ騾｣謳ｺ縺悟ｿ・ｦ√〒縺吶ゅ後え繧ｩ繝ｬ繝・ヨ騾｣謳ｺ縲阪ち繝悶〒險ｭ螳壹＠縺ｦ縺上□縺輔＞縲・);
    return;
  }
  if (currentWallet.balance < price) {
    alert('KC谿矩ｫ倥′荳崎ｶｳ縺励※縺・∪縺吶・);
    return;
  }
  if (!ownerAddress || ownerAddress === 'null') {
    alert('謇譛芽・・繧ｦ繧ｩ繝ｬ繝・ヨ繧｢繝峨Ξ繧ｹ縺檎匳骭ｲ縺輔ｌ縺ｦ縺・∪縺帙ｓ縲・);
    return;
  }

  const confirmPay = confirm(`${price} KC 繧呈髪謇輔▲縺ｦ縺薙・蜿り・嶌繧帝夢隕ｧ縺励∪縺吶°・歔);
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
      alert('雉ｼ蜈･縺悟ｮ御ｺ・＠縺ｾ縺励◆・・);
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
      alert('蟇ｾ謌ｦ逶ｸ謇九ｒ驕ｸ謚槭＠縺ｦ縺上□縺輔＞縲・);
      return;
    }

    if (!currentWallet) {
      alert('蟇ｾ豎ｺ縺ｮ菴懈・縺ｫ縺ｯ繧ｦ繧ｩ繝ｬ繝・ヨ騾｣謳ｺ縺悟ｿ・ｦ√〒縺吶・);
      return;
    }

    if (currentWallet.balance < amount) {
      alert('谿矩ｫ倥′荳崎ｶｳ縺励※縺・∪縺吶・);
      return;
    }

    const confirmDuel = confirm(`譛ｬ蠖薙↓ ${amount} KC 繧偵・繝ｼ繝ｫ縺励※蟇ｾ豎ｺ繧堤筏隲九＠縺ｾ縺吶°・歔);
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
        alert('蟇ｾ豎ｺ縺ｮ逕ｳ隲九′螳御ｺ・＠縺ｾ縺励◆・・);
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
        <div>譛滄俣: ${duel.duration_days}譌･髢・(髢句ｧ・ ${duel.start_date || '譛ｪ髢句ｧ・})</div>
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
    case 'pending': return '逕ｳ隲倶ｸｭ';
    case 'active': return '蟇ｾ豎ｺ荳ｭ';
    case 'completed': return '蟇ｾ豎ｺ邨ゆｺ・;
    case 'rejected': return '諡貞凄縺輔ｌ縺ｾ縺励◆';
    default: return status;
  }
}

async function respondDuel(duelId, accept, amount) {
  if (accept) {
    if (!currentWallet) {
      alert('蟇ｾ豎ｺ繧貞女縺代ｋ縺ｫ縺ｯ繧ｦ繧ｩ繝ｬ繝・ヨ騾｣謳ｺ縺悟ｿ・ｦ√〒縺吶・);
      return;
    }
    if (currentWallet.balance < amount) {
      alert('KC谿矩ｫ倥′荳崎ｶｳ縺励※縺・∪縺吶・);
      return;
    }

    const confirmAccept = confirm(`譛ｬ蠖薙↓ ${amount} KC 繧偵・繝ｼ繝ｫ縺励※蟇ｾ豎ｺ繧帝幕蟋九＠縺ｾ縺吶°・歔);
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
        alert('蟇ｾ豎ｺ繧帝幕蟋九＠縺ｾ縺励◆・・);
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
        alert('蟇ｾ豎ｺ繧呈拠蜷ｦ縺励∪縺励◆縲・);
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
        alert(`蟇ｾ豎ｺ螳御ｺ・ｼ・蜍晁・・繝ｦ繝ｼ繧ｶ繝ｼID ${data.winner_id} 縺ｧ縺吶Ａ);
      } else {
        alert('蟇ｾ豎ｺ螳御ｺ・ｼ・蠑輔″蛻・￠縺ｧ縺励◆縲・);
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
      alert('遘伜ｯ・嵯繧貞・蜉帙＠縺ｦ縺上□縺輔＞縲・);
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
    const keyPair = window.nacl.sign.keyPair.fromSeed(seedBytes);
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
    alert('遘伜ｯ・嵯縺ｮ繧､繝ｳ繝昴・繝医↓螟ｱ謨励＠縺ｾ縺励◆: ' + e.message);
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
      
      document.getElementById('wallet-connection-status').textContent = '謗･邯壼ｮ御ｺ・;
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
    alert('豁｣縺励＞13譯√・ISBN繧ｳ繝ｼ繝峨ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・);
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
        alert(`蜿り・嶌縲・{title}縲阪ｒ閾ｪ蜍輔う繝ｳ繝昴・繝医＠縺ｾ縺励◆・～);
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
      alert('譖ｸ邀肴ュ蝣ｱ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縺ｧ縺励◆縲・SBN繧ｳ繝ｼ繝峨ｒ遒ｺ隱阪＠縺ｦ縺上□縺輔＞縲・);
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

