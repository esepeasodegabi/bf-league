import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture, splitName, stripPersonalData, referralEvents } from './adapter.js';

// Formas reales de las respuestas (datos acortados e inventados).
const listRequest = {
  operationName: null,
  variables: { from: '2026/10/26', to: '2026/11/1' },
  query: 'query ($from: String!, $to: String!) {\n  classes(from: $from, to: $to, finished: true) {\n    id\n  }\n}\n',
};
const listResponse = {
  data: {
    classes: [
      { __typename: 'Class', id: 'c1', rsv_val: 6, tim: '2026-10-26T08:30:00.000Z', wrk: 97.99, capacity: 20, type: 'FS', aggregatorsCount: 0, fb_val: 0, tra: { __typename: 'Trainer', id: 'tr1', name: 'Entrenadora Uno', show_img: 'x.jpg' } },
    ],
  },
};

const fitboxer = (id, name) => ({ __typename: 'Fitboxer', id, fitboxerId: id, aggregatorId: null, name, eml: `${id}@example.com`, clt_tip: 5, district: { id: 'club', alias: 'CLUB' } });
const detailResponse = {
  data: {
    class: {
      __typename: 'Class', id: 'c1', tim: '2026-10-26T08:30:00.000Z', rsv_val: 3, capacity: 20, type: 'FS',
      tim_att: '2026-10-26T08:32:10.434Z', tim_fin: '2026-10-26T09:13:33.548Z',
      tra: { id: 'tr1', name: 'Entrenadora Uno' },
      workouts: [
        { __typename: 'Session', id: 's1', wrk: 99.9, type: 'FS', fitboxer: fitboxer('f1', 'Ana  García López ') },
        { __typename: 'Session', id: 's2', wrk: 90.1, type: 'FS', fitboxer: fitboxer('f2', 'Luis Pérez') },
      ],
      no_show: [{ id: 'f3', fitboxerId: 'f3', name: 'Eva Sanz', eml: 'x@example.com' }],
      activity: [],
    },
  },
};

test('lee el listado de clases', () => {
  const out = parseCapture(listRequest, listResponse);
  assert.equal(out.classes.length, 1);
  assert.deepEqual(out.classes[0], {
    id: 'c1', start: '2026-10-26T08:30:00.000Z', end: '2026-10-26T09:15:00.000Z',
    type: 'FS', capacity: 20, reservations: 6, trainer: { id: 'tr1', name: 'Entrenadora Uno' },
  });
  assert.equal(out.trainings.length, 0);
});

test('el detalle de una clase terminada genera un entrenamiento por asistente', () => {
  const out = parseCapture({ variables: { id: 'c1' } }, detailResponse);
  assert.deepEqual(out.trainings.map((t) => [t.id, t.memberId, t.endedAt]), [
    ['s1', 'f1', '2026-10-26T09:13:33.548Z'],
    ['s2', 'f2', '2026-10-26T09:13:33.548Z'],
  ]);
  assert.deepEqual(out.members[0], { id: 'f1', firstName: 'Ana', lastName: 'García López', clientType: 5 });
  assert.deepEqual(out.classes[0].noShows, ['f3']);
  assert.ok(!JSON.stringify(out).includes('@'));
});

test('una clase sin terminar no da entrenamientos', () => {
  const r = structuredClone(detailResponse);
  r.data.class.tim_fin = null;
  assert.equal(parseCapture(null, r).trainings.length, 0);
});

test('separa nombre y apellidos', () => {
  assert.deepEqual(splitName('  Yolanda  Fernández González '), { firstName: 'Yolanda', lastName: 'Fernández González' });
});

test('quita los correos antes de guardar', () => {
  assert.ok(!JSON.stringify(stripPersonalData(detailResponse)).includes('@'));
});

test('ignora respuestas sin datos', () => {
  assert.deepEqual(parseCapture(null, { errors: [] }).classes, []);
});

// Forma real de la ficha del fitboxer (datos inventados).
const profileResponse = {
  data: {
    fitboxer: {
      __typename: 'Fitboxer', id: 'f1', fitboxerId: 'f1', name: 'Ana  García López', firstName: 'Ana ', lastName: 'García López',
      eml: 'ana@example.com', tfn: '+34600000000', dni: null, birthdate: '1980-01-01T00:00:00.000Z', clt_tip: 5,
      events: [
        { status: 5, time: '2026-10-12T16:40:28.608Z', metadata: { membershipId: 'm1' }, subscription: { name: 'ILIMITADAS' } },
        { status: 3, time: '2026-10-12T09:46:09.793Z', metadata: { when: '2026-10-12T09:00:00.000Z', trainer: 1 } },
        { status: 2, time: '2026-10-07T15:43:36.605Z', metadata: { when: '2026-10-12T09:00:00.000Z' } },
        { status: 1, time: '2026-09-30T20:13:07.108Z', metadata: { orderId: 'o1' } },
      ],
      sessions: [
        { __typename: 'Session', id: 's1', tim: '2026-10-26T08:30:00.000Z' },
        { __typename: 'Session', id: 's0', tim: '2026-10-12T09:00:00.000Z' },
      ],
      payments: [{ id: 'p1', imp: 70 }],
    },
  },
};

test('la ficha del fitboxer da su historial con los mismos ids que el detalle de clase', () => {
  const out = parseCapture(null, profileResponse);
  assert.deepEqual(out.trainings.map((t) => [t.id, t.memberId, t.endedAt]), [
    ['s1', 'f1', '2026-10-26T09:15:00.000Z'],
    ['s0', 'f1', '2026-10-12T09:45:00.000Z'],
  ]);
  const m = out.members[0];
  assert.equal(m.firstName, 'Ana');
  assert.equal(m.lastName, 'García López');
  assert.deepEqual(m.statuses.map((s) => s.status), [5, 3, 2, 1]);
});

test('no se guardan teléfono, DNI, fecha de nacimiento ni pagos', () => {
  const clean = JSON.stringify(stripPersonalData(profileResponse));
  for (const secret of ['@', '+34', '1980', 'imp']) assert.ok(!clean.includes(secret), secret);
});

test('referidos apuntados a mano usan las fechas de iniciación y alta de la app', () => {
  const members = parseCapture(null, profileResponse).members;
  const ev = referralEvents([{ referredId: 'f1', referrerId: 'f9' }, { referredId: 'nadie', referrerId: 'f9' }], members);
  assert.deepEqual(ev.map((e) => [e.type, e.referrerId, e.at]), [
    ['referral_attendance', 'f9', '2026-10-12T09:46:09.793Z'],
    ['referral_signup', 'f9', '2026-10-12T16:40:28.608Z'],
  ]);
});
