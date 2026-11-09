import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPublication, displayName } from './publish.js';
import { computeRewards } from '../engine/engine.js';
import { DEFAULT_CONFIG } from '../engine/config.default.js';

test('nombre público: nombre e inicial del apellido', () => {
  assert.equal(displayName({ firstName: 'María', lastName: 'García López' }), 'María G.');
  assert.equal(displayName({ firstName: 'Luis', lastName: '' }), 'Luis');
  assert.equal(displayName({ alias: 'La Bestia', firstName: 'Ana' }), 'La Bestia');
});

test('publica la clasificación y los resultados del día sin datos personales', () => {
  const members = [
    { id: 'f1', firstName: 'Ana', lastName: 'García López' },
    { id: 'f2', firstName: 'Luis', lastName: 'Pérez' },
  ];
  const classes = [
    { id: 'c0', start: '2026-10-26T08:30:00.000Z', finished: true, attendees: ['f1'], trainer: { name: 'Aida X' } },
    { id: 'c1', start: '2026-10-27T08:30:00.000Z', finished: true, attendees: ['f1', 'f2'], trainer: { name: 'Rebeca Y' } },
    { id: 'c2', start: '2026-10-27T17:00:00.000Z', finished: true, attendees: ['f1'], trainer: { name: 'Rebeca Y' } },
  ];
  const events = classes.flatMap((c) => c.attendees.map((m) => ({ type: 'training', id: `${c.id}:${m}`, memberId: m, endedAt: new Date(Date.parse(c.start) + 45 * 60000).toISOString() })));
  const rewards = computeRewards(events, DEFAULT_CONFIG);
  const files = buildPublication({ day: '2026-10-27', classes, rewards, members, config: DEFAULT_CONFIG, now: '2026-10-27T20:00:00Z' });

  assert.deepEqual(Object.keys(files), ['data/league.json', 'data/days/2026-10-27.json']);
  const league = JSON.parse(files['data/league.json']);
  // Ana: 2.º semanal (+5) y 3.º semanal (+6) con doblete (+2) = 13
  assert.deepEqual(league.standings.map(({ pos, name, points }) => ({ pos, name, points })), [{ pos: 1, name: 'Ana G.', points: 13 }, { pos: 2, name: 'Luis P.', points: 0 }]);
  // Desglose: en qué día, clase y regla consiguió cada punto.
  assert.deepEqual(league.standings[0].detail, [
    { day: '2026-10-27', time: '09:30', rule: 'Rutina semanal (2.º)', points: 5 },
    { day: '2026-10-27', time: '18:00', rule: 'Doblete diario', points: 2 },
    { day: '2026-10-27', time: '18:00', rule: 'Rutina semanal (3.º)', points: 6 },
  ]);
  assert.deepEqual(league.standings[1].detail, []);

  const day = JSON.parse(files['data/days/2026-10-27.json']);
  assert.deepEqual(day.classes.map((c) => [c.time, c.trainer, c.attendees.map((a) => `${a.name}:${a.points}`)]), [
    ['09:30', 'Rebeca', ['Ana G.:5', 'Luis P.:0']],
    ['18:00', 'Rebeca', ['Ana G.:8']],
  ]);
  assert.equal(day.points, 13);

  const all = Object.values(files).join('');
  for (const secret of ['f1', 'f2', 'García', 'Pérez', 'López']) assert.ok(!all.includes(secret), secret);
});
