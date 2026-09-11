/* ═══════════════════════════════════════
   STORAGE HELPERS
═══════════════════════════════════════ */
function load(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch (_) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let friends      = load('pb_friends',  []);
let expenses     = load('pb_expenses', []);
let ledger       = load('pb_ledger',   {});  // { friendId: [{id,type:'igive'|'theygive',amount,desc,date}] }
let period       = load('pb_period',   'W');
let resetPending = false;
let _toastTimer;

// Navigation stack — each item is a screen id + context
let navStack = [];            // e.g. ['screenFriends', 'screenFriendDetail', ...]
let currentFriendId  = null;
let currentEntryType = null;  // 'igive' | 'theygive'
let editingEntryId   = null;  // null = new entry

/* ═══════════════════════════════════════
   CATEGORY EMOJI MAPPER
═══════════════════════════════════════ */
function categoryEmoji(text) {
  const t = text.toLowerCase();
  if (/cloth|shirt|dress|shoe|shop|fashion|wear|jeans|top|kurti|saree/i.test(t)) return '👗';
  if (/ticket|movie|film|cinema|show|event|concert|game|match/i.test(t))          return '🎫';
  if (/food|lunch|dinner|breakfast|eat|meal|restaurant|cafe|tea|coffee|snack|biryani|pizza|burger|rice/i.test(t)) return '🍔';
  if (/cab|auto|bus|train|travel|uber|ola|transport|ride|petrol|fuel|metro/i.test(t)) return '🚕';
  if (/rent|house|room|pg|flat|hostel|home/i.test(t))                             return '🏠';
  if (/sport|gym|cricket|football|badminton|game|play/i.test(t))                  return '⚽';
  if (/book|pen|pencil|stationery|paper|notebook/i.test(t))                       return '📚';
  if (/medicine|medical|doctor|hospital|health|pharma|tablet|injection/i.test(t)) return '💊';
  if (/recharge|mobile|phone|internet|bill|electricity|wifi/i.test(t))            return '📱';
  return '💰';
}

/* ═══════════════════════════════════════
   AVATAR COLOUR (deterministic HSL)
═══════════════════════════════════════ */
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue},60%,42%)`;
}

/* ═══════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function navigate(screenId) {
  navStack.push(screenId);
  showScreen(screenId);
  updateHeader();
}

function goBack() {
  if (navStack.length <= 1) return;
  navStack.pop();
  const prev = navStack[navStack.length - 1];
  showScreen(prev);
  updateHeader();

  // If we went back to expenses screen restore its sub-state
  if (prev === 'screenExpenses') updateSummary();
}

function updateHeader() {
  const cur = navStack[navStack.length - 1];
  const btnBack = document.getElementById('btnBack');
  const logoIcon = document.querySelector('.logo-icon');
  const headerTitle = document.getElementById('headerTitle');
  const tabStrip = document.getElementById('mainTabStrip');

  const isRoot = cur === 'screenFriends' || cur === 'screenExpenses';
  btnBack.style.display    = isRoot ? 'none' : 'flex';
  logoIcon.style.display   = isRoot ? '' : 'none';

  if (cur === 'screenFriends' || cur === 'screenExpenses') {
    headerTitle.textContent = 'PayBuddy';
    headerTitle.style.cssText = '';
    tabStrip.style.display = 'flex';
  } else {
    tabStrip.style.display = 'none';
  }

  if (cur === 'screenFriendDetail' && currentFriendId) {
    const f = friends.find(x => x.id === currentFriendId);
    headerTitle.textContent = f ? f.name : 'Friend';
    headerTitle.style.background = 'none';
    headerTitle.style.webkitBackgroundClip = 'unset';
    headerTitle.style.webkitTextFillColor = 'var(--text)';
    headerTitle.style.fontSize = '1.1rem';
    headerTitle.style.fontWeight = '700';
  }

  if (cur === 'screenEntryForm') {
    headerTitle.textContent = editingEntryId ? 'Edit entry' : (currentEntryType === 'igive' ? 'I Give' : 'They Give Me');
    headerTitle.style.background = 'none';
    headerTitle.style.webkitBackgroundClip = 'unset';
    headerTitle.style.webkitTextFillColor = 'var(--text)';
    headerTitle.style.fontSize = '1.1rem';
    headerTitle.style.fontWeight = '700';
  }

  if (cur === 'screenFriendHistory') {
    const f = friends.find(x => x.id === currentFriendId);
    headerTitle.textContent = f ? `${f.name}'s history` : 'History';
    headerTitle.style.background = 'none';
    headerTitle.style.webkitBackgroundClip = 'unset';
    headerTitle.style.webkitTextFillColor = 'var(--text)';
    headerTitle.style.fontSize = '1.05rem';
    headerTitle.style.fontWeight = '700';
  }
}

