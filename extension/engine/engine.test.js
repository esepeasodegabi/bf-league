import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRewards, reconcile, standings } from './engine.js';
import { DEFAULT_CONFIG } from './config.default.js';
import { weekStart, localDay } from './dates.js';

const cfg = structuredClone(DEFAULT_CONFIG);
let seq = 0;
const tr = (memberId, endedAt, extra = {}) => ({ type: 'training', id: `t${++seq}`, memberId, endedAt, ...extra });
const total = (rewards, m = 'ana') => rewards.filter((r) => r.memberId === m).reduce((s, r) => s + r.points, 0);

test('la semana empieza en lunes', () => {
  assert.equal(weekStart('2026-11-01'), '2026-10-26'); // domingo → lunes anterior
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
});

test('zona horaria: domingo 23:30 UTC ya es lunes en Madrid', () => {
  assert.equal(localDay('2026-11-01T23:30:00Z', 'Europe/Madrid'), '2026-11-02');
});

test('Ejemplo A: cinco entrenamientos con un doblete = 28', () => {
  const ev = [
    tr('ana', '2026-11-02T08:00:00Z'),
    tr('ana', '2026-11-03T08:00:00Z'),
    tr('ana', '2026-11-03T18:00:00Z'), // doblete
    tr('ana', '2026-11-04T08:00:00Z'),
    tr('ana', '2026-11-05T08:00:00Z'),
  ];
  assert.equal(total(computeRewards(ev, cfg)), 28);
});

test('Ejemplo B: cuatro semanas con dos entrenamientos = 54', () => {
  const ev = [];
  for (const mon of ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']) {
    ev.push(tr('ana', `${mon}T10:00:00Z`));
    const [y, m, d] = mon.split('-');
    ev.push(tr('ana', `${y}-${m}-${String(+d + 2).padStart(2, '0')}T10:00:00Z`));
  }
  const r = computeRewards(ev, cfg);
  assert.equal(total(r), 54);
  assert.equal(r.filter((x) => x.ruleId === 'REG-003').length, 2);
  assert.equal(r.filter((x) => x.ruleId === 'REG-004').length, 1);
});

test('Ejemplo C: referido que asiste y se da de alta = 56', () => {
  const ev = [
    { type: 'referral_attendance', id: 'a1', referrerId: 'ana', referredId: 'luis', at: '2026-11-02T10:00:00Z' },
    { type: 'referral_signup', id: 's1', referrerId: 'ana', referredId: 'luis', at: '2026-11-05T10:00:00Z' },
  ];
  assert.equal(total(computeRewards(ev, cfg)), 56);
});

test('referidos: sin asistencia no hay alta premiada, y una persona solo premia una vez', () => {
  const ev = [
    { type: 'referral_signup', id: 's0', referrerId: 'ana', referredId: 'eva', at: '2026-11-01T10:00:00Z' },
    { type: 'referral_attendance', id: 'a1', referrerId: 'ana', referredId: 'luis', at: '2026-11-02T10:00:00Z' },
    { type: 'referral_attendance', id: 'a2', referrerId: 'ana', referredId: 'luis', at: '2026-11-03T10:00:00Z' },
  ];
  assert.equal(total(computeRewards(ev, cfg)), 16);
});

test('racha rota: semana sin el mínimo reinicia la cuenta', () => {
  const ev = [
    tr('ana', '2026-11-02T10:00:00Z'), tr('ana', '2026-11-04T10:00:00Z'),
    tr('ana', '2026-11-10T10:00:00Z'), // solo uno esa semana
    tr('ana', '2026-11-16T10:00:00Z'), tr('ana', '2026-11-18T10:00:00Z'),
  ];
  assert.equal(computeRewards(ev, cfg).filter((x) => x.ruleId.startsWith('REG-00')).length, 0);
});

