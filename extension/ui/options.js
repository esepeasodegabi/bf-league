import { getSettings, saveSettings } from '../lib/settings.js';

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
let settings;

// Reglas editables en la tabla: [ruta dentro de config.rules, campo umbral, texto umbral]
function ruleRows(rules) {
  return [
    ...rules.returns.map((r, i) => ({ rule: r, path: ['returns', i], threshold: r.months ? 'months' : 'days', unit: r.months ? 'meses' : 'días' })),
    ...rules.streaks.map((r, i) => ({ rule: r, path: ['streaks', i], threshold: 'weeks', unit: 'semanas' })),
    { rule: rules.double, path: ['double'] },
    { rule: rules.referralAttendance, path: ['referralAttendance'] },
    { rule: rules.referralSignup, path: ['referralSignup'] },
  ];
}

function render() {
  const c = settings.config;
  $('league-name').value = c.league.name;
  $('league-start').value = c.league.start || '';
  $('league-end').value = c.league.end || '';
  $('league-tz').value = c.league.timeZone;
  $('class-duration').value = settings.capture.classDurationMinutes;
  $('weekly-points').value = c.rules.weekly.points.join(', ');
  $('streak-min').value = c.rules.streakMinTrainingsPerWeek;
  for (const k of ['owner', 'repo', 'branch', 'token']) $(`gh-${k}`).value = settings.github[k] || '';

  const tbody = $('rules').querySelector('tbody');
  tbody.innerHTML = '';
  for (const row of ruleRows(c.rules)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="checkbox"></td><td></td><td></td><td><input type="number" class="pts"></td>`;
    tr.children[0].firstChild.checked = row.rule.enabled;
    tr.children[1].textContent = `${row.rule.id} · ${row.rule.label}`;
    if (row.threshold) {
      tr.children[2].innerHTML = `<input type="number" min="1" class="thr"> `;
      tr.children[2].firstChild.value = row.rule[row.threshold];
      tr.children[2].append(row.unit);
    }
    tr.querySelector('.pts').value = row.rule.points;
    tr.dataset.path = JSON.stringify(row.path);
    tr.dataset.threshold = row.threshold || '';
    tbody.append(tr);
  }
}

function read() {
  const c = settings.config;
  c.league.name = $('league-name').value.trim() || 'Liga Fitboxers';
  c.league.start = $('league-start').value || null;
  c.league.end = $('league-end').value || null;
  c.league.timeZone = $('league-tz').value.trim() || 'Europe/Madrid';
  settings.capture.classDurationMinutes = Number($('class-duration').value) || 45;
  c.rules.weekly.points = $('weekly-points').value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  c.rules.streakMinTrainingsPerWeek = Number($('streak-min').value) || 2;
  for (const k of ['owner', 'repo', 'branch', 'token']) settings.github[k] = $(`gh-${k}`).value.trim();

  for (const tr of $('rules').querySelectorAll('tbody tr')) {
    const path = JSON.parse(tr.dataset.path);
    const rule = path.reduce((o, k) => o[k], c.rules);
    rule.enabled = tr.children[0].firstChild.checked;
    rule.points = Number(tr.querySelector('.pts').value) || 0;
    if (tr.dataset.threshold) rule[tr.dataset.threshold] = Number(tr.querySelector('.thr').value) || 1;
  }
}

$('save').addEventListener('click', async () => {
  read();
  await saveSettings(settings);
  const r = await send({ type: 'recalculate' });
  $('msg').textContent = r.ok ? `Guardado. ${r.result.movements} cambios en el historial.` : `Error: ${r.error}`;
});

$('export').addEventListener('click', async () => {
  const r = await send({ type: 'export' });
  if (!r.ok) { $('msg').textContent = r.error; return; }
  const blob = new Blob([JSON.stringify(r.result, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `liga-fitboxers-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

$('import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !confirm('Esto sustituye todos los datos actuales por los de la copia. ¿Continuar?')) return;
  const r = await send({ type: 'import', dump: JSON.parse(await file.text()) });
  $('msg').textContent = r.ok ? 'Datos importados.' : `Error: ${r.error}`;
});

// ---- Referidos ----
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES') : '—');

async function renderReferrals() {
  const r = await send({ type: 'referrals' });
  if (!r.ok) { $('ref-msg').textContent = r.error; return; }
  const { members, links } = r.result;
  const linked = new Set(links.map((l) => l.referredId));
  // Primero los que han hecho iniciación, que son los candidatos a referido.
  const candidates = [...members].filter((m) => !linked.has(m.id))
    .sort((a, b) => (b.trial || '').localeCompare(a.trial || '') || a.name.localeCompare(b.name, 'es'));
  const fill = (select, list, label) => {
    select.innerHTML = '';
    for (const m of list) {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = label(m);
      select.append(o);
    }
  };
  fill($('ref-referred'), candidates, (m) => (m.trial ? `${m.name} · iniciación ${fmt(m.trial)}` : m.name));
  fill($('ref-referrer'), members, (m) => m.name);

  const tbody = $('ref-list').querySelector('tbody');
  tbody.innerHTML = '';
  for (const l of links) {
    const tr = document.createElement('tr');
    for (const text of [l.referred, l.referrer, fmt(l.trial), fmt(l.signup)]) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    const td = document.createElement('td');
    const b = document.createElement('button'); b.textContent = 'Quitar';
    b.addEventListener('click', async () => { await send({ type: 'removeReferral', referredId: l.referredId }); renderReferrals(); });
    td.append(b); tr.append(td);
    tbody.append(tr);
  }
}

$('ref-add').addEventListener('click', async () => {
  const r = await send({ type: 'setReferral', referredId: $('ref-referred').value, referrerId: $('ref-referrer').value });
  $('ref-msg').textContent = r.ok ? 'Apuntado. Los puntos se dan con las fechas de iniciación y alta de la app.' : `Error: ${r.error}`;
  renderReferrals();
});

settings = await getSettings();
render();
renderReferrals();