/* ═══════════════════════════════════════
   MAIN TAB SWITCH
═══════════════════════════════════════ */
function switchTab(tab) {
  document.getElementById('tabFriends').classList.toggle('active',  tab === 'friends');
  document.getElementById('tabExpenses').classList.toggle('active', tab === 'expenses');

  navStack = [tab === 'friends' ? 'screenFriends' : 'screenExpenses'];
  showScreen(navStack[0]);
  updateHeader();
  if (tab === 'expenses') updateSummary();
}

/* ═══════════════════════════════════════
   FRIENDS LIST
═══════════════════════════════════════ */
function renderFriends() {
  const query = document.getElementById('friendSearch').value.trim().toLowerCase();
  const list  = document.getElementById('friendsList');
  const shown = query ? friends.filter(f => f.name.toLowerCase().includes(query)) : friends;

  if (shown.length === 0) {
    list.innerHTML = `<div class="empty-friends">${
      query ? 'No matches found.' : 'No friends yet.<br>Tap <strong>+ Add Friend</strong> to get started.'
    }</div>`;
    return;
  }

  list.innerHTML = shown.map(f => {
    const bal   = getBalance(f.id);
    // bal = theygive - igive
    // bal < 0 → I gave more → friend owes me → green
    // bal > 0 → friend gave more → I owe friend → red
    const balEl = bal === 0
      ? `<span class="friend-balance zero">Settled</span>`
      : bal < 0
        ? `<span class="friend-balance pos">owes ₹${fmt(Math.abs(bal))}</span>`
        : `<span class="friend-balance neg">you owe ₹${fmt(bal)}</span>`;

    const avatarInner = f.photo
      ? `<img src="${f.photo}" alt="${escHtml(f.name)}" />`
      : f.name[0].toUpperCase();

    return `
      <div class="friend-row" onclick="openFriendDetail(${f.id})">
        <div class="avatar" style="${f.photo ? '' : `background:${avatarColor(f.name)}`}">${avatarInner}</div>
        <span class="friend-name">${escHtml(f.name)}</span>
        ${balEl}
        <div class="friend-actions">
          <button class="btn-del" title="Remove" onclick="removeFriend(event,${f.id})">×</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ─── balance helpers ─── */
function getLedger(fid) { return ledger[fid] || []; }

function getBalance(fid) {
  // positive = friend owes me (I gave more), negative = I owe friend (they gave more)
  const ig = getTotal(fid, 'igive');
  const tg = getTotal(fid, 'theygive');
  return tg - ig;  // same as refreshDetailSummary: netBalance = friendGivesMe - iGive
}

function getTotal(fid, type) {
  return getLedger(fid).filter(e => e.type === type).reduce((s, e) => s + e.amount, 0);
}

/* ═══════════════════════════════════════
   ADD FRIEND MODAL
═══════════════════════════════════════ */
function openAddFriend() {
  document.getElementById('newFriendName').value = '';
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('newFriendName').focus(), 80);
}

function closeAddFriend() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function confirmAddFriend() {
  const name = document.getElementById('newFriendName').value.trim();
  if (!name) { showToast('Enter a name'); return; }
  if (friends.some(f => f.name.toLowerCase() === name.toLowerCase())) {
    showToast('Friend already exists'); return;
  }
  const id = Date.now();
  friends.push({ id, name, photo: null });
  save('pb_friends', friends);
  closeAddFriend();
  renderFriends();
  showToast(`${name} added!`);
}

function removeFriend(e, id) {
  e.stopPropagation();
  const f = friends.find(x => x.id === id);
  friends = friends.filter(x => x.id !== id);
  delete ledger[id];
  save('pb_friends', friends);
  save('pb_ledger', ledger);
  renderFriends();
  if (f) showToast(`${f.name} removed`);
}

/* ═══════════════════════════════════════
   FRIEND DETAIL
═══════════════════════════════════════ */
function openFriendDetail(fid) {
  currentFriendId = fid;
  const f = friends.find(x => x.id === fid);
  if (!f) return;

  // Avatar
  const av = document.getElementById('detailAvatar');
  if (f.photo) {
    av.style.background = '';
    av.innerHTML = `<img src="${f.photo}" alt="${escHtml(f.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;
  } else {
    av.style.background = avatarColor(f.name);
    av.textContent = f.name[0].toUpperCase();
  }

  document.getElementById('detailName').textContent = f.name;
  document.getElementById('detailTheyLabel').textContent = `${f.name} gives me`;
  document.getElementById('theyGiveBtn').textContent = `${f.name} Gives Me`;

  refreshDetailSummary(fid);
  navigate('screenFriendDetail');
}

function refreshDetailSummary(fid) {
  const f  = friends.find(x => x.id === fid);
  const ig = getTotal(fid, 'igive');     // total I gave to friend
  const tg = getTotal(fid, 'theygive'); // total friend gave to me

  document.getElementById('detailIGive').textContent    = `₹${fmt(ig)}`;
  document.getElementById('detailTheyGive').textContent = `₹${fmt(tg)}`;

  // netBalance = friendGivesMe - iGive
  // positive  → friend still owes me  → "Ammar gives you ₹X"
  // negative  → I still owe friend    → "You give Ammar ₹X"
  // zero      → settled
  const netBalance = tg - ig;
  const nb = document.getElementById('netBalance');

  if (netBalance === 0) {
    nb.textContent = 'Pending : Settled 🎉';
    nb.className   = 'net-balance';
  } else if (netBalance < 0) {
    // I gave more → friend owes me
    nb.textContent = `Pending : ${f.name} gives to you ₹${fmt(Math.abs(netBalance))}`;
    nb.className   = 'net-balance positive';
  } else {
    // Friend gave more → I owe friend
    nb.textContent = `Pending : You give to ${f.name} ₹${fmt(netBalance)}`;
    nb.className   = 'net-balance negative';
  }
}

/* ═══════════════════════════════════════
   AVATAR UPLOAD
═══════════════════════════════════════ */
function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file || !currentFriendId) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const f = friends.find(x => x.id === currentFriendId);
    if (!f) return;
    f.photo = e.target.result;
    save('pb_friends', friends);
    openFriendDetail(currentFriendId); // re-render
    renderFriends();
    showToast('Photo updated');
  };
  reader.readAsDataURL(file);
}

