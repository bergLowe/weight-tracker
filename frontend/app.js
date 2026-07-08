// Every screen in the online/offline flow, wired to real Google sign-in and the
// real Apps Script backend. QA helpers exposed on window: showScreen('login'|'silent'|'app'),
// setOffline(bool) — the latter is still a manual toggle; real offline data caching
// (localStorage) is Phase 6.

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ================= Screen switching (QA helpers for now; Phase 4 drives this for real) =================

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((el) => { el.hidden = true; });
  document.getElementById('screen-' + name).hidden = false;
  // Chart.js lays out against the canvas's rendered size at construction time;
  // building it while its container is hidden (display:none) gives it a broken
  // layout that doesn't self-correct. Build it lazily, the first time the app
  // screen is actually visible, instead.
  if (name === 'app' && !chart) initChart();
}

function setOffline(isOffline) {
  // Main-app offline UI (banner text needs a "last synced" time, which only
  // exists once Phase 5 adds real cached data) — still a manual QA toggle.
  document.getElementById('app-offline-banner').hidden = !isOffline;
  document.getElementById('weight-input').disabled = isOffline;
  document.getElementById('date-trigger').disabled = isOffline;
  document.getElementById('save-btn').disabled = isOffline;
  document.getElementById('offline-field-note').hidden = !isOffline;
  document.querySelectorAll('.icon-btn').forEach((b) => { b.disabled = isOffline; });
}

window.showScreen = showScreen;
window.setOffline = setOffline;

// ================= Calendar date picker =================

let selectedDate = startOfDay(new Date());
let calendarViewYear = selectedDate.getFullYear();
let calendarViewMonth = selectedDate.getMonth();
const entryDates = new Set(); // populated from fetched entries, drives the calendar's dot marker

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// yyyy-MM-dd -> local-midnight Date. NOT `new Date(iso)` — that parses as UTC
// midnight, which can land on the wrong local day near timezone boundaries.
function parseISODateLocal(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatTableDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatChartLabel(iso) {
  const d = parseISODateLocal(iso);
  return `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
}

function formatDisplayDate(date) {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${date.getDate()} ${month} ${date.getFullYear()}`;
}

function formatMonthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function renderDateTrigger() {
  document.getElementById('date-trigger-label').textContent = formatDisplayDate(selectedDate);
}

function renderCalendarGrid() {
  const grid = document.getElementById('cal-grid');
  grid.textContent = '';
  document.getElementById('cal-month-label').textContent = formatMonthLabel(calendarViewYear, calendarViewMonth);

  const today = startOfDay(new Date());
  const firstOfMonth = new Date(calendarViewYear, calendarViewMonth, 1);
  const leadingDays = firstOfMonth.getDay();
  const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - leadingDays + 1;
    const cellDate = new Date(calendarViewYear, calendarViewMonth, dayNum);
    const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const isFuture = cellDate > today;
    const isToday = isCurrentMonth && cellDate.getTime() === today.getTime();
    const isSelected = isCurrentMonth && cellDate.getTime() === selectedDate.getTime();
    const hasEntry = isCurrentMonth && entryDates.has(toISODate(cellDate));

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    if (!isCurrentMonth) btn.classList.add('muted');
    if (isToday) btn.classList.add('today');
    if (isSelected) btn.classList.add('selected');
    btn.textContent = String(cellDate.getDate());
    btn.setAttribute('role', 'gridcell');
    btn.setAttribute('aria-label', formatDisplayDate(cellDate));

    if (isFuture) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => selectDay(cellDate));
    }

    if (hasEntry) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      btn.appendChild(dot);
    }

    grid.appendChild(btn);
  }
}

function selectDay(date) {
  selectedDate = startOfDay(date);
  renderDateTrigger();
  closeCalendar();
}

function openCalendar() {
  calendarViewYear = selectedDate.getFullYear();
  calendarViewMonth = selectedDate.getMonth();
  renderCalendarGrid();
  document.getElementById('calendar-panel').hidden = false;
  document.getElementById('date-chevron').textContent = '▲';
  document.getElementById('date-trigger').setAttribute('aria-expanded', 'true');
}

function closeCalendar() {
  document.getElementById('calendar-panel').hidden = true;
  document.getElementById('date-chevron').textContent = '▼';
  document.getElementById('date-trigger').setAttribute('aria-expanded', 'false');
}

function initCalendar() {
  renderDateTrigger();
  const trigger = document.getElementById('date-trigger');
  const panel = document.getElementById('calendar-panel');

  trigger.addEventListener('click', () => {
    if (panel.hidden) openCalendar(); else closeCalendar();
  });
  document.getElementById('cal-prev').addEventListener('click', () => {
    calendarViewMonth -= 1;
    if (calendarViewMonth < 0) { calendarViewMonth = 11; calendarViewYear -= 1; }
    renderCalendarGrid();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calendarViewMonth += 1;
    if (calendarViewMonth > 11) { calendarViewMonth = 0; calendarViewYear += 1; }
    renderCalendarGrid();
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !trigger.contains(e.target)) closeCalendar();
  });
}

// ================= Chart =================

