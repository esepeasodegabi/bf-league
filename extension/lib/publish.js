// Prepara los archivos que se suben al repositorio al pulsar "Publicar".
// Solo salen nombre e inicial del apellido: ni ids, ni correos, ni apellidos.

import { standings } from '../engine/engine.js';
import { localDay } from '../engine/dates.js';

export function displayName(member) {
  if (!member) return 'Fitboxer';
  if (member.alias) return member.alias;
  const first = (member.firstName || '').trim().split(/\s+/)[0] || 'Fitboxer';
  const initial = (member.lastName || '').trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

function rank(rows) {
  let pos = 0;
  let prev = null;
  return rows.map((r, i) => {
    if (r.points !== prev) { pos = i + 1; prev = r.points; }
    return { pos, ...r };
  });
}

/**
 * @param {{ day: string, classes: object[], rewards: object[], members: object[], config: object, now?: string }} p
 * @returns {Record<string, string>} ruta en el repo → contenido
 */
export function buildPublication({ day, classes, rewards, members, config, now = new Date().toISOString() }) {
  const tz = config.league.timeZone;
  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id) => displayName(byId.get(id));

  const league = {
    name: config.league.name,
    start: config.league.start,
    end: config.league.end,
    timeZone: tz,
    updatedAt: now,
    standings: rank(standings(rewards, members.map((m) => m.id)).map((r) => ({ name: name(r.memberId), points: r.points }))),
  };

  const time = new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const rewardsByEvent = new Map();
  for (const r of rewards) {
    if (!rewardsByEvent.has(r.eventId)) rewardsByEvent.set(r.eventId, []);
    rewardsByEvent.get(r.eventId).push(r);
  }

  const dayClasses = classes
    .filter((c) => c.finished && Array.isArray(c.attendees) && localDay(c.start, tz) === day)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((c) => ({
      time: time.format(new Date(c.start)),
      trainer: c.trainer ? c.trainer.name.trim().split(/\s+/)[0] : null,
      attendees: c.attendees
        .map((memberId) => {
          const rs = rewardsByEvent.get(c.sessions?.[memberId] ?? `${c.id}:${memberId}`) || [];
          return { name: name(memberId), points: rs.reduce((s, r) => s + r.points, 0), rules: rs.map((r) => r.label) };
        })
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es')),
    }));

  const other = rewards
    .filter((r) => r.day === day && r.ruleId.startsWith('SOC-'))
    .map((r) => ({ name: name(r.memberId), points: r.points, rule: r.label }));

  const dayFile = {
    day,
    publishedAt: now,
    classes: dayClasses,
    other,
    points: rewards.filter((r) => r.day === day).reduce((s, r) => s + r.points, 0),
  };

  return {
    'data/league.json': JSON.stringify(league, null, 2) + '\n',
    [`data/days/${day}.json`]: JSON.stringify(dayFile, null, 2) + '\n',
  };
}