/* ═══════════════════════════════════════
   ENTRY FORM  (I Give / They Give Me / Edit)
═══════════════════════════════════════ */
function openEntryForm(type, editId) {
  currentEntryType = type || currentEntryType;
  editingEntryId   = editId || null;

  const f = friends.find(x => x.id === currentFriendId);
  const titleMap = {
    igive:    `I give ${f ? f.name : ''}`,
    theygive: `${f ? f.name : ''} gives me`
  };

  document.getElementById('entryFormTitle').textContent =
    editingEntryId ? 'Edit entry' : titleMap[currentEntryType];

  // Pre-fill if editing
  if (editingEntryId) {
    const entry = getLedger(currentFriendId).find(e => e.id === editingEntryId);
    if (entry) {
      document.getElementById('entryAmt').value  = entry.amount;
      document.getElementById('entryDesc').value = entry.desc;
    }
  } else {
    document.getElementById('entryAmt').value  = '';
    document.getElementById('entryDesc').value = '';
  }

  renderEntryRecent();
  navigate('screenEntryForm');
  setTimeout(() => document.getElementById('entryAmt').focus(), 120);
}

function saveEntry() {
  const amtEl  = document.getElementById('entryAmt');
  const descEl = document.getElementById('entryDesc');
  const amt    = parseFloat(amtEl.value);
  const desc   = descEl.value.trim();

  if (!amt || amt <= 0) { showToast('Enter a valid amount'); amtEl.focus(); return; }
  if (!desc)            { showToast('Enter a purpose');      descEl.focus(); return; }

  if (!ledger[currentFriendId]) ledger[currentFriendId] = [];

  if (editingEntryId) {
    const idx = ledger[currentFriendId].findIndex(e => e.id === editingEntryId);
    if (idx !== -1) {
      ledger[currentFriendId][idx].amount = amt;
      ledger[currentFriendId][idx].desc   = desc;
    }
    editingEntryId = null;
    showToast('Entry updated ✓');
  } else {
    ledger[currentFriendId].unshift({
      id:   Date.now(),
      type: currentEntryType,
      amount: amt,
      desc,
      date: new Date().toISOString()
    });
    showToast('Saved ✓');
  }

  save('pb_ledger', ledger);
  amtEl.value  = '';
  descEl.value = '';
  renderEntryRecent();
  refreshDetailSummary(currentFriendId);
  renderFriends();
}

