// Motor de reglas de la liga.
//
// Es una función pura: recibe TODOS los eventos conocidos y la configuración y
// devuelve TODAS las recompensas. Cada recompensa tiene un id determinista
// (regla + socio + clave), así que recalcular nunca duplica puntos. Las
// correcciones (un entrenamiento anulado, una asistencia que cambia) se aplican
// recalculando y comparando con lo guardado mediante `reconcile`.
//
// Eventos admitidos:
//   { type: 'training', id, memberId, endedAt, valid? }          valid=false lo anula
//   { type: 'referral_attendance', id, referrerId, referredId, at }
//   { type: 'referral_signup', id, referrerId, referredId, at }

import { localDay, addDays, addMonths, diffDays, weekStart } from './dates.js';

function inLeague(day, league) {
  if (league.start && day < league.start) return false;
  if (league.end && day > league.end) return false;
  return true;
}

function byTime(key) {
  return (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function computeRewards(events, config) {
  const { league, rules } = config;
  const tz = league.timeZone;
  const rewards = [];

  const add = (ruleId, label, memberId, key, points, event, instant) => {
    const day = localDay(instant, tz);
    if (!points || !inLeague(day, league)) return;
    rewards.push({
      id: `${ruleId}:${memberId}:${key}`,
      ruleId, label, memberId, points,
      eventId: event.id, at: new Date(instant).toISOString(), day,
    });
  };

  // ---- Entrenamientos ----
  const trainings = dedupe(events.filter((e) => e.type === 'training'))
    .filter((e) => e.valid !== false && e.endedAt && e.memberId)
    .sort(byTime('endedAt'));

  const perMember = groupBy(trainings, (t) => t.memberId);
  const firstLeagueWeek = league.start ? weekStart(league.start) : null;

  for (const [memberId, list] of perMember) {
    const weekCount = new Map();
    const dayCount = new Map();
    let prevDay = null;
    // Racha: semanas que ya cumplen el mínimo, y longitud de la racha actual.
    let lastQualifiedWeek = null;
    let run = 0;

    for (const t of list) {
      const day = localDay(t.endedAt, tz);
      const week = weekStart(day);

      // Regresos (solo en el primer entrenamiento tras el parón).
      if (prevDay && prevDay !== day) {
        for (const r of rules.returns) {
          if (!r.enabled) continue;
          const ok = r.months
            ? diffDays(addMonths(prevDay, r.months), day) >= 1
            : diffDays(prevDay, day) - 1 >= r.days;
          if (ok) add(r.id, r.label, memberId, day, r.points, t, t.endedAt);
        }
      }
      prevDay = day;

      // Rutina semanal.
      const n = (weekCount.get(week) || 0) + 1;
      weekCount.set(week, n);
      if (rules.weekly.enabled && n <= rules.weekly.points.length) {
        add(`${rules.weekly.id}-${n}`, `${rules.weekly.label} (${n}.º)`, memberId, week, rules.weekly.points[n - 1], t, t.endedAt);
      }

      // Doblete diario.
      const d = (dayCount.get(day) || 0) + 1;
      dayCount.set(day, d);
      if (rules.double.enabled && d === 2) {
        add(rules.double.id, rules.double.label, memberId, day, rules.double.points, t, t.endedAt);
      }

      // Rachas: la semana cuenta al alcanzar el mínimo de entrenamientos.
      const countsForStreak = !firstLeagueWeek || week >= firstLeagueWeek;
      if (countsForStreak && n === rules.streakMinTrainingsPerWeek) {
        run = lastQualifiedWeek && addDays(lastQualifiedWeek, 7) === week ? run + 1 : 1;
        lastQualifiedWeek = week;
        for (const s of rules.streaks) {
          if (s.enabled && run % s.weeks === 0) add(s.id, s.label, memberId, week, s.points, t, t.endedAt);
        }
      }
    }
  }

  // ---- Referidos ----
  const refEvents = dedupe(events.filter((e) => e.type === 'referral_attendance' || e.type === 'referral_signup'))
    .filter((e) => e.valid !== false && e.referrerId && e.referredId && e.at)
    .sort(byTime('at'));
  const attended = new Map(); // referredId -> evento de asistencia
  const signedUp = new Set();
  for (const e of refEvents) {
    if (e.type === 'referral_attendance') {
      if (attended.has(e.referredId)) continue; // una sola recompensa por persona
      attended.set(e.referredId, e);
      const r = rules.referralAttendance;
      if (r.enabled) add(r.id, r.label, e.referrerId, e.referredId, r.points, e, e.at);
    } else {
      if (!attended.has(e.referredId) || signedUp.has(e.referredId)) continue;
      signedUp.add(e.referredId);
      const r = rules.referralSignup;
      if (r.enabled) add(r.id, r.label, e.referrerId, e.referredId, r.points, e, e.at);
    }
  }

  return rewards.sort(byTime('at'));
}

/**
 * Compara las recompensas guardadas con las recalculadas y devuelve los
 * movimientos del historial: altas nuevas, anulaciones y ajustes.
 */
export function reconcile(stored, computed, now = new Date().toISOString()) {
  const oldById = new Map(stored.map((r) => [r.id, r]));
  const newById = new Map(computed.map((r) => [r.id, r]));
  const movements = [];
  for (const r of computed) {
    const prev = oldById.get(r.id);
    if (!prev) movements.push({ kind: 'grant', rewardId: r.id, memberId: r.memberId, ruleId: r.ruleId, points: r.points, eventId: r.eventId, at: now });
    else if (prev.points !== r.points) movements.push({ kind: 'adjust', rewardId: r.id, memberId: r.memberId, ruleId: r.ruleId, points: r.points - prev.points, eventId: r.eventId, at: now });
  }
  for (const r of stored) {
    if (!newById.has(r.id)) movements.push({ kind: 'revoke', rewardId: r.id, memberId: r.memberId, ruleId: r.ruleId, points: -r.points, eventId: r.eventId, at: now });
  }
  return movements;
}

/** Clasificación: puntos totales por socio, de mayor a menor. */
export function standings(rewards, memberIds = []) {
  const totals = new Map(memberIds.map((m) => [m, 0]));
  for (const r of rewards) totals.set(r.memberId, (totals.get(r.memberId) || 0) + r.points);
  return [...totals].map(([memberId, points]) => ({ memberId, points }))
    .sort((a, b) => b.points - a.points || (a.memberId < b.memberId ? -1 : 1));
}

// Si llega dos veces el mismo evento (mismo tipo e id), gana la última versión.
function dedupe(list) {
  const m = new Map();
  for (const e of list) m.set(`${e.type}:${e.id}`, e);
  return [...m.values()];
}

function groupBy(list, fn) {
  const m = new Map();
  for (const x of list) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
