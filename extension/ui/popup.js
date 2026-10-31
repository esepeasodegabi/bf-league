const send = (msg) => chrome.runtime.sendMessage(msg);
const $ = (id) => document.getElementById(id);
const localToday = () => new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local

async function refresh() {
  if (!$('day').value) $('day').value = localToday();
  let r;
  try { r = await send({ type: 'status' }); } catch (e) { $('msg').textContent = `Error: ${e.message}`; return; }
  if (!r) { $('msg').textContent = 'La extensión no responde. Ve a chrome://extensions y pulsa el botón de recargar de Liga Fitboxers.'; return; }
  if (!r.ok) { $('msg').textContent = r.error; return; }
  const s = r.result;
  if (!$('day').value) $('day').value = s.today || localToday();
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  $('stats').innerHTML = '';
  for (const [k, v] of [['Clases vistas', s.classesSeen ?? s.classes], ['Clases con asistentes', s.classes], ['Entrenamientos', s.trainings], ['Fitboxers', s.members]]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    $('stats').append(dt, dd);
  }
  $('top').innerHTML = '';
  for (const row of s.top) {
    const li = document.createElement('li');
    li.textContent = `${row.name} · ${row.points} pts`;
    $('top').append(li);
  }
}

async function run(message, waiting) {
  for (const b of document.querySelectorAll('button')) b.disabled = true;
  $('msg').textContent = waiting;
  let r;
  try { r = await send(message); } catch (e) { r = { ok: false, error: e.message }; }
  r ??= { ok: false, error: 'La extensión no responde. Recárgala en chrome://extensions.' };
  if (r.ok && !r.result.published) {
    $('msg').textContent = `${r.result.classes} clases leídas y puntos calculados. Para publicar la web, añade el token de GitHub en Opciones.`;
  } else if (r.ok) {
    const { classes, changed, pagesUrl } = r.result;
    $('msg').innerHTML = '';
    $('msg').append(changed
      ? `${classes} clases publicadas. La web se actualiza en un par de minutos: `
      : `${classes} clases leídas, sin cambios que publicar. `);
    const a = document.createElement('a');
    a.href = pagesUrl; a.target = '_blank'; a.textContent = 'ver web';
    $('msg').append(a);
  } else {
    $('msg').textContent = `Error: ${r.error}`;
  }
  for (const b of document.querySelectorAll('button')) b.disabled = false;
  refresh();
}

$('publish').addEventListener('click', () => {
  if ($('day').value) run({ type: 'publish', day: $('day').value }, 'Leyendo las clases del día y publicando…');
});
$('publish-league').addEventListener('click', () => {
  run({ type: 'publishLeague' }, 'Leyendo todos los días de la liga y publicando. Puede tardar unos minutos…');
});

refresh();
