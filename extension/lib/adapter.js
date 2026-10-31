// Traduce las respuestas GraphQL de la app de la franquicia a datos de la liga.
//
// Consultas conocidas (HAR del 27/10/2026), ambas por POST a /fs1:
// - classes(from, to, finished): listado de clases con hora, tipo y entrenador.
// - class(id): detalle de una clase. `workouts` son los fitboxers que han
//   entrenado (cada uno con su sesión) y `no_show` los que reservaron y no
//   vinieron. `tim_fin` es la hora real de fin de la clase.
// - fitboxer(profileId): ficha del fitboxer (HAR del 31/10/2026). `sessions`
//   es su historial completo de entrenamientos; el id de cada sesión es el
//   mismo que el de `workouts` en el detalle de clase, así que no se duplica.
//   `events` trae su recorrido: 1 pedido, 2 reserva de iniciación, 3 asiste a
//   la iniciación, 5 alta como socio.
//
// El id de cada entrenamiento es el id de la sesión de la app.

/** Separa "Nombre Apellido1 Apellido2" en nombre y apellidos. */
export function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

function trainerOf(c) {
  return c.tra ? { id: c.tra.id, name: c.tra.name } : null;
}

/**
 * @returns {{ classes: object[], trainings: object[], members: object[], referrals: object[] }}
 */
export function parseCapture(request, response, { classDurationMinutes = 45 } = {}) {
  const out = { classes: [], trainings: [], members: [], referrals: [] };
  const data = response && response.data;
  if (!data) return out;

  if (Array.isArray(data.classes)) {
    for (const c of data.classes) {
      if (!c || !c.id || !c.tim) continue;
      const start = new Date(c.tim);
      out.classes.push({
        id: c.id,
        start: start.toISOString(),
        end: new Date(start.getTime() + classDurationMinutes * 60000).toISOString(),
        type: c.type ?? null,
        capacity: c.capacity ?? null,
        reservations: c.rsv_val ?? null,
        trainer: trainerOf(c),
      });
    }
  }

  const c = data.class;
  if (c && c.id && c.tim) {
    const finished = Boolean(c.tim_fin);
    const start = new Date(c.tim).toISOString();
    const end = finished ? new Date(c.tim_fin).toISOString() : new Date(Date.parse(c.tim) + classDurationMinutes * 60000).toISOString();
    const attendees = [];
    const sessions = {};
    for (const w of c.workouts || []) {
      const f = w && w.fitboxer;
      const memberId = f && (f.fitboxerId || f.id);
      if (!memberId || !w.id) continue;
      attendees.push(memberId);
      sessions[memberId] = w.id;
      out.members.push({ id: memberId, ...splitName(f.name), clientType: f.clt_tip ?? null });
      // Solo las clases terminadas cuentan como entrenamiento completado.
      if (finished) {
        out.trainings.push({ type: 'training', id: w.id, memberId, classId: c.id, endedAt: end, valid: true, source: 'class' });
      }
    }
    out.classes.push({
      id: c.id, start, end, type: c.type ?? null, capacity: c.capacity ?? null,
      reservations: c.rsv_val ?? null, trainer: trainerOf(c),
      finished, attendees, sessions, noShows: (c.no_show || []).map((n) => n.fitboxerId || n.id).filter(Boolean),
      detail: true,
    });
  }

  const f = data.fitboxer;
  if (f && (f.fitboxerId || f.id)) {
    const memberId = f.fitboxerId || f.id;
    const fromName = splitName(f.name);
    out.members.push({
      id: memberId,
      firstName: (f.firstName || '').trim() || fromName.firstName,
      lastName: (f.lastName || '').trim() || fromName.lastName,
      clientType: f.clt_tip ?? null,
      // Recorrido del fitboxer: sirve para los referidos (3 = iniciación, 5 = alta).
      statuses: (f.events || []).filter((e) => e && e.status != null && e.time)
        .map((e) => ({ status: Number(e.status), time: new Date(e.time).toISOString(), when: e.metadata?.when ?? null })),
      profileSyncedAt: new Date().toISOString(),
    });
    for (const s of f.sessions || []) {
      if (!s || !s.id || !s.tim) continue;
      out.trainings.push({
        type: 'training', id: s.id, memberId,
        endedAt: new Date(Date.parse(s.tim) + classDurationMinutes * 60000).toISOString(),
        valid: true, source: 'profile',
      });
    }
  }

  // Quién recomendó a quién no aparece en la app: se apunta a mano en Opciones.
  return out;
}

// Datos personales que la liga no necesita y nunca se guardan.
const PERSONAL = new Set(['eml', 'email', 'tfn', 'phone', 'dni', 'birthdate', 'zipPostalCode', 'city', 'salesForceId', 'payments', 'payment', 'order', 'owner', 'activeOffer', 'pub_api_key', 'gender']);

/** Quita datos personales que la liga no necesita antes de guardar nada. */
export function stripPersonalData(value) {
  if (Array.isArray(value)) return value.map(stripPersonalData);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!PERSONAL.has(k)) out[k] = stripPersonalData(v);
    return out;
  }
  return value;
}

/**
 * Convierte los referidos apuntados a mano en eventos para el motor, usando
 * las fechas reales de la app: asistencia a la iniciación (3) y alta (5).
 */
export function referralEvents(links, members) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const out = [];
  for (const l of links) {
    const m = byId.get(l.referredId);
    if (!m || !l.referrerId) continue;
    const first = (status) => (m.statuses || []).filter((s) => s.status === status).map((s) => s.time).sort()[0];
    const attended = first(3);
    const signedUp = first(5);
    if (attended) out.push({ type: 'referral_attendance', id: `att:${l.referredId}`, referrerId: l.referrerId, referredId: l.referredId, at: attended });
    if (signedUp) out.push({ type: 'referral_signup', id: `alta:${l.referredId}`, referrerId: l.referrerId, referredId: l.referredId, at: signedUp });
  }
  return out;
}
