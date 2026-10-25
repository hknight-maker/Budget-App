// Budget screen: dashboard, paycheck and commissions, bills.
// It talks to a "store" object (see firebase-store.js) and knows nothing about Firebase.

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const PERIODS = { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1 };
const FREQ_WORDS = { weekly: 'weekly', biweekly: 'every two weeks', semimonthly: 'twice a month', monthly: 'monthly' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let bills = [];
let pays = []; // the commission log: one entry per pay date
let settings = { frequency: 'biweekly', salary: 0 };
let budgets = []; // spending categories with a monthly amount
let spends = []; // purchases logged against a category
let editingId = null;
let editingBudgetId = null;
let pendingDelete = null;
let pendingTimer = null;
let store = null;
let started = false;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => (n < 10 ? '0' : '') + n;
const today = () => new Date();
const isoDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const monthKey = () => { const d = today(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
function fail(e) {
  const denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
  toast(denied ? 'Could not save. Your Firestore rules need to be published again (see SETUP.md).' : 'Could not save. ' + ((e && e.message) || 'Try again in a moment.'));
}

/* ---------- calculations ---------- */
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const commEntries = () => pays.filter((p) => typeof p.commission === 'number');

function dueInfo(b) {
  const now = today();
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const due = Math.min(b.dueDay, dim);
  const diff = due - now.getDate();
  if (b.paidMonth === monthKey()) return { kind: 'paid', label: 'Paid' };
  if (diff < 0) return { kind: 'late', label: plural(-diff, 'day') + ' past due' };
  if (diff === 0) return { kind: 'soon', label: 'Due today' };
  if (diff <= 5) return { kind: 'soon', label: 'Due in ' + plural(diff, 'day') };
  return { kind: 'upcoming', label: 'Due in ' + plural(diff, 'day') };
}

/* ---------- render ---------- */
function renderSummary() {
  const freq = settings.frequency || 'biweekly';
  const sal = settings.salary > 0 ? settings.salary : 0;
  const income = sal * PERIODS[freq];
  const key = monthKey();
  const cs = commEntries();
  const commMonth = cs.filter((p) => p.date.slice(0, 7) === key).reduce((t, p) => t + p.commission, 0);
  const recent = cs.slice().sort(byDateDesc).slice(0, 6);
  const avg = recent.length ? recent.reduce((t, p) => t + p.commission, 0) / recent.length : 0;
  let total = 0, paid = 0;
  bills.forEach((b) => { total += b.amount; if (b.paidMonth === key) paid += b.amount; });
  const owed = total - paid;
  const left = income - total;
  const leftComm = left + commMonth;

  $('sumIncome').textContent = USD.format(income);
  $('sumIncomeNote').textContent = sal > 0 ? 'Salary only, ' + USD.format(sal) + ' per paycheck' : 'Enter your paycheck below';
  $('sumComm').textContent = USD.format(commMonth);
  $('sumCommNote').textContent = recent.length ? 'Average ' + USD.format(avg) + ' per pay period' : 'Add each pay period below';
  $('sumBills').textContent = USD.format(total);
  $('sumOwed').textContent = USD.format(owed);
  const l = $('sumLeft'); l.textContent = USD.format(left); l.className = 'fig ' + (left < 0 ? 'neg' : 'pos');
  const lc = $('sumLeftComm'); lc.textContent = USD.format(leftComm); lc.className = 'fig ' + (leftComm < 0 ? 'neg' : 'pos');

  const bb = $('barBlock');
  if (income > 0 && total > 0) {
    bb.hidden = false;
    const scale = Math.max(income, total);
    $('barPaid').style.width = (paid / scale * 100) + '%';
    $('barOwed').style.width = (owed / scale * 100) + '%';
    $('bar').setAttribute('aria-label', USD.format(paid) + ' paid, ' + USD.format(owed) + ' still to pay, of ' + USD.format(income) + ' monthly salary income');
  } else {
    bb.hidden = true;
  }
}

function renderPay() {
  const freq = settings.frequency || 'biweekly';
  const sal = settings.salary > 0 ? settings.salary : 0;
  $('latest').hidden = !(sal > 0);
  if (sal > 0) {
    $('latestAmt').textContent = USD.format(sal);
    const fw = FREQ_WORDS[freq];
    $('latestSub').textContent = fw.charAt(0).toUpperCase() + fw.slice(1) + ', about ' + USD.format(sal * PERIODS[freq]) + ' a month.';
  }
  if (document.activeElement !== $('payFreq')) $('payFreq').value = freq;
  if (sal > 0 && !$('payAmount').value && document.activeElement !== $('payAmount')) $('payAmount').value = sal;

  const sorted = commEntries().sort(byDateDesc);
  $('historyBlock').hidden = sorted.length === 0;
  $('history').innerHTML = sorted.map((p) => {
    const pr = p.date.split('-');
    const dt = new Date(+pr[0], +pr[1] - 1, +pr[2]);
    const del = pendingDelete === 'p:' + p.id;
    return '<li><span class="d">' + MONTHS[dt.getMonth()].slice(0, 3) + ' ' + dt.getDate() + ', ' + dt.getFullYear() + '</span>' +
      '<span class="fig">' + USD.format(p.commission) + '</span>' +
      '<button class="btn small' + (del ? ' danger' : '') + '" data-act="del-pay" data-id="' + esc(p.id) + '">' + (del ? 'Confirm' : 'Remove') + '</button></li>';
  }).join('');
}

function renderBills() {
  const sorted = bills.slice().sort((a, b) => a.dueDay - b.dueDay || a.name.localeCompare(b.name));
  $('billsEmpty').hidden = sorted.length > 0;
  $('billCount').textContent = sorted.length ? plural(sorted.length, 'bill') : '';
  $('bills').innerHTML = sorted.map((b) => {
    const info = dueInfo(b);
    const isPaid = info.kind === 'paid';
    const del = pendingDelete === 'b:' + b.id;
    return '<li class="bill' + (isPaid ? ' is-paid' : '') + '">' +
      '<div class="due"><span class="fig">' + ordinal(b.dueDay) + '</span><span class="label">of month</span></div>' +
      '<div class="name"><b>' + esc(b.name) + '</b><span>' + esc(b.category || 'Other') + '</span></div>' +
      '<div class="amt fig">' + USD.format(b.amount) + '</div>' +
      '<div class="meta">' +
        '<span class="chip ' + info.kind + '">' + esc(info.label) + '</span>' +
        '<label class="paid-toggle"><input type="checkbox" data-act="paid" data-id="' + esc(b.id) + '"' + (isPaid ? ' checked' : '') + '> Paid this month</label>' +
        '<span class="spacer"></span>' +
        '<button class="btn small" data-act="edit" data-id="' + esc(b.id) + '">Edit</button>' +
        '<button class="btn small' + (del ? ' danger' : '') + '" data-act="del-bill" data-id="' + esc(b.id) + '">' + (del ? 'Confirm' : 'Delete') + '</button>' +
      '</div></li>';
  }).join('');
}

function renderBudget() {
  const now = today();
  const key = monthKey();
  const mine = spends.filter((p) => (p.date || '').slice(0, 7) === key);
  const spentBy = {};
  mine.forEach((p) => { spentBy[p.categoryId] = (spentBy[p.categoryId] || 0) + p.amount; });
  const cats = budgets.slice().sort((a, b) => a.name.localeCompare(b.name));
  let totalB = 0, totalS = 0;
  cats.forEach((c) => { totalB += c.amount; totalS += spentBy[c.id] || 0; });
  const left = totalB - totalS;

  $('budMonth').textContent = MONTHS[now.getMonth()] + ' ' + now.getFullYear();
  $('budTotal').textContent = USD.format(totalB);
  $('budSpent').textContent = USD.format(totalS);
  const l = $('budLeft'); l.textContent = USD.format(left); l.className = 'fig ' + (totalB > 0 && left < 0 ? 'neg' : 'pos');

  $('budEmpty').hidden = cats.length > 0;
  $('budList').innerHTML = cats.map((c) => {
    const spent = spentBy[c.id] || 0;
    const rest = c.amount - spent;
    const pct = c.amount > 0 ? Math.min(spent / c.amount, 1) * 100 : (spent > 0 ? 100 : 0);
    const over = spent > c.amount;
    const kind = over ? 'late' : (c.amount > 0 && spent >= c.amount * 0.8 ? 'soon' : '');
    const label = over ? 'Over by ' + USD.format(spent - c.amount) : USD.format(rest) + ' left';
    const del = pendingDelete === 'c:' + c.id;
    return '<li class="cat">' +
      '<div class="cat-top"><b>' + esc(c.name) + '</b><span class="fig">' + USD.format(spent) + ' <span class="of">of ' + USD.format(c.amount) + '</span></span></div>' +
      '<div class="bar" role="img" aria-label="' + esc(c.name) + ': ' + USD.format(spent) + ' of ' + USD.format(c.amount) + '"><span class="' + (over ? 'b-over' : 'b-paid') + '" style="width:' + pct + '%"></span></div>' +
      '<div class="cat-meta"><span class="chip ' + kind + '">' + esc(label) + '</span><span class="spacer"></span>' +
        '<button class="btn small" data-act="edit-cat" data-id="' + esc(c.id) + '">Edit</button>' +
        '<button class="btn small' + (del ? ' danger' : '') + '" data-act="del-cat" data-id="' + esc(c.id) + '">' + (del ? 'Confirm' : 'Delete') + '</button></div>' +
      '</li>';
  }).join('');

  // category choices for the purchase form (keep the current choice)
  const sel = $('spendCat');
  const keep = sel.value;
  sel.innerHTML = cats.length
    ? cats.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('')
    : '<option value="">Add a category first</option>';
  if (keep && cats.some((c) => c.id === keep)) sel.value = keep;
  sel.disabled = cats.length === 0;

  const names = {};
  cats.forEach((c) => { names[c.id] = c.name; });
  const rows = mine.filter((p) => names[p.categoryId]).sort(byDateDesc);
  $('spendBlock').hidden = rows.length === 0;
  $('spendList').innerHTML = rows.map((p) => {
    const pr = p.date.split('-');
    const dt = new Date(+pr[0], +pr[1] - 1, +pr[2]);
    const del = pendingDelete === 's:' + p.id;
    return '<li><span class="d">' + MONTHS[dt.getMonth()].slice(0, 3) + ' ' + dt.getDate() + ' \u00b7 ' + esc(names[p.categoryId]) + (p.note ? ' \u00b7 ' + esc(p.note) : '') + '</span>' +
      '<span class="fig">' + USD.format(p.amount) + '</span>' +
      '<button class="btn small' + (del ? ' danger' : '') + '" data-act="del-spend" data-id="' + esc(p.id) + '">' + (del ? 'Confirm' : 'Remove') + '</button></li>';
  }).join('');
}

function renderAll() { renderSummary(); renderPay(); renderBills(); renderBudget(); }

function renderSync(st) {
  const box = $('storeNote');
  box.classList.remove('wait', 'off');
  let text = 'Synced to your account';
  if (st && st.offline) { box.classList.add('off'); text = 'Offline. Changes are saved on this device and will sync when you reconnect.'; }
  else if (st && st.pending) { box.classList.add('wait'); text = 'Syncing'; }
  $('storeNoteText').textContent = text;
}

/* ---------- actions ---------- */
function armDelete(key) {
  pendingDelete = key;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { pendingDelete = null; renderAll(); }, 3500);
  renderAll();
}
function resetBillForm() {
  editingId = null;
  $('billForm').reset();
  $('billSubmit').textContent = 'Add bill';
  $('billCancel').hidden = true;
}
function resetBudgetForm() {
  editingBudgetId = null;
  $('budForm').reset();
  $('budSubmit').textContent = 'Add category';
  $('budCancel').hidden = true;
}
function refreshDates() {
  const now = today();
  $('monthLabel').textContent = MONTHS[now.getMonth()] + ' ' + now.getFullYear();
}

function bindOnce() {
  $('billForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amt = parseFloat($('billAmount').value);
    const day = parseInt($('billDay').value, 10);
    const name = $('billName').value.trim();
    if (!name || !(amt >= 0) || !(day >= 1 && day <= 31)) { toast('Enter a name, an amount, and a due day from 1 to 31.'); return; }
    const data = { name, amount: Math.round(amt * 100) / 100, dueDay: day, category: $('billCat').value };
    const wasEdit = !!editingId;
    store.saveBill(editingId, data).then(() => toast(wasEdit ? 'Bill updated' : 'Bill added'), fail);
    resetBillForm();
    $('billName').focus();
  });
  $('billCancel').addEventListener('click', resetBillForm);

  $('payForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amt = parseFloat($('payAmount').value);
    if (!(amt > 0)) { toast('Enter your paycheck amount.'); return; }
    store.saveSettings({ salary: Math.round(amt * 100) / 100, frequency: $('payFreq').value }).then(() => toast('Paycheck saved'), fail);
  });
  $('commForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = parseFloat($('payCommission').value);
    const date = $('payDate').value;
    if (!(c >= 0) || !date) { toast('Enter the commission amount and the pay date.'); return; }
    store.addPay({ date, commission: Math.round(c * 100) / 100 }).then(() => toast('Commission added'), fail);
    $('payCommission').value = '';
    $('payCommission').focus();
  });
  $('payFreq').addEventListener('change', () => {
    store.saveSettings({ frequency: $('payFreq').value }).catch(fail);
  });

  $('bills').addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.getAttribute('data-act');
    const id = t.getAttribute('data-id');
    if (act === 'edit') {
      const b = bills.find((x) => x.id === id);
      if (!b) return;
      editingId = id;
      $('billName').value = b.name;
      $('billAmount').value = b.amount;
      $('billDay').value = b.dueDay;
      $('billCat').value = b.category || 'Other';
      $('billSubmit').textContent = 'Save changes';
      $('billCancel').hidden = false;
      $('billForm').scrollIntoView({ block: 'nearest' });
      $('billName').focus();
    } else if (act === 'del-bill') {
      if (pendingDelete === 'b:' + id) {
        pendingDelete = null;
        if (editingId === id) resetBillForm();
        store.deleteBill(id).then(() => toast('Bill deleted'), fail);
      } else {
        armDelete('b:' + id);
      }
    }
  });
  $('bills').addEventListener('change', (e) => {
    const t = e.target;
    if (t.getAttribute('data-act') !== 'paid') return;
    store.patchBill(t.getAttribute('data-id'), { paidMonth: t.checked ? monthKey() : null }).catch(fail);
  });
  $('history').addEventListener('click', (e) => {
    const t = e.target.closest('[data-act="del-pay"]');
    if (!t) return;
    const id = t.getAttribute('data-id');
    if (pendingDelete === 'p:' + id) {
      pendingDelete = null;
      store.deletePay(id).then(() => toast('Commission removed'), fail);
    } else {
      armDelete('p:' + id);
    }
  });
  $('budForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('budName').value.trim();
    const amt = parseFloat($('budAmount').value);
    if (!name || !(amt >= 0)) { toast('Enter a category name and a monthly amount.'); return; }
    const wasEdit = !!editingBudgetId;
    store.saveBudget(editingBudgetId, { name, amount: Math.round(amt * 100) / 100 }).then(() => toast(wasEdit ? 'Category updated' : 'Category added'), fail);
    resetBudgetForm();
    $('budName').focus();
  });
  $('budCancel').addEventListener('click', resetBudgetForm);
  $('spendForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const cat = $('spendCat').value;
    const amt = parseFloat($('spendAmount').value);
    const date = $('spendDate').value;
    if (!cat) { toast('Add a budget category first.'); return; }
    if (!(amt > 0) || !date) { toast('Enter the purchase amount and date.'); return; }
    store.addSpend({ categoryId: cat, amount: Math.round(amt * 100) / 100, date, note: $('spendNote').value.trim() }).then(() => toast('Purchase added'), fail);
    $('spendAmount').value = '';
    $('spendNote').value = '';
    $('spendAmount').focus();
  });
  $('budList').addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.getAttribute('data-act');
    const id = t.getAttribute('data-id');
    if (act === 'edit-cat') {
      const c = budgets.find((x) => x.id === id);
      if (!c) return;
      editingBudgetId = id;
      $('budName').value = c.name;
      $('budAmount').value = c.amount;
      $('budSubmit').textContent = 'Save changes';
      $('budCancel').hidden = false;
      $('budForm').scrollIntoView({ block: 'nearest' });
      $('budName').focus();
    } else if (act === 'del-cat') {
      if (pendingDelete === 'c:' + id) {
        pendingDelete = null;
        if (editingBudgetId === id) resetBudgetForm();
        // remove the category's purchases too, so nothing is left behind
        spends.filter((p) => p.categoryId === id).forEach((p) => store.deleteSpend(p.id).catch(fail));
        store.deleteBudget(id).then(() => toast('Category deleted'), fail);
      } else {
        armDelete('c:' + id);
      }
    }
  });
  $('spendList').addEventListener('click', (e) => {
    const t = e.target.closest('[data-act="del-spend"]');
    if (!t) return;
    const id = t.getAttribute('data-id');
    if (pendingDelete === 's:' + id) {
      pendingDelete = null;
      store.deleteSpend(id).then(() => toast('Purchase removed'), fail);
    } else {
      armDelete('s:' + id);
    }
  });
  // An installed app can stay open for days. Refresh the month and due dates when it comes back to the front.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && started) { refreshDates(); renderAll(); }
  });
}

/* Start the screen with a store. opts: { email, onSignOut } */
export function startApp(s, opts = {}) {
  store = s;
  refreshDates();
  $('payDate').value = isoDate(today());
  $('spendDate').value = isoDate(today());
  $('whoEmail').textContent = opts.email || '';
  $('signOut').onclick = () => opts.onSignOut && opts.onSignOut();
  if (!started) { bindOnce(); started = true; }
  renderAll();
  renderSync({});

  s.onWriteError && s.onWriteError(fail);
  s.onStatus && s.onStatus(renderSync);
  s.onBills((x) => { bills = x; renderAll(); });
  s.onPays((x) => { pays = x; renderAll(); });
  s.onBudgets((x) => { budgets = x; renderAll(); });
  s.onSpends((x) => { spends = x; renderAll(); });
  s.onSettings((x) => {
    settings = { frequency: (x && x.frequency) || 'biweekly', salary: Number(x && x.salary) || 0 };
    renderAll();
  });
}
