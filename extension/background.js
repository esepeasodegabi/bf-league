import { parseCapture, stripPersonalData, referralEvents } from './lib/adapter.js';
import { putAll, getAll, deleteKeys, applyRewards, exportAll, importAll, clearAll } from './lib/db.js';
import { computeRewards, reconcile, standings } from './engine/engine.js';
import { localDay, addDays } from './engine/dates.js';
import { getSettings } from './lib/settings.js';
import { buildPublication, displayName } from './lib/publish.js';
import { commitFiles } from './lib/github.js';

const APP_URL = 'https://myh4c.brooklynfitzone.com/*';
// La ficha de cada fitboxer (su historial) se vuelve a leer como mucho una vez cada 20 horas.
const PROFILE_REFRESH_MS = 20 * 3600 * 1000;

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Toda la escritura pasa por esta cola para que dos capturas seguidas no se pisen.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

/** Guarda clases sin perder el detalle (asistentes, hora real de fin) que ya tuviéramos. */
async function mergeClasses(incoming) {
  if (!incoming.length) return;
  const existing = new Map((await getAll('classes')).map((c) => [c.id, c]));
  await putAll('classes', incoming.map((c) => {
    const old = existing.get(c.id);
    if (!old) return c;
    if (c.detail) return { ...old, ...c };
    return { ...old, ...c, end: old.detail ? old.end : c.end };
  }));
}

/** Guarda socios sin perder lo que solo trae la ficha (recorrido, fecha de lectura). */
async function mergeMembers(incoming) {
  if (!incoming.length) return;
  const existing = new Map((await getAll('members')).map((m) => [m.id, m]));
  await putAll('members', incoming.map((m) => {
    const old = existing.get(m.id);
    if (!old) return m;
    // La ficha trae nombre y apellidos separados: tiene prioridad sobre el nombre de la clase.
    return m.profileSyncedAt ? { ...old, ...m } : { ...m, ...old, clientType: m.clientType ?? old.clientType };
  }));
}

/** Guarda eventos; un entrenamiento leído de la clase (hora real de fin) no se pisa con el de la ficha. */
async function mergeEvents(incoming) {
  if (!incoming.length) return;
  const existing = new Map((await getAll('events')).map((e) => [e.key, e]));
  await putAll('events', incoming.filter((e) => {
    const old = existing.get(e.key);
    return !(old && old.source === 'class' && e.source === 'profile');
  }));
}

async function storeCapture({ request, response, capturedAt }, settings) {
  const clean = stripPersonalData({ request, response });
  await putAll('captures', [{ id: await hash(JSON.stringify(clean)), capturedAt: capturedAt || new Date().toISOString(), ...clean }]);
  const parsed = parseCapture(clean.request, clean.response, settings.capture);
  await mergeClasses(parsed.classes);
  await mergeMembers(parsed.members);
  const events = [...parsed.trainings, ...parsed.referrals].map((e) => ({ ...e, key: `${e.type}:${e.id}` }));
  await mergeEvents(events);
  return events.length + parsed.members.length;
}

async function handleCapture(msg) {
  const settings = await getSettings();
  if (await storeCapture(msg, settings)) await recalculate(settings);
}

/** Recalcula todas las recompensas y guarda los cambios en el historial. */
async function recalculate(settings) {
  settings ??= await getSettings();
  let events = await getAll('events');
  // Las versiones 0.2.x guardaban los entrenamientos como "clase:socio"; ahora el id es el de la sesión.
  const legacy = events.filter((e) => e.type === 'training' && String(e.id).includes(':'));
  if (legacy.length) {
    await deleteKeys('events', legacy.map((e) => e.key));
    events = events.filter((e) => !legacy.includes(e));
  }
  const members = await getAll('members');
  const links = events.filter((e) => e.type === 'referral_link');
  const engineEvents = [...events.filter((e) => e.type === 'training'), ...referralEvents(links, members)];
  const computed = computeRewards(engineEvents, settings.config);
  const stored = await getAll('rewards');
  const movements = reconcile(stored, computed);
  await applyRewards(computed, movements);
  return { rewards: computed.length, movements: movements.length };
}

async function appTab() {
  const tabs = await chrome.tabs.query({ url: APP_URL });
  if (!tabs.length) throw new Error('Abre la app del club (myh4c.brooklynfitzone.com) en una pestaña e inicia sesión.');
  return tabs[0].id;
}

async function askPage(message) {
  const tabId = await appTab();
  let r;
  try {
    r = await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Pasa cuando la pestaña de la app se abrió antes de instalar o actualizar la extensión.
    throw new Error('Recarga la pestaña de la app del club (F5) y vuelve a pulsar Publicar.');
  }
  if (!r || !r.ok) throw new Error(r?.error || 'No se pudo leer la app. Recarga la pestaña de la app y vuelve a intentarlo.');
  return r.captures;
}

/** Lee de la app las clases terminadas del día, sus asistentes y el historial de cada asistente. */
async function syncDay(day) {
  const settings = await getSettings();
  const captures = await askPage({ type: 'sync-page', day });
  for (const c of captures) await storeCapture(c, settings);

  // Historial de los asistentes del día, para contar bien semanas, rachas y regresos.
  const tz = settings.config.league.timeZone;
  const classes = (await getAll('classes')).filter((c) => c.detail && localDay(c.start, tz) === day);
  const attendees = new Set(classes.flatMap((c) => c.attendees || []));
  const now = Date.now();
  const stale = (await getAll('members'))
    .filter((m) => attendees.has(m.id) && (!m.profileSyncedAt || now - Date.parse(m.profileSyncedAt) > PROFILE_REFRESH_MS))
    .map((m) => m.id);
  if (stale.length) {
    for (const c of await askPage({ type: 'profiles-page', ids: stale })) await storeCapture(c, settings);
  }

  await recalculate(settings);
  return { classes: Math.max(0, captures.length - 1), profiles: stale.length };
}

