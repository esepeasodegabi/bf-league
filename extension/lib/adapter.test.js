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

// ---- API REST (HAR del 09/11/2026; datos inventados) ----
const API = 'https://api.brooklynfitboxing.com/v1';
const restTrainer = { trainerId: 'tr1', name: 'Entrenadora Uno', avatarPath: 'p.jpg', avatarUrl: 'https://x/p.jpg' };
const restClassBase = {
  occurrenceId: 'k1', closedClassId: 'k1', globalTime: '2026-11-09T09:30:00.000Z', startsAt: '2026-11-09T08:30:00.000Z',
  startedAt: '2026-11-09T08:32:21.914Z', finishedAt: '2026-11-09T09:13:51.885Z', off: false, private: false, type: 'FS',
  bookedCount: 2, firstBookingsCount: 0, availableSpots: null, aggregatorsCount: 0, capacity: 20, averageEnergy: 98.44, trainer: restTrainer,
};
const restFitboxer = (id, name) => ({ fitboxerId: id, name, nickname: name.split(' ')[0], email: `${id}@example.com`, status: '5', belongsToClub: true, club: { clubId: 'club', alias: 'CLUB' }, aggregatorId: null, registrationState: null });

test('REST: listado de clases terminadas', () => {
  const out = parseCapture(
    { method: 'GET', url: `${API}/class-occurrences?clubId=club&state=closed&dateFrom=2026-11-09&dateTo=2026-11-10&limit=100&offset=0` },
    { data: [restClassBase], total: 1 },
  );
  assert.deepEqual(out.classes, [{
    id: 'k1', start: '2026-11-09T08:30:00.000Z', end: '2026-11-09T09:13:51.885Z',
    type: 'FS', capacity: 20, reservations: 2, trainer: { id: 'tr1', name: 'Entrenadora Uno' },
  }]);
  assert.deepEqual(out.trainings, []);
});

test('REST: detalle de una clase con sus asistentes', () => {
  const detail = {
    ...restClassBase, club: { clubId: 'club', alias: 'CLUB' }, challengeAlias: 'BR317',
    workouts: [
      { sessionId: 's1', fitboxer: restFitboxer('f1', 'Ana  García López'), energy: 99.7, type: 'FS' },
      { sessionId: 's2', fitboxer: restFitboxer('f2', 'Luis Pérez'), energy: 98.9, type: 'FS' },
    ],
    noShow: [{ fitboxerId: 'f3', name: 'Eva Sanz' }],
    activity: [],
  };
  const out = parseCapture({ method: 'GET', url: `${API}/closed-classes/k1` }, detail);
  assert.equal(out.classes.length, 1);
  const c = out.classes[0];
  assert.deepEqual([c.id, c.finished, c.detail, c.attendees, c.sessions, c.noShows], ['k1', true, true, ['f1', 'f2'], { f1: 's1', f2: 's2' }, ['f3']]);
  assert.deepEqual(out.trainings.map((t) => [t.id, t.memberId, t.endedAt]), [['s1', 'f1', '2026-11-09T09:13:51.885Z'], ['s2', 'f2', '2026-11-09T09:13:51.885Z']]);
  assert.deepEqual(out.members.map((m) => [m.id, m.firstName, m.lastName]), [['f1', 'Ana', 'García López'], ['f2', 'Luis', 'Pérez']]);
  assert.ok(!JSON.stringify(stripPersonalData({ ...detail, activity: [{ actor: 'staff@example.com' }] })).includes('@example.com'));
});

test('REST: otras respuestas de la API no generan datos', () => {
  const out = parseCapture({ method: 'GET', url: `${API}/auth/me?include=district` }, { userId: 'u', permissions: [{ clubId: 'club' }] });
  assert.deepEqual(out, { classes: [], trainings: [], members: [], referrals: [] });
});
