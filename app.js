/* ─────────────────────────────
   STORAGE HELPERS
   Each user's data lives in their own browser (localStorage).
   Nothing is shared between devices.
───────────────────────────── */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

/* ─────────────────────────────
   STATE  — loaded from localStorage, empty by default
───────────────────────────── */
let friends      = load('pb_friends',  []);   // no hardcoded names
let expenses     = load('pb_expenses', []);
let period       = load('pb_period',   'W');
let resetPending = false;
let _toastTimer;

/* ─────────────────────────────
   AVATAR COLOURS
───────────────────────────── */
const PALETTE = [
  '#16a085','#2980b9','#8e44ad','#e67e22',
  '#e74c3c','#27ae60','#2471a3','#d35400',
  '#7d3c98','#1abc9c'
];

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/* ─────────────────────────────
   MAIN TAB SWITCH
───────────────────────────── */
function switchTab(tab) {
  document.getElementById('pageFriends').classList.toggle('active',  tab === 'friends');
  document.getElementById('pageExpenses').classList.toggle('active', tab === 'expenses');
  document.getElementById('tabFriends').classList.toggle('active',   tab === 'friends');
  document.getElementById('tabExpenses').classList.toggle('active',  tab === 'expenses');
  if (tab === 'expenses') updateSummary();
}

/* ─────────────────────────────
   FRIENDS
───────────────────────────── */
function renderFriends() {
  const query = document.getElementById('friendSearch').value.trim().toLowerCase();
  const list  = document.getElementById('friendsList');
  const shown = query
    ? friends.filter(f => f.name.toLowerCase().includes(query))
    : friends;

  if (shown.length === 0) {
    list.innerHTML = `<div class="empty-friends">${
      query
        ? 'No matches found.'
        : 'No friends yet.<br>Tap <strong>+ Add Friend</strong> to get started.'
    }</div>`;
    return;
  }

  list.innerHTML = shown.map(f => `
    <div class="friend-row" onclick="friendTapped(${f.id})">
      <div class="avatar" style="background:${avatarColor(f.name)}">${f.name[0].toUpperCase()}</div>
      <span class="friend-name">${escHtml(f.name)}</span>
      <div class="friend-actions">
        <button class="btn-del" title="Remove" onclick="removeFriend(event,${f.id})">×</button>
      </div>
    </div>
  `).join('');
}

function friendTapped(id) {
  const f = friends.find(x => x.id === id);
  if (f) showToast(`${f.name} selected`);
}

function removeFriend(e, id) {
  e.stopPropagation();
  const f = friends.find(x => x.id === id);
  friends = friends.filter(x => x.id !== id);
  save('pb_friends', friends);
  renderFriends();
  if (f) showToast(`${f.name} removed`);
}

/* ─────────────────────────────
   ADD FRIEND MODAL
───────────────────────────── */
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

  // prevent duplicate names (case-insensitive)
  if (friends.some(f => f.name.toLowerCase() === name.toLowerCase())) {
    showToast('Friend already exists');
    return;
  }

  friends.push({ id: Date.now(), name });
  save('pb_friends', friends);
  closeAddFriend();
  renderFriends();
  showToast(`${name} added!`);
}

/* ─────────────────────────────
   PERIOD TOGGLE
───────────────────────────── */
const PERIOD_LABELS = { W: 'last 7 days', M: 'this month', Y: 'this year' };

function setPeriod(p, btn) {
  period = p;
  save('pb_period', p);
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('periodLabel').textContent = PERIOD_LABELS[p];
  updateSummary();
}

/* ─────────────────────────────
   EXPENSE TAB SWITCH
───────────────────────────── */
function switchExpTab(tab) {
  const isAdd = tab === 'add';
  document.getElementById('sectionAdd').style.display     = isAdd ? 'block' : 'none';
  document.getElementById('sectionHistory').style.display = isAdd ? 'none'  : 'block';
  document.getElementById('etAdd').classList.toggle('active',     isAdd);
  document.getElementById('etHistory').classList.toggle('active', !isAdd);
  if (!isAdd) renderHistory();
}

/* ─────────────────────────────
   SAVE EXPENSE
───────────────────────────── */
function saveExpense() {
  const amtEl  = document.getElementById('expAmt');
  const descEl = document.getElementById('expDesc');
  const amt    = parseFloat(amtEl.value);
  const desc   = descEl.value.trim();

  if (!amt || amt <= 0) { showToast('Enter a valid amount'); amtEl.focus(); return; }
  if (!desc)            { showToast('Enter a description');  descEl.focus(); return; }

  expenses.unshift({ id: Date.now(), amount: amt, description: desc, date: new Date() });
  save('pb_expenses', expenses);

  amtEl.value  = '';
  descEl.value = '';
  updateSummary();
  showToast('Expense saved ✓');
}

/* ─────────────────────────────
   SUMMARY
───────────────────────────── */
function updateSummary() {
  const now   = new Date();
  const today = expenses.filter(e => sameDay(new Date(e.date), now));
  document.getElementById('spentToday').textContent =
    '₹' + fmt(today.reduce((s, e) => s + e.amount, 0));

  let start;
  if (period === 'W') { start = new Date(now); start.setDate(now.getDate() - 7); }
  if (period === 'M') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  if (period === 'Y') { start = new Date(now.getFullYear(), 0, 1); }

  const pTotal = expenses
    .filter(e => new Date(e.date) >= start)
    .reduce((s, e) => s + e.amount, 0);
  document.getElementById('spentPeriod').textContent = '₹' + fmt(pTotal);
}

/* ─────────────────────────────
   HISTORY
───────────────────────────── */
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
        <div class="hist-info">
          <div class="hist-desc">${escHtml(e.description)}</div>
          <div class="hist-time">${fmtTime(new Date(e.date))}</div>
        </div>
        <div class="hist-amount">₹${fmt(e.amount)}</div>
        <button class="btn-del" onclick="deleteExpense(${e.id})" title="Delete">×</button>
      `;
      grp.appendChild(el);
    });
    list.appendChild(grp);
  });
}

/* ─────────────────────────────
   DELETE / RESET
───────────────────────────── */
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

/* ─────────────────────────────
   HELPERS
───────────────────────────── */
function fmt(n) {
  return Number(n).toLocaleString('en-IN');
}

function sameDay(a, b) {
  return a.getDate()     === b.getDate()     &&
         a.getMonth()    === b.getMonth()    &&
         a.getFullYear() === b.getFullYear();
}

function fmtDate(ds) {
  const d = new Date(ds);
  const t = new Date();
  if (sameDay(d, t)) return 'Today';
  const y = new Date();
  y.setDate(t.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(d) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ─────────────────────────────
   TOAST
───────────────────────────── */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ─────────────────────────────
   INIT — restore saved period button state
───────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

  // Restore the saved period button highlight
  const savedPeriodBtn = document.getElementById('p' + period);
  if (savedPeriodBtn) {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    savedPeriodBtn.classList.add('active');
    document.getElementById('periodLabel').textContent = PERIOD_LABELS[period];
  }

  // Close modal on overlay click
  document.getElementById('modalOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeAddFriend();
  });

  // Enter / Escape in Add Friend modal
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

  // Render with data from localStorage
  renderFriends();
  updateSummary();
});