function renderEntryRecent() {
  const entries = getLedger(currentFriendId)
    .filter(e => e.type === currentEntryType)
    .slice(0, 8);

  const label = document.getElementById('recentLabel');
  const list  = document.getElementById('entryRecentList');

  if (entries.length === 0) {
    label.textContent = '';
    list.innerHTML = '';
    return;
  }

  label.textContent = 'Recent entries';
  list.innerHTML = entries.map(e => `
    <div class="hist-item">
      <span class="hist-emoji">${categoryEmoji(e.desc)}</span>
      <div class="hist-info">
        <div class="hist-desc">${escHtml(e.desc)}</div>
        <div class="hist-time">${fmtDateTime(e.date)}</div>
      </div>
      <div class="hist-amount ${currentEntryType === 'igive' ? 'red' : 'green'}">₹${fmt(e.amount)}</div>
      <div class="hist-actions">
        <button class="btn-edit" onclick="openEntryForm('${currentEntryType}',${e.id})">Edit</button>
        <button class="btn-del"  onclick="deleteEntry(${e.id})">×</button>
      </div>
    </div>
  `).join('');
}

function deleteEntry(eid) {
  ledger[currentFriendId] = getLedger(currentFriendId).filter(e => e.id !== eid);
  save('pb_ledger', ledger);
  renderEntryRecent();
  refreshDetailSummary(currentFriendId);
  renderFriends();
  showToast('Deleted');
}

/* ═══════════════════════════════════════
   FRIEND HISTORY PAGE
═══════════════════════════════════════ */
function showFriendHistory() {
  renderFriendHistory();
  navigate('screenFriendHistory');
}

