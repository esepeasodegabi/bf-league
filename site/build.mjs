// Construye la web de la liga a partir de data/ y la deja en _site/.
// La ejecuta GitHub Actions en cada publicación; también funciona en local:
//   node site/build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const out = join(root, '_site');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const league = existsSync(join(dataDir, 'league.json'))
  ? readJson(join(dataDir, 'league.json'))
  : { name: 'Liga Fitboxers', timeZone: 'Europe/Madrid', standings: [], updatedAt: null };
const daysDir = join(dataDir, 'days');
const days = (existsSync(daysDir) ? readdirSync(daysDir) : [])
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
  .map((f) => readJson(join(daysDir, f)));

const longDate = (day) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
const stamp = (iso) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short', timeZone: league.timeZone || 'Europe/Madrid' }).format(new Date(iso));

function page(title, body, base = '') {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${base}style.css">
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

function standingsHtml() {
  if (!league.standings.length) return '<p class="empty">Todavía no hay puntos.</p>';
  return `<ol class="board">
${league.standings.map((r) => `  <li class="${r.pos <= 3 ? 'top' : ''}"><span class="pos">${r.pos}</span><span class="name">${esc(r.name)}</span><span class="pts">${r.points}</span></li>`).join('\n')}
</ol>`;
}

function dayHtml(d) {
  const classes = d.classes.map((c) => `<article class="class">
  <h3>${esc(c.time)}${c.trainer ? ` · con ${esc(c.trainer)}` : ''}</h3>
  <ul>
${c.attendees.map((a) => `    <li><span class="who"><span class="name">${esc(a.name)}</span>${a.rules.length ? `<span class="rules">${esc(a.rules.join(' · '))}</span>` : ''}</span><span class="pts">${a.points ? `+${a.points}` : '0'}</span></li>`).join('\n')}
  </ul>
</article>`).join('\n');
  const other = d.other && d.other.length ? `<article class="class">
  <h3>Bonus sociales</h3>
  <ul>
${d.other.map((o) => `    <li><span class="who"><span class="name">${esc(o.name)}</span><span class="rules">${esc(o.rule)}</span></span><span class="pts">+${o.points}</span></li>`).join('\n')}
  </ul>
</article>` : '';
  return classes + other || '<p class="empty">No hubo clases este día.</p>';
}

function header() {
  const period = [league.start, league.end].filter(Boolean).join(' → ');
  return `<h1>${esc(league.name)}</h1>
<p class="meta">${period ? esc(period) + ' · ' : ''}${league.updatedAt ? `Actualizado el ${esc(stamp(league.updatedAt))}` : ''}</p>`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'dias'), { recursive: true });
cpSync(join(root, 'site', 'style.css'), join(out, 'style.css'));

const latest = days[0];
const history = days.length ? `<h2>Días anteriores</h2>
<ul class="days">
${days.map((d) => `  <li><a href="dias/${d.day}.html">${esc(longDate(d.day))}</a> <span class="muted">${d.points} pts</span></li>`).join('\n')}
</ul>` : '';

writeFileSync(join(out, 'index.html'), page(league.name, `${header()}
<h2>Clasificación</h2>
${standingsHtml()}
${latest ? `<h2>Resultados del ${esc(longDate(latest.day))}</h2>\n${dayHtml(latest)}` : ''}
${history}`));

for (const d of days) {
  writeFileSync(join(out, 'dias', `${d.day}.html`), page(`${league.name} · ${d.day}`, `<p><a href="../index.html">← Clasificación</a></p>
<h1>${esc(longDate(d.day))}</h1>
${dayHtml(d)}`, '../'));
}

if (existsSync(dataDir)) cpSync(dataDir, join(out, 'data'), { recursive: true });
console.log(`Web generada: ${league.standings.length} fitboxers, ${days.length} días.`);
