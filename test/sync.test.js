const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../logic.js');
const S = require('../sync-core.js');
const { Server, FakeBackend } = require('./fake-server.js');

function phone(server, state = T.newState(), { online = true } = {}) {
  const p = { state, backend: new FakeBackend(server, online), applied: 0, savedBase: null, status: '' };
  p.engine = new S.SyncEngine({
    backend: p.backend,
    getRecords: () => S.toRecords(p.state),
    applyRecords: (records) => { p.state = S.fromRecords(records, T.newState()); p.applied++; },
    loadBase: () => p.savedBase,
    saveBase: (records) => { p.savedBase = records; },
    onStatus: (status) => { p.status = status; },
  });
  p.change = (fn) => { fn(p.state); p.engine.localChanged(); };
  p.engine.start();
  return p;
}

const pair = () => {
  const server = new Server();
  return { server, pip: phone(server), wes: phone(server) };
};
const DAY = '2026-11-09';
const readingDocs = (server) => Object.keys(server.docs).filter((k) => k.startsWith('reading_')).length;

test('records survive the round trip exactly', () => {
  const state = T.newState();
  T.loadStarterMix(state, DAY);
  const batch = T.createBatch(state, { cropId: 'basil', cubes: 5, sownOn: '2026-11-01', variety: 'Genovese' });
  T.moveToLights(batch, '2026-11-05', 4);
  T.moveToTower(state, batch, '2026-11-08', ['1-1', '1-2']);
  T.logPick(batch, { on: DAY, grams: 40, notes: 'First' });
  T.logReading(state, { on: DAY, ph: 6.1, ec: 1.4 });
  T.startTower(state, DAY);
  const again = S.fromRecords(S.toRecords(state), T.newState());
  assert.deepEqual(S.toRecords(again), S.toRecords(state));
  assert.deepEqual(again.plan.map((i) => i.cropId), state.plan.map((i) => i.cropId));
  assert.deepEqual(again.batches[0].pods, ['1-1', '1-2']);
  assert.equal(again.towerStartedOn, DAY);
});

test('what one phone does shows up on the other', () => {
  const { pip, wes } = pair();
  pip.change((s) => T.createBatch(s, { cropId: 'basil', cubes: 5, sownOn: DAY }));
  assert.equal(wes.state.batches.length, 1);
  assert.equal(wes.state.batches[0].cubes, 5);
  wes.change((s) => T.logReading(s, { on: DAY, ph: 6.0 }));
  assert.equal(pip.state.readings.length, 1);
  assert.equal(pip.status, 'synced');
});

test('deletes reach the other phone and stay deleted', () => {
  const { pip, wes } = pair();
  pip.change((s) => T.logReading(s, { on: DAY, ph: 6.0 }));
  wes.change((s) => { s.readings = []; });
  assert.equal(pip.state.readings.length, 0);
  pip.change((s) => T.logReading(s, { on: DAY, ph: 6.2 }));
  assert.equal(wes.state.readings.length, 1);
  assert.equal(wes.state.readings[0].ph, 6.2);
});

test('both phones offline: every reading and batch survives', () => {
  const { pip, wes } = pair();
  pip.backend.goOffline();
  wes.backend.goOffline();
  pip.change((s) => { T.logReading(s, { on: DAY, ph: 6.0 }); T.createBatch(s, { cropId: 'basil', cubes: 5, sownOn: DAY }); });
  wes.change((s) => { T.logReading(s, { on: DAY, ec: 1.4 }); T.createBatch(s, { cropId: 'shiso', cubes: 3, sownOn: DAY }); });
  assert.equal(pip.status, 'saving');
  assert.equal(pip.state.readings.length, 1, 'a phone keeps working offline');
  pip.backend.goOnline();
  wes.backend.goOnline();
  for (const p of [pip, wes]) {
    assert.equal(p.state.readings.length, 2);
    assert.deepEqual(p.state.batches.map((b) => b.cropId).sort(), ['basil', 'shiso']);
  }
  assert.deepEqual(S.toRecords(pip.state), S.toRecords(wes.state));
});