function renderFriendHistory() {
  const f       = friends.find(x => x.id === currentFriendId);
  const entries = getLedger(currentFriendId);
  const wrap    = document.getElementById('friendHistorySections');

  if (entries.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No transactions yet.</div>';
    return;
  }

  const iPaid   = entries.filter(e => e.type === 'igive');
  const theyPaid = entries.filter(e => e.type === 'theygive');

  wrap.innerHTML = '';

  function buildSection(title, cls, items, amtCls) {
    if (items.length === 0) return;
    const sec = document.createElement('div');
    const header = document.createElement('div');
    header.className = `hist-section-title ${cls}`;
    header.textContent = title;
    sec.appendChild(header);

    const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(e => {
      const el = document.createElement('div');
      el.className = 'hist-item';
      el.innerHTML = `
        <span class="hist-emoji">${categoryEmoji(e.desc)}</span>
        <div class="hist-info">
          <div class="hist-desc">${escHtml(e.desc)}</div>
          <div class="hist-time">${fmtDateTime(e.date)}</div>
        </div>
        <div class="hist-amount ${amtCls}">₹${fmt(e.amount)}</div>
        <div class="hist-actions">
          <button class="btn-edit" onclick="editFromHistory(${e.id},'${e.type}')">Edit</button>
          <button class="btn-del"  onclick="deleteFromHistory(${e.id})">×</button>
        </div>
      `;
      sec.appendChild(el);
    });
    wrap.appendChild(sec);
  }

  buildSection(`I PAID ${f ? f.name.toUpperCase() : ''}`,    'i-paid',    iPaid,    'red');
  buildSection(`${f ? f.name.toUpperCase() : ''} PAID ME`,   'they-paid', theyPaid, 'green');
}

function editFromHistory(eid, type) {
  currentEntryType = type;
  openEntryForm(type, eid);
}

function deleteFromHistory(eid) {
  ledger[currentFriendId] = getLedger(currentFriendId).filter(e => e.id !== eid);
  save('pb_ledger', ledger);
  renderFriendHistory();
  refreshDetailSummary(currentFriendId);
  renderFriends();
  showToast('Deleted');
}

/* ═══════════════════════════════════════
   MY EXPENSES — PERIOD TOGGLE
═══════════════════════════════════════ */
const PERIOD_LABELS = { W: 'last 7 days', M: 'last 30 days', Y: 'last 12 months' };

function setPeriod(p, btn) {
  period = p;
  save('pb_period', p);
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('periodLabel').textContent = PERIOD_LABELS[p];
  updateSummary();
}

/* ═══════════════════════════════════════
   MY EXPENSES — TAB
═══════════════════════════════════════ */
function switchExpTab(tab) {
  const isAdd = tab === 'add';
  document.getElementById('sectionAdd').style.display     = isAdd ? 'block' : 'none';
  document.getElementById('sectionHistory').style.display = isAdd ? 'none'  : 'block';
  document.getElementById('etAdd').classList.toggle('active',     isAdd);
  document.getElementById('etHistory').classList.toggle('active', !isAdd);
  if (!isAdd) renderHistory();
}

/* ═══════════════════════════════════════
   SAVE EXPENSE
═══════════════════════════════════════ */
function saveExpense() {
  const amtEl  = document.getElementById('expAmt');
  const descEl = document.getElementById('expDesc');
  const amt    = parseFloat(amtEl.value);
  const desc   = descEl.value.trim();

  if (!amt || amt <= 0) { showToast('Enter a valid amount'); amtEl.focus(); return; }
  if (!desc)            { showToast('Enter a description');  descEl.focus(); return; }

  expenses.unshift({ id: Date.now(), amount: amt, description: desc, date: new Date().toISOString() });
  save('pb_expenses', expenses);
  amtEl.value  = '';
  descEl.value = '';
  updateSummary();
  showToast('Expense saved ✓');
}

/* ═══════════════════════════════════════
   SUMMARY
═══════════════════════════════════════ */
function updateSummary() {
  const now   = new Date();
  const today = expenses.filter(e => sameDay(new Date(e.date), now));
  document.getElementById('spentToday').textContent =
    '₹' + fmt(today.reduce((s, e) => s + e.amount, 0));

  let start;
  if (period === 'W') { start = new Date(now); start.setDate(now.getDate() - 7); }
  if (period === 'M') { start = new Date(now); start.setDate(now.getDate() - 30); }
  if (period === 'Y') { start = new Date(now); start.setMonth(now.getMonth() - 12); }

  const pTotal = expenses
    .filter(e => new Date(e.date) >= start)
    .reduce((s, e) => s + e.amount, 0);
  document.getElementById('spentPeriod').textContent = '₹' + fmt(pTotal);
}