let chart;
let allEntries = []; // populated from the API, sorted ascending by date
let activeRange = 'all';

const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(c) {
    const active = c.tooltip && c.tooltip.getActiveElements ? c.tooltip.getActiveElements() : [];
    if (!active.length) return;
    const { ctx, chartArea } = c;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = cssVar('--text-muted');
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.restore();
  }
};

function initChart() {
  Chart.register(crosshairPlugin);

  const seriesColor = cssVar('--series-1');
  const gridColor = cssVar('--gridline');
  const axisColor = cssVar('--text-muted');
  const baselineColor = cssVar('--baseline');
  const surfaceColor = cssVar('--surface-card');
  const textPrimary = cssVar('--text-primary');
  const textSecondary = cssVar('--text-secondary');
  const borderColor = cssVar('--border');

  chart = new Chart(document.getElementById('weight-chart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: seriesColor,
        backgroundColor: hexToRgba(seriesColor, 0.10),
        fill: true,
        borderWidth: 2,
        tension: 0.2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: seriesColor,
        pointBorderColor: surfaceColor,
        pointBorderWidth: 2,
        pointHitRadius: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Chart.js animates the scale itself on an empty-to-populated transition
      // (0 categories -> N), which can leave point pixel positions transiently
      // desynced from chartArea — breaks hover/tooltip hit-testing. Not worth
      // chasing for a data set this small; disable animation entirely.
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: surfaceColor,
          titleColor: textSecondary,
          bodyColor: textPrimary,
          borderColor: borderColor,
          borderWidth: 1,
          displayColors: false,
          padding: 10,
          cornerRadius: 8,
          titleFont: { size: 11, weight: 'normal' },
          bodyFont: { size: 13, weight: 'bold' },
          callbacks: {
            label: (item) => `${item.formattedValue} kg`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: baselineColor },
          ticks: { color: axisColor, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 5 }
        },
        y: {
          grid: { color: gridColor },
          border: { display: false },
          ticks: { color: axisColor, font: { size: 10 } }
        }
      }
    }
  });
}

function applyRangeFilter() {
  let filtered = allEntries;
  if (activeRange !== 'all') {
    const days = Number(activeRange);
    const cutoff = startOfDay(new Date());
    cutoff.setDate(cutoff.getDate() - days);
    filtered = allEntries.filter((e) => parseISODateLocal(e.date) >= cutoff);
  }
  chart.data.labels = filtered.map((e) => formatChartLabel(e.date));
  chart.data.datasets[0].data = filtered.map((e) => e.weight);
  chart.update();
}

function initRangePills() {
  document.querySelectorAll('.range-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeRange = btn.dataset.range;
      applyRangeFilter();
    });
  });
}

// ================= Backend API =================

// Both wrap network-level failures (fetch rejecting outright — offline,
// DNS, connection reset) into the same { ok:false, error } shape the app
// already handles everywhere, instead of letting them throw uncaught and
// leave whichever button triggered the call stuck disabled forever.

async function apiGet(action) {
  try {
    const url = new URL(CONFIG.WEB_APP_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('token', authToken);
    const res = await fetch(url.toString());
    return await res.json();
  } catch (err) {
    return { ok: false, error: 'Network error — check your connection.' };
  }
}

async function apiPost(action, fields) {
  // Content-Type must stay text/plain: Apps Script has no doOptions handler,
  // so application/json would trigger a CORS preflight and fail outright.
  // Apps Script reads e.postData.contents regardless of the declared type.
  try {
    const res = await fetch(CONFIG.WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, token: authToken }, fields))
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: 'Network error — check your connection.' };
  }
}

// A server-reported auth failure (expired/invalid token, wrong email) means
// the session is really over — force logout rather than treating it like an
// ordinary failed request.
function handleAuthFailure() {
  logout();
  showLoginError('Your session ended, please sign in again.');
}

async function refreshData() {
  const statusEl = document.getElementById('refresh-status');
  const result = await apiGet('list');
  if (!result.ok) {
    if (result.code === 'auth') { handleAuthFailure(); return false; }
    if (statusEl) statusEl.textContent = "Couldn't refresh — try again.";
    return false;
  }
  if (statusEl) statusEl.textContent = '';
  allEntries = result.data;
  entryDates.clear();
  allEntries.forEach((e) => entryDates.add(e.date));
  renderHistoryTable();
  applyRangeFilter();
  if (!document.getElementById('calendar-panel').hidden) renderCalendarGrid();
  return true;
}

async function loadInitialData() {
  showScreen('app');
  const syncBar = document.getElementById('sync-bar');
  syncBar.hidden = false;
  await refreshData();
  syncBar.hidden = true;
}

function initRefreshButton() {
  const btn = document.getElementById('refresh-btn');
  const syncBar = document.getElementById('sync-bar');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    syncBar.hidden = false;
    await refreshData();
    syncBar.hidden = true;
    btn.disabled = false;
  });
}

// ================= History table =================

