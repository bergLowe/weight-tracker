// Phase 3: visual shell for every screen in the online/offline flow.
// No auth, no backend calls yet — screens are switched manually for now.
// QA helpers exposed on window: showScreen('login'|'silent'|'app'), setOffline(bool).

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
const entryDates = new Set(); // Phase 5: populated from fetched entries, drives the dot marker

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
let allEntries = []; // Phase 5: populated from the API
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
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    filtered = allEntries.filter((e) => new Date(e.date) >= cutoff);
  }
  chart.data.labels = filtered.map((e) => e.date);
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

// ================= Form (still no backend — Phase 5) =================

function initForm() {
  const form = document.getElementById('entry-form');
  const status = document.getElementById('form-status');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.dataset.tone = '';
    status.textContent = "Shell only — saving isn't wired up yet (Phase 5).";
  });
}

// ================= Auth (Google Identity Services) =================
//
// Token lives in memory only (lost on reload — see the design doc for why).
// Verifying the token against the backend, and everything that depends on
// real data, is Phase 5. This phase only proves sign-in works end-to-end.

let authToken = null;
let tokenClaims = null; // decoded client-side for display only — NOT a security check

function decodeJwtPayload(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  );
  return JSON.parse(json);
}

function handleCredentialResponse(response) {
  authToken = response.credential;
  tokenClaims = decodeJwtPayload(authToken);

  // Phase 4 scope is proving sign-in works — log temporarily, remove once
  // Phase 5 sends this to the backend instead.
  console.log('ID token (temporary, remove before Phase 5 ships):', authToken);
  console.log('Decoded claims (client-side only, not verified):', tokenClaims);

  renderAccountArea();
  // Phase 5: verify this token against the backend (and load real data)
  // before trusting it — for now we optimistically show the app shell.
  showScreen('app');
}

function renderAccountArea() {
  const email = tokenClaims.email || '';
  const name = tokenClaims.name || email;
  document.getElementById('avatar').textContent = (name[0] || '?').toUpperCase();
  document.getElementById('account-email').textContent = email;
}

function attemptSilentSignIn() {
  showScreen('silent');
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
initAuth();