async function publishDay(day) {
  const settings = await getSettings();
  const gh = settings.github;
  // Primero se leen las clases y se calculan los puntos, aunque GitHub no esté configurado.
  const synced = await syncDay(day);
  if (!gh.token || !gh.owner || !gh.repo) return { ...synced, published: false };
  const [classes, rewards, members] = await Promise.all(['classes', 'rewards', 'members'].map(getAll));
  const files = buildPublication({ day, classes, rewards, members, config: settings.config });
  const result = await commitFiles(gh, files, `Resultados del ${day}`);
  return { ...synced, ...result, published: true, pagesUrl: `https://${gh.owner}.github.io/${gh.repo}/` };
}

/** Días de la liga hasta hoy (o los últimos 7 si la liga no tiene fecha de inicio). */
function leagueDays(config) {
  const tz = config.league.timeZone;
  const today = localDay(new Date(), tz);
  const end = config.league.end && config.league.end < today ? config.league.end : today;
  let day = config.league.start || addDays(today, -6);
  const days = [];
  while (day <= end && days.length < 120) { days.push(day); day = addDays(day, 1); }
  return days;
}

/** Vuelve a leer de la app todos los días de la liga y publica la clasificación y cada día. */
async function publishLeague() {
  const settings = await getSettings();
  const days = leagueDays(settings.config);
  let classes = 0;
  let profiles = 0;
  for (const day of days) {
    const r = await syncDay(day);
    classes += r.classes;
    profiles += r.profiles;
  }
  const gh = settings.github;
  if (!gh.token || !gh.owner || !gh.repo) return { classes, profiles, days: days.length, published: false };
  const [allClasses, rewards, members] = await Promise.all(['classes', 'rewards', 'members'].map(getAll));
  const files = {};
  for (const day of days) {
    const built = buildPublication({ day, classes: allClasses, rewards, members, config: settings.config });
    files['data/league.json'] = built['data/league.json'];
    // Los días sin clases (domingos, festivos, hoy antes de la primera clase) no se publican.
    if (JSON.parse(built[`data/days/${day}.json`]).classes.length) files[`data/days/${day}.json`] = built[`data/days/${day}.json`];
  }
  const result = await commitFiles(gh, files, `Resultados de la liga hasta el ${days[days.length - 1]}`);
  return { classes, profiles, days: days.length, ...result, published: true, pagesUrl: `https://${gh.owner}.github.io/${gh.repo}/` };
}

async function status() {
  const settings = await getSettings();
  const [classes, events, members, rewards] = await Promise.all(['classes', 'events', 'members', 'rewards'].map(getAll));
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const today = localDay(new Date(), settings.config.league.timeZone);
  const top = standings(rewards, members.map((m) => m.id)).slice(0, 10)
    .map((r) => ({ ...r, name: displayName(memberMap.get(r.memberId)) }));
  return {
    version: chrome.runtime.getManifest().version,
    today,
    classesSeen: classes.length,
    classes: classes.filter((c) => c.detail).length,
    trainings: events.filter((e) => e.type === 'training' && e.valid !== false).length,
    members: members.length,
    top,
  };
}

/** Datos para la pantalla de referidos de Opciones. */
async function referrals() {
  const [events, members] = await Promise.all([getAll('events'), getAll('members')]);
  const full = (m) => `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.id;
  const byId = new Map(members.map((m) => [m.id, m]));
  const date = (m, status) => (m.statuses || []).filter((s) => s.status === status).map((s) => s.time).sort()[0] || null;
  return {
    members: members.map((m) => ({ id: m.id, name: full(m), trial: date(m, 3), signup: date(m, 5) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    links: events.filter((e) => e.type === 'referral_link').map((l) => ({
      referredId: l.referredId, referred: byId.has(l.referredId) ? full(byId.get(l.referredId)) : l.referredId,
      referrerId: l.referrerId, referrer: byId.has(l.referrerId) ? full(byId.get(l.referrerId)) : l.referrerId,
      trial: byId.has(l.referredId) ? date(byId.get(l.referredId), 3) : null,
      signup: byId.has(l.referredId) ? date(byId.get(l.referredId), 5) : null,
    })),
  };
}

async function setReferral({ referredId, referrerId }) {
  if (!referredId || !referrerId || referredId === referrerId) throw new Error('Elige dos fitboxers distintos.');
  await putAll('events', [{ type: 'referral_link', id: referredId, key: `referral_link:${referredId}`, referredId, referrerId, at: new Date().toISOString() }]);
  return recalculate();
}

async function removeReferral({ referredId }) {
  await deleteKeys('events', [`referral_link:${referredId}`]);
  return recalculate();
}

const handlers = {
  capture: (msg) => serial(() => handleCapture(msg)),
  recalculate: () => serial(() => recalculate()),
  status: () => status(),
  sync: (msg) => serial(() => syncDay(msg.day)),
  publish: (msg) => serial(() => publishDay(msg.day)),
  publishLeague: () => serial(() => publishLeague()),
  referrals: () => referrals(),
  setReferral: (msg) => serial(() => setReferral(msg)),
  removeReferral: (msg) => serial(() => removeReferral(msg)),
  export: () => exportAll(),
  import: (msg) => serial(() => importAll(msg.dump).then(() => recalculate())),
  clear: () => serial(() => clearAll()),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Las capturas solo pueden venir del content script; el resto, de las páginas de la extensión.
  if (msg?.type !== 'capture' && sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  const h = handlers[msg?.type];
  if (!h) return false;
  h(msg).then((result) => sendResponse({ ok: true, result }), (err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});