function renderHistoryTable() {
  const tbody = document.getElementById('entries-body');
  tbody.textContent = '';

  if (allEntries.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'No entries yet';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const sorted = allEntries.slice().sort((a, b) => b.date.localeCompare(a.date));
  sorted.forEach((entry) => {
    const tr = document.createElement('tr');

    const dateTd = document.createElement('td');
    dateTd.textContent = formatTableDate(entry.date);
    const weightTd = document.createElement('td');
    weightTd.textContent = entry.weight;

    const actionsTd = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn';
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', 'Edit');
    editBtn.addEventListener('click', () => startEdit(entry));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'icon-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.setAttribute('aria-label', 'Delete');
    deleteBtn.addEventListener('click', () => handleDelete(entry));

    actions.append(editBtn, deleteBtn);
    actionsTd.appendChild(actions);
    tr.append(dateTd, weightTd, actionsTd);
    tbody.appendChild(tr);
  });
}

function startEdit(entry) {
  selectedDate = parseISODateLocal(entry.date);
  renderDateTrigger();
  document.getElementById('weight-input').value = entry.weight;
  document.getElementById('weight-input').focus();
}

async function handleDelete(entry) {
  if (!confirm(`Delete the entry for ${formatTableDate(entry.date)}?`)) return;
  const result = await apiPost('delete', { date: entry.date });
  if (!result.ok) {
    if (result.code === 'auth') { handleAuthFailure(); return; }
    alert("Couldn't delete — try again.");
    return;
  }
  await refreshData();
}

// ================= Form =================

function initForm() {
  const form = document.getElementById('entry-form');
  const status = document.getElementById('form-status');
  const saveBtn = document.getElementById('save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const weight = parseFloat(document.getElementById('weight-input').value);
    if (!weight || weight <= 0) {
      status.dataset.tone = 'error';
      status.textContent = 'Enter a valid weight.';
      return;
    }

    saveBtn.disabled = true;
    status.dataset.tone = '';
    status.textContent = 'Saving…';

    const result = await apiPost('add', { date: toISODate(selectedDate), weight });

    saveBtn.disabled = false;
    if (!result.ok) {
      if (result.code === 'auth') { handleAuthFailure(); return; }
      status.dataset.tone = 'error';
      status.textContent = "Couldn't save — try again.";
      return;
    }

    status.dataset.tone = '';
    status.textContent = 'Saved.';
    await refreshData();

    // Reset to "ready for the next entry" — today's date, blank weight.
    selectedDate = startOfDay(new Date());
    renderDateTrigger();
    document.getElementById('weight-input').value = '';
  });
}

// ================= Auth (Google Identity Services) =================
//
// Token lives in memory only (lost on reload — see the design doc for why).
// Decoded claims are for display only (avatar/email) — the backend is the
// only thing that actually verifies the token; see requireAuth_ in Code.gs.

let authToken = null;
let tokenClaims = null;

function decodeJwtPayload(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  );
  return JSON.parse(json);
}

function showLoginError(message) {
  const el = document.getElementById('login-error');
  el.textContent = message;
  el.hidden = false;
}

function clearLoginError() {
  document.getElementById('login-error').hidden = true;
}

function handleCredentialResponse(response) {
  clearLoginError();
  authToken = response.credential;
  tokenClaims = decodeJwtPayload(authToken);
  renderAccountArea();
  loadInitialData(); // verifies the token server-side via the first list() call
}

function renderAccountArea() {
  const email = tokenClaims.email || '';
  const name = tokenClaims.name || email;
  document.getElementById('avatar').textContent = (name[0] || '?').toUpperCase();
  document.getElementById('account-email').textContent = email;
}

function attemptSilentSignIn() {
  showScreen('silent');
  clearLoginError();
  google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment()) {
      // No active Google session, One Tap cooldown, or previously dismissed —
      // all normal outcomes, not errors. Fall back to the manual button.
      showScreen('login');
    }
  });
}

function logout() {
  authToken = null;
  tokenClaims = null;
  allEntries = [];
  entryDates.clear();
  document.getElementById('avatar').textContent = '';
  document.getElementById('account-email').textContent = '';
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  showScreen('login');
}

function updateLoginOfflineBanner() {
  document.getElementById('login-offline-banner').hidden = navigator.onLine;
}

function initAuth() {
  document.getElementById('logout-btn').addEventListener('click', logout);
  window.addEventListener('online', updateLoginOfflineBanner);
  window.addEventListener('offline', updateLoginOfflineBanner);

  if (!(window.google && google.accounts && google.accounts.id)) {
    // GIS script didn't load (most likely offline at page load) — show the
    // login screen with its offline banner rather than throwing.
    updateLoginOfflineBanner();
    showScreen('login');
    return;
  }

  google.accounts.id.initialize({
    client_id: CONFIG.CLIENT_ID,
    auto_select: true,
    callback: handleCredentialResponse
  });
  google.accounts.id.renderButton(document.getElementById('gsi-button-container'), {
    theme: 'outline', size: 'large', shape: 'rectangular', text: 'signin_with', width: 260
  });

  updateLoginOfflineBanner();
  if (navigator.onLine) {
    attemptSilentSignIn();
  } else {
    showScreen('login');
  }
}

initCalendar();
initForm();
initRangePills();
initRefreshButton();
initAuth();