/* ═══════════════════════════════════════
   PERSONAL EXPENSE HISTORY
═══════════════════════════════════════ */
function renderHistory() {
  const list = document.getElementById('historyList');

  if (expenses.length === 0) {
    list.innerHTML = '<div class="empty-state">No expenses yet.<br>Switch to Add and log your first one.</div>';
    return;
  }

  const groups = {};
  expenses.forEach(e => {
    const k = new Date(e.date).toDateString();
    if (!groups[k]) groups[k] = [];
    groups[k].push(e);
  });

  list.innerHTML = '';
  Object.entries(groups).forEach(([key, items]) => {
    const dayTotal = items.reduce((s, e) => s + e.amount, 0);
    const grp = document.createElement('div');
    grp.className = 'day-group';
    grp.innerHTML = `
      <div class="day-header">
        <span class="day-label">${fmtDate(key)}</span>
        <span class="day-total">₹${fmt(dayTotal)}</span>
      </div>
    `;
    items.forEach(e => {
      const el = document.createElement('div');
      el.className = 'hist-item';
      el.innerHTML = `
        <span class="hist-emoji">${categoryEmoji(e.description)}</span>
        <div class="hist-info">
          <div class="hist-desc">${escHtml(e.description)}</div>
          <div class="hist-time">${fmtTime(new Date(e.date))}</div>
        </div>
        <div class="hist-amount">₹${fmt(e.amount)}</div>
        <div class="hist-actions">
          <button class="btn-del" onclick="deleteExpense(${e.id})" title="Delete">×</button>
        </div>
      `;
      grp.appendChild(el);
    });
    list.appendChild(grp);
  });
}

/* ═══════════════════════════════════════
   DELETE / RESET EXPENSES
═══════════════════════════════════════ */
function deleteExpense(id) {
  expenses = expenses.filter(e => e.id !== id);
  save('pb_expenses', expenses);
  updateSummary();
  renderHistory();
  showToast('Deleted');
}

function resetExpenses() {
  const btn = document.getElementById('resetBtn');
  if (!resetPending) {
    resetPending = true;
    btn.classList.add('confirm');
    btn.textContent = 'Tap again to confirm';
    setTimeout(() => {
      resetPending = false;
      btn.classList.remove('confirm');
      btn.textContent = 'Reset all expenses';
    }, 3000);
    return;
  }
  expenses = [];
  save('pb_expenses', expenses);
  resetPending = false;
  btn.classList.remove('confirm');
  btn.textContent = 'Reset all expenses';
  updateSummary();
  renderHistory();
  showToast('All expenses cleared');
}

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function fmt(n) { return Number(n).toLocaleString('en-IN'); }

function sameDay(a, b) {
  return a.getDate()     === b.getDate()     &&
         a.getMonth()    === b.getMonth()    &&
         a.getFullYear() === b.getFullYear();
}

function fmtDate(ds) {
  const d = new Date(ds), t = new Date();
  if (sameDay(d, t)) return 'Today';
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(d) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {

  // Start on Friends screen
  navStack = ['screenFriends'];
  showScreen('screenFriends');
  updateHeader();

  // Restore period toggle
  const savedBtn = document.getElementById('p' + period);
  if (savedBtn) {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    savedBtn.classList.add('active');
    document.getElementById('periodLabel').textContent = PERIOD_LABELS[period];
  }

  // Modal events
  document.getElementById('modalOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeAddFriend();
  });
  document.getElementById('newFriendName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  confirmAddFriend();
    if (e.key === 'Escape') closeAddFriend();
  });

  // Expense form keyboard nav
  document.getElementById('expAmt').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('expDesc').focus();
  });
  document.getElementById('expDesc').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') saveExpense();
  });

  // Entry form keyboard nav
  document.getElementById('entryAmt').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('entryDesc').focus();
  });
  document.getElementById('entryDesc').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') saveEntry();
  });

  // Hardware back gesture (Android)
  window.addEventListener('popstate', function () { goBack(); });

  renderFriends();
  updateSummary();
});
