// Base de datos local (IndexedDB) de la extensión.
const DB_NAME = 'liga-fitboxers';
const STORES = {
  captures: 'id',   // respuestas en bruto de la app, por si hay que reprocesar
  classes: 'id',
  events: 'key',    // eventos para el motor: `${type}:${id}`
  members: 'id',
  rewards: 'id',    // recompensas vigentes
  movements: 'seq', // historial auditable (autoincremental)
};

let dbPromise;
export function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, name === 'movements' ? { keyPath, autoIncrement: true } : { keyPath });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (tx) => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

export async function putAll(store, items) {
  if (!items.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  for (const it of items) tx.objectStore(store).put(it);
  await done(tx);
}

export async function deleteKeys(store, keys) {
  if (!keys.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  for (const k of keys) tx.objectStore(store).delete(k);
  await done(tx);
}

export async function getAll(store) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** Sustituye las recompensas vigentes y añade los movimientos al historial, en una sola transacción. */
export async function applyRewards(rewards, movements) {
  const db = await openDb();
  const tx = db.transaction(['rewards', 'movements'], 'readwrite');
  const rs = tx.objectStore('rewards');
  rs.clear();
  for (const r of rewards) rs.put(r);
  for (const m of movements) tx.objectStore('movements').add(m);
  await done(tx);
}

/** Copia de seguridad completa en JSON. */
export async function exportAll() {
  const out = { exportedAt: new Date().toISOString() };
  for (const s of Object.keys(STORES)) out[s] = await getAll(s);
  return out;
}

/** Vacía todos los datos guardados (capturas, clases, fitboxers, puntos, historial y referidos). La configuración no se toca. */
export async function clearAll() {
  const db = await openDb();
  const tx = db.transaction(Object.keys(STORES), 'readwrite');
  for (const s of Object.keys(STORES)) tx.objectStore(s).clear();
  await done(tx);
}

export async function importAll(dump) {
  const db = await openDb();
  const names = Object.keys(STORES).filter((s) => Array.isArray(dump[s]));
  const tx = db.transaction(names, 'readwrite');
  for (const s of names) {
    tx.objectStore(s).clear();
    for (const it of dump[s]) tx.objectStore(s).put(it);
  }
  await done(tx);
}
