// Se ejecuta dentro de la página de la app (mundo MAIN).
// 1. Copia las respuestas de la API de la app (api.brooklynfitboxing.com/v1)
//    que la propia app ya pide.
// 2. Al pulsar "Publicar" en la extensión, pide a la API las clases terminadas
//    del día y su detalle, con la misma sesión que ya tiene abierta la app.
// Nunca lee ni guarda contraseñas ni cookies.
(() => {
  const API = /^https:\/\/api\.brooklynfitboxing\.com\/v\d+\//;
  let apiBase = 'https://api.brooklynfitboxing.com/v1';
  // Cabeceras que usa la propia app en la API (incluida su autorización, si la
  // manda). Solo se guardan en la memoria de la pestaña para repetir sus mismas
  // peticiones; nunca salen de la página ni se envían a la extensión.
  let appHeaders = null;
  let clubId = null;
  const SKIP = /^(content-length|content-type|accept-encoding|host|origin|referer|cookie|connection)$/i;

  const post = (data) => window.postMessage({ source: 'liga-fitboxers', ...data }, location.origin);

  const learnClub = (url, response) => {
    try {
      const fromUrl = new URL(url).searchParams.get('clubId');
      if (fromUrl) clubId = fromUrl;
      const perms = response && Array.isArray(response.permissions) ? response.permissions : [];
      const p = perms.find((x) => x && x.clubId);
      if (!clubId && p) clubId = p.clubId;
    } catch { /* nada */ }
  };

  const send = (url, method, text) => {
    try {
      const response = JSON.parse(text);
      learnClub(url, response);
      post({ kind: 'capture', request: { method: method || 'GET', url }, response, capturedAt: new Date().toISOString() });
    } catch { /* respuesta que no es JSON: se ignora */ }
  };

  const learnHeaders = (headers) => {
    try {
      const learned = {};
      new Headers(headers || {}).forEach((v, k) => { if (!SKIP.test(k)) learned[k] = v; });
      if (Object.keys(learned).length) appHeaders = learned;
    } catch { /* sin cabeceras */ }
  };

  const absolute = (url) => new URL(url, location.href).href;
  const learnBase = (url) => { const m = url.match(API); if (m) apiBase = m[0].replace(/\/$/, ''); };

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = absolute(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
      if (API.test(url)) {
        learnBase(url);
        learnHeaders((init && init.headers) || (input instanceof Request ? input.headers : null));
        const method = (init && init.method) || (input instanceof Request ? input.method : 'GET');
        res.clone().text().then((t) => send(url, method, t));
      }
    } catch { /* nunca romper la app */ }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ligaMethod = method;
    this.__ligaUrl = url;
    this.__ligaHeaders = {};
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__ligaHeaders) this.__ligaHeaders[k] = v;
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      const url = absolute(this.__ligaUrl);
      if (API.test(url)) {
        learnBase(url);
        learnHeaders(this.__ligaHeaders);
        this.addEventListener('load', () => {
          if (this.responseType === '' || this.responseType === 'text') send(url, this.__ligaMethod, this.responseText);
          else if (this.responseType === 'json' && this.response) send(url, this.__ligaMethod, JSON.stringify(this.response));
        });
      }
    } catch { /* nunca romper la app */ }
    return origSend.apply(this, arguments);
  };

  // ---- Sincronización a petición de la extensión ----
  // Mismas peticiones que hace la app (HAR del 09/11/2026).
  async function get(path) {
    const url = `${apiBase}${path}`;
    const res = await origFetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { accept: 'application/json', 'x-client-type': 'myh4c', ...(appHeaders || {}) },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('La app no ha aceptado la petición. Recarga la pestaña de la app (F5), entra en "Sesiones finalizadas" y vuelve a pulsar Publicar.');
    }
    if (!res.ok) throw new Error(`La app respondió ${res.status}. ¿Sigues con la sesión iniciada?`);
    const response = await res.json();
    learnClub(url, response);
    return { request: { method: 'GET', url }, response };
  }

  async function ensureClub() {
    if (!clubId) await get('/auth/me?include=district');
    if (!clubId) throw new Error('No encuentro el club en la app. Entra en "Sesiones finalizadas" y vuelve a pulsar Publicar.');
    return clubId;
  }

  const nextDay = (day) => new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

  // Se pide del día indicado al siguiente y la extensión se queda con las clases
  // que empiezan ese día en la hora del club.
  async function sync(day) {
    const club = await ensureClub();
    const captures = [];
    const ids = [];
    for (let offset = 0; ; offset += 100) {
      const q = new URLSearchParams({ clubId: club, state: 'closed', dateFrom: day, dateTo: nextDay(day), limit: '100', offset: String(offset) });
      const list = await get(`/class-occurrences?${q}`);
      captures.push(list);
      const data = Array.isArray(list.response.data) ? list.response.data : [];
      ids.push(...data.map((c) => c.closedClassId || c.occurrenceId).filter(Boolean));
      if (data.length < 100 || offset + 100 >= (list.response.total ?? 0)) break;
    }
    return { captures, ids };
  }

  async function details(ids) {
    const captures = [];
    for (const id of ids) captures.push(await get(`/closed-classes/${encodeURIComponent(id)}`));
    return captures;
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'liga-fitboxers-cmd') return;
    const { id, cmd, day, ids } = e.data;
    if (cmd !== 'list' && cmd !== 'details') return;
    try {
      const result = cmd === 'list' ? await sync(day) : { captures: await details(ids || []) };
      post({ kind: 'result', id, ok: true, ...result });
    } catch (err) {
      post({ kind: 'result', id, ok: false, error: String(err && err.message || err) });
    }
  });
})();