test('regreso tras 14 días: +14; tras 13 días: nada', () => {
  // 14 días completos sin entrenar: del 3 al 16 → vuelve el 17.
  const r1 = computeRewards([tr('ana', '2026-11-02T10:00:00Z'), tr('ana', '2026-11-17T10:00:00Z')], cfg);
  assert.deepEqual(r1.filter((x) => x.ruleId.startsWith('REG')).map((x) => x.ruleId), ['REG-001']);
  const r2 = computeRewards([tr('ana', '2026-11-02T10:00:00Z'), tr('ana', '2026-11-16T10:00:00Z')], cfg);
  assert.equal(r2.filter((x) => x.ruleId.startsWith('REG')).length, 0);
});

test('regreso tras un mes: acumula +14 y +20', () => {
  // Un mes completo sin entrenar: del 3 oct al 2 nov → vuelve el 3 nov.
  const r = computeRewards([tr('ana', '2026-10-02T10:00:00Z'), tr('ana', '2026-11-03T10:00:00Z')], cfg);
  assert.deepEqual(r.filter((x) => x.ruleId.startsWith('REG')).map((x) => x.ruleId).sort(), ['REG-001', 'REG-002']);
});

test('del 8.º entrenamiento semanal en adelante no da puntos', () => {
  const ev = [];
  for (let d = 2; d <= 8; d++) ev.push(tr('ana', `2026-11-0${d}T08:00:00Z`));
  ev.push(tr('ana', '2026-11-08T09:00:00Z')); // 8.º (y doblete)
  const r = computeRewards(ev, cfg).filter((x) => x.ruleId.startsWith('RUT-') && x.ruleId !== 'RUT-007');
  assert.equal(r.reduce((s, x) => s + x.points, 0), 5 + 6 + 7 + 8 + 9 + 10);
});

test('doblete: el tercer entrenamiento del día no suma otro doblete', () => {
  const ev = [tr('ana', '2026-11-02T08:00:00Z'), tr('ana', '2026-11-02T12:00:00Z'), tr('ana', '2026-11-02T18:00:00Z')];
  assert.equal(computeRewards(ev, cfg).filter((x) => x.ruleId === 'RUT-007').length, 1);
});

test('idempotencia: el mismo evento dos veces no duplica puntos', () => {
  const t = tr('ana', '2026-11-02T08:00:00Z');
  const t2 = tr('ana', '2026-11-03T08:00:00Z');
  assert.equal(total(computeRewards([t, t2, t2, t], cfg)), 5);
});

test('corrección: anular un entrenamiento revoca sus recompensas', () => {
  const a = tr('ana', '2026-11-02T08:00:00Z');
  const b = tr('ana', '2026-11-03T08:00:00Z');
  const before = computeRewards([a, b], cfg);
  const after = computeRewards([a, b, { ...b, valid: false }], cfg);
  const mov = reconcile(before, after, 'now');
  assert.deepEqual(mov.map((m) => [m.kind, m.points]), [['revoke', -5]]);
  assert.deepEqual(reconcile(after, after), []);
});

test('fechas de la liga: no se premia fuera, pero el historial previo cuenta para regresos', () => {
  const c = structuredClone(cfg);
  c.league.start = '2026-11-01';
  const r = computeRewards([tr('ana', '2026-10-10T10:00:00Z'), tr('ana', '2026-10-11T10:00:00Z'), tr('ana', '2026-11-12T10:00:00Z')], c);
  assert.deepEqual(r.map((x) => x.ruleId).sort(), ['REG-001', 'REG-002']);
});

test('clasificación ordenada por puntos', () => {
  const ev = [tr('ana', '2026-11-02T08:00:00Z'), tr('ana', '2026-11-03T08:00:00Z'), tr('bea', '2026-11-02T08:00:00Z')];
  assert.deepEqual(standings(computeRewards(ev, cfg), ['ana', 'bea']), [{ memberId: 'ana', points: 5 }, { memberId: 'bea', points: 0 }]);
});
