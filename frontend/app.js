// Phase 3: static shell only. No auth, no backend calls yet.

function chartColors() {
  var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark
    ? { series: '#3987e5', grid: '#2c2c2a', axis: '#898781', surface: '#1a1a19' }
    : { series: '#2a78d6', grid: '#e1e0d9', axis: '#898781', surface: '#fcfcfb' };
}

function initChart() {
  var colors = chartColors();
  var ctx = document.getElementById('weight-chart');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: colors.series,
        backgroundColor: colors.series,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: colors.series,
        pointBorderColor: colors.surface,
        pointBorderWidth: 2,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: colors.grid }, ticks: { color: colors.axis } },
        y: { grid: { color: colors.grid }, ticks: { color: colors.axis } }
      }
    }
  });
}

function setDefaultDate() {
  var input = document.getElementById('date-input');
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  input.value = yyyy + '-' + mm + '-' + dd;
}

function initForm() {
  var form = document.getElementById('entry-form');
  var status = document.getElementById('form-status');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.dataset.tone = '';
    status.textContent = 'Shell only — saving isn\'t wired up yet (Phase 5).';
  });
}

setDefaultDate();
initForm();
initChart();
