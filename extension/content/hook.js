// Se ejecuta dentro de la página de la app (mundo MAIN).
// 1. Copia las respuestas GraphQL (/fs1) que la app ya pide.
// 2. Al pulsar "Publicar" en la extensión, pide a /fs1 las clases terminadas
//    del día y su detalle, con la misma sesión que ya tiene abierta la app.
// Nunca lee ni guarda contraseñas ni cookies.
(() => {
  const ENDPOINT = /\/fs1(\?|$)/;
  // Cabeceras que usa la propia app en /fs1 (incluida su autorización). Solo se
  // guardan en la memoria de la pestaña para repetir sus mismas consultas; nunca
  // salen de la página ni se envían a la extensión.
  let appHeaders = null;
  const SKIP = /^(content-length|content-type|accept|accept-encoding|host|origin|referer|cookie|connection)$/i;

  const post = (data) => window.postMessage({ source: 'liga-fitboxers', ...data }, location.origin);
  const send = (body, text) => {
    try {
      const request = typeof body === 'string' ? JSON.parse(body) : null;
      const response = JSON.parse(text);
      post({ kind: 'capture', request, response, capturedAt: new Date().toISOString() });
    } catch { /* respuesta que no es JSON: se ignora */ }
  };

  const learnHeaders = (headers) => {
    try {
      const learned = {};
      new Headers(headers || {}).forEach((v, k) => { if (!SKIP.test(k)) learned[k] = v; });
      if (Object.keys(learned).length) appHeaders = learned;
    } catch { /* sin cabeceras */ }
  };

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input.url;
      if (ENDPOINT.test(new URL(url, location.href).pathname)) {
        learnHeaders((init && init.headers) || (input instanceof Request ? input.headers : null));
        res.clone().text().then((t) => send(init && init.body, t));
      }
    } catch { /* nunca romper la app */ }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
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
      if (ENDPOINT.test(new URL(this.__ligaUrl, location.href).pathname)) {
        learnHeaders(this.__ligaHeaders);
        this.addEventListener('load', () => {
          if (this.responseType === '' || this.responseType === 'text') send(body, this.responseText);
        });
      }
    } catch { /* nunca romper la app */ }
    return origSend.apply(this, arguments);
  };

  // ---- Sincronización a petición de la extensión ----
  // Mismas consultas, letra por letra, que hace la app (HAR del 27/10/2026).
  const LIST_QUERY = "query ($from: String!, $to: String!) {\n  classes(from: $from, to: $to, finished: true) {\n    id\n    rsv_val\n    fb_val\n    tim\n    wrk\n    tra {\n      id\n      name\n      show_img\n      __typename\n    }\n    capacity\n    type\n    aggregatorsCount\n    __typename\n  }\n}\n";
  const PROFILE_QUERY = "query ($id: String!, $velneo: Boolean) {\n  fitboxer(profileId: $id) {\n    id\n    fitboxerId\n    aggregatorId\n    aggregatorName\n    name\n    firstName\n    lastName\n    eml\n    tfn\n    nick\n    clt_tip\n    show_img\n    salesForceId\n    birthdate\n    gender\n    dni\n    lastSessionDate\n    sessionsCount\n    lastNoShow\n    w_avg\n    syn\n    pow\n    engage\n    engageHistory\n    h4cHouse\n    h4cHouseIsDefault\n    isAnywhereActive\n    level\n    city\n    zipPostalCode\n    mainGoal\n    newEngagement\n    newEngageHistory\n    benefits {\n      id\n      code\n      name\n      metadata\n      dateAchieved\n      __typename\n    }\n    activeOffer {\n      id\n      date\n      productType\n      offerType\n      expireIn\n      __typename\n    }\n    club {\n      id\n      name\n      alias\n      pub_api_key\n      paymentMethod\n      country\n      currency\n      __typename\n    }\n    events(velneo: $velneo) {\n      id\n      status\n      time\n      club {\n        id\n        name\n        alias\n        __typename\n      }\n      payment {\n        id\n        name\n        imp\n        __typename\n      }\n      order {\n        id\n        description\n        amount\n        currency\n        __typename\n      }\n      when\n      trainer {\n        id\n        name\n        __typename\n      }\n      subscription {\n        id\n        name\n        offReason\n        offReasonText\n        __typename\n      }\n      metadata\n      source\n      __typename\n    }\n    bookings {\n      id\n      cla_cen\n      classGlobalTime\n      mod_tim\n      nextClassId\n      globalPass\n      club {\n        id\n        name\n        __typename\n      }\n      class {\n        id\n        type\n        __typename\n      }\n      guestIds\n      isGuest\n      ownerId\n      owner {\n        id\n        name\n        eml\n        __typename\n      }\n      __typename\n    }\n    classSubscriptions {\n      id\n      cla_cen\n      classGlobalTime\n      mod_tim\n      nextClassId\n      __typename\n    }\n    sessions {\n      id\n      tim\n      n_saco\n      wrk\n      syn\n      pow\n      total_karma\n      h4cHouse\n      h4cHouseIsDefault\n      donatedEnergy\n      challenge\n      trainer {\n        name\n        show_img\n        __typename\n      }\n      __typename\n    }\n    payments {\n      id\n      tip\n      name\n      tim\n      imp\n      dto\n      trn_nro\n      pay_sts\n      tim_sts\n      type\n      __typename\n    }\n    __typename\n  }\n}\n";
  const DETAIL_QUERY = "query ($id: String!) {\n  class(id: $id) {\n    id\n    tim\n    rsv_val\n    fb_val\n    aggregatorsCount\n    capacity\n    type\n    tim_att\n    tim_fin\n    challenge\n    tra {\n      id\n      name\n      show_img\n      __typename\n    }\n    workouts {\n      id\n      fitboxer {\n        id\n        fitboxerId\n        aggregatorId\n        aggregatorName\n        name\n        show_img\n        eml\n        clt_tip\n        district {\n          id\n          alias\n          __typename\n        }\n        __typename\n      }\n      wrk\n      syn\n      pow\n      n_saco\n      total_karma\n      h4cHouse\n      h4cHouseIsDefault\n      donatedEnergy\n      type\n      __typename\n    }\n    no_show {\n      id\n      fitboxerId\n      aggregatorId\n      name\n      show_img\n      eml\n      clt_tip\n      __typename\n    }\n    activity {\n      id\n      type\n      user\n      when\n      data\n      system\n      __typename\n    }\n    __typename\n  }\n}\n";

  async function gql(query, variables) {
    if (!appHeaders) throw new Error('Todavía no he visto a la app pedir datos. Entra en "Sesiones finalizadas" en la app y vuelve a pulsar Publicar.');
    const request = { operationName: null, variables, query };
    const res = await origFetch('/fs1', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: '*/*', ...appHeaders },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`La app respondió ${res.status}. ¿Sigues con la sesión iniciada?`);
    const response = await res.json();
    if (response.errors && !response.data?.classes && !response.data?.class && !response.data?.fitboxer) {
      const m = response.errors[0]?.message || 'desconocido';
      throw new Error(/auth/i.test(m)
        ? 'La app no ha aceptado la consulta. Recarga la pestaña de la app (F5), entra en "Sesiones finalizadas" y vuelve a pulsar Publicar.'
        : `La app devolvió un error: ${m}`);
    }
    return { request, response };
  }

  const appDate = (day) => day.split('-').map(Number).join('/'); // 2026-11-01 → 2026/11/1

  async function sync(day) {
    const list = await gql(LIST_QUERY, { from: appDate(day), to: appDate(day) });
    const captures = [list];
    for (const c of list.response.data?.classes || []) {
      captures.push(await gql(DETAIL_QUERY, { id: c.id }));
    }
    return captures;
  }

  async function profiles(ids) {
    const captures = [];
    for (const id of ids) captures.push(await gql(PROFILE_QUERY, { id, velneo: false }));
    return captures;
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'liga-fitboxers-cmd') return;
    const { id, cmd, day, ids } = e.data;
    if (cmd !== 'sync' && cmd !== 'profiles') return;
    try {
      const captures = cmd === 'sync' ? await sync(day) : await profiles(ids || []);
      post({ kind: 'result', id, ok: true, captures });
    } catch (err) {
      post({ kind: 'result', id, ok: false, error: String(err && err.message || err) });
    }
  });
})();