test('editing different batches offline keeps both edits', () => {
  const { pip, wes } = pair();
  pip.change((s) => { T.createBatch(s, { cropId: 'basil', cubes: 5, sownOn: DAY }); T.createBatch(s, { cropId: 'shiso', cubes: 3, sownOn: DAY }); });
  pip.backend.goOffline();
  wes.backend.goOffline();
  pip.change((s) => s.batches[0].notes.push({ on: DAY, text: 'From Pip' }));
  wes.change((s) => s.batches[1].notes.push({ on: DAY, text: 'From Wes' }));
  pip.backend.goOnline();
  wes.backend.goOnline();
  for (const p of [pip, wes]) {
    assert.equal(p.state.batches[0].notes[0].text, 'From Pip');
    assert.equal(p.state.batches[1].notes[0].text, 'From Wes');
  }
});

test('changing the same batch on both phones offline: the last to reconnect wins, and both agree', () => {
  const { pip, wes } = pair();
  pip.change((s) => T.createBatch(s, { cropId: 'basil', cubes: 5, sownOn: DAY }));
  pip.backend.goOffline();
  wes.backend.goOffline();
  pip.change((s) => s.batches[0].notes.push({ on: DAY, text: 'From Pip' }));
  wes.change((s) => s.batches[0].notes.push({ on: DAY, text: 'From Wes' }));
  pip.backend.goOnline();
  wes.backend.goOnline();
  assert.deepEqual(S.toRecords(pip.state), S.toRecords(wes.state));
  assert.equal(pip.state.batches[0].notes[0].text, 'From Wes');
});

test('a phone signing in for the first time keeps its own data and gets the household’s', () => {
  const server = new Server();
  const pip = phone(server);
  pip.change((s) => { T.logReading(s, { on: DAY, ph: 6.0 }); s.settings.reservoirL = 18; });
  const local = T.newState();
  T.logReading(local, { on: DAY, ec: 1.5 });
  const wes = phone(server, local);
  assert.equal(wes.state.readings.length, 2);
  assert.equal(pip.state.readings.length, 2);
  assert.equal(wes.state.settings.reservoirL, 18, 'existing household settings win');
});

test('an offline first sign-in waits, rather than treating the household as empty', () => {
  const server = new Server();
  phone(server).change((s) => T.logReading(s, { on: DAY, ph: 6.0 }));
  const wes = phone(server, T.newState(), { online: false });
  assert.equal(wes.status, 'waiting');
  assert.equal(wes.savedBase, null);
  wes.backend.goOnline();
  assert.equal(wes.state.readings.length, 1);
  assert.equal(readingDocs(server), 1);
});

test('changes made while the sync code could not load still go up on the next start', () => {
  const server = new Server();
  const pip = phone(server);
  pip.change((s) => T.logReading(s, { on: DAY, ph: 6.0 }));
  pip.engine.stop();
  T.logReading(pip.state, { on: DAY, ph: 6.3 });
  pip.engine.start();
  assert.equal(readingDocs(server), 2);
  assert.equal(pip.state.readings.length, 2);
});

test('no echo: a change is written once and doesn’t bounce between phones', () => {
  const { server, pip, wes } = pair();
  const before = server.writes;
  const wesApplied = wes.applied;
  pip.change((s) => T.logReading(s, { on: DAY, ph: 6.0 }));
  assert.equal(server.writes - before, 1);
  assert.equal(wes.applied - wesApplied, 1);
  wes.engine.localChanged();
  assert.equal(server.writes - before, 1);
});

test('only what changed is sent', () => {
  const { server, pip } = pair();
  pip.change((s) => { T.loadStarterMix(s, DAY); T.logReading(s, { on: DAY, ph: 6.0 }); });
  const before = server.writes;
  pip.change((s) => { s.plan[0].pods = 10; });
  assert.equal(server.writes - before, 1);
});
