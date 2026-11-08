const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../logic.js');

const SOWN = '2026-11-01';

function setup(overrides = {}) {
  const state = T.newState();
  const batch = T.createBatch(state, { cropId: 'looseleaf', cubes: 12, sownOn: SOWN, ...overrides });
  return { state, batch };
}

function toTower(state, batch, pods, on = '2026-11-25') {
  T.moveToLights(batch, '2026-11-04', batch.cubes);
  T.moveToTower(state, batch, on, pods);
}

test('every crop has usable numbers', () => {
  for (const crop of T.CROPS) {
    assert.ok(crop.ph[0] < crop.ph[1], crop.id);
    assert.ok(crop.firstHarvest[0] < crop.firstHarvest[1], crop.id);
    assert.ok(crop.ec[0] < crop.ec[1], crop.id);
    assert.ok(crop.towerDays > 0 && crop.interval > 0 && crop.germDays > 0 && crop.seedlingDays > 0, crop.id);
    assert.ok(crop.harvest === 'whole' ? crop.regrowDays === null : crop.regrowDays > 0, crop.id);
  }
  assert.equal(new Set(T.CROPS.map((c) => c.short)).size, T.CROPS.length);
});

test('batch numbers count up without gaps, whatever else was logged', () => {
  const state = T.newState();
  T.startTower(state, SOWN);
  T.logReading(state, { on: SOWN, ph: 6 });
  const first = T.createBatch(state, { cropId: 'basil', cubes: 1, sownOn: SOWN });
  const second = T.createBatch(state, { cropId: 'basil', cubes: 1, sownOn: SOWN });
  assert.deepEqual([first.code, second.code], ['Batch 1', 'Batch 2']);
  assert.notEqual(first.id, second.id);
});

test('the tower has 50 pods by default, numbered from the top', () => {
  const { settings } = T.newState();
  assert.equal(T.allPods(settings).length, 50);
  assert.equal(T.podLabel('1-1'), 'Tier 1, pod 1');
});

test('time passing makes a check due but never moves a batch', () => {
  const { batch } = setup();
  assert.equal(T.nextCheck(batch, SOWN).daysLeft, 3);
  assert.equal(T.nextCheck(batch, '2026-11-04').isDue, true);
  assert.equal(T.nextCheck(batch, '2026-12-30').overdueBy, 56);
  assert.equal(T.currentStage(batch), 'germinating');
});

test('"not yet" pushes the check back until the batch moves', () => {
  const { batch } = setup();
  T.notReady(batch, '2026-11-04', { recheckInDays: 2 });
  const check = T.nextCheck(batch, '2026-11-04');
  assert.equal(check.dueOn, '2026-11-06');
  assert.equal(check.rechecking, true);
  T.moveToLights(batch, '2026-11-06', 10);
  assert.equal(T.nextCheck(batch, '2026-11-06').rechecking, false);
  assert.equal(T.nextCheck(batch, '2026-11-06').dueOn, '2026-11-17');
});

test('recording sprouts sets the plant count', () => {
  const { batch } = setup();
  assert.throws(() => T.moveToLights(batch, '2026-11-04', 13), /only has 12/);
  T.moveToLights(batch, '2026-11-04', 10);
  assert.equal(batch.plants, 10);
});

test('seedlings can go straight to the tower, or via the greenhouse', () => {
  const direct = setup();
  T.moveToLights(direct.batch, '2026-11-04', 12);
  T.moveToTower(direct.state, direct.batch, '2026-11-20', ['1-1']);
  assert.equal(T.currentStage(direct.batch), 'tower');

  const via = setup();
  T.moveToLights(via.batch, '2026-11-04', 12);
  T.moveToGreenhouse(via.batch, '2026-11-20');
  assert.equal(T.nextCheck(via.batch, '2026-11-20').daysLeft, 7);
  T.moveToTower(via.state, via.batch, '2026-11-27', ['1-1']);
  assert.deepEqual(via.batch.stages.map((s) => s.stage), ['germinating', 'seedling', 'greenhouse', 'tower']);
});

test('germinating batches cannot jump to the tower', () => {
  const { state, batch } = setup();
  assert.throws(() => T.moveToTower(state, batch, '2026-11-10', ['1-1']), /Only seedlings/);
});

test('a pod can only hold one plant', () => {
  const { state, batch } = setup();
  toTower(state, batch, ['1-1', '1-2']);
  const other = T.createBatch(state, { cropId: 'basil', cubes: 4, sownOn: SOWN });
  T.moveToLights(other, '2026-11-08', 4);
  assert.throws(() => T.moveToTower(state, other, '2026-11-25', ['1-2']), /already planted/);
  assert.throws(() => T.moveToTower(state, other, '2026-11-25', ['11-1']), /isn’t a pod/);
  assert.equal(T.freePods(state).length, 48);
});

test('leftover seedlings carry on as their own batch or are composted', () => {
  const kept = setup();
  T.moveToLights(kept.batch, '2026-11-04', 10);
  const split = T.moveToTower(kept.state, kept.batch, '2026-11-25', ['1-1', '1-2', '1-3'], { rest: 'stay' });
  assert.equal(kept.batch.plants, 3);
  assert.equal(split.plants, 7);
  assert.equal(split.code, 'Batch 1b');
  assert.equal(T.currentStage(split), 'seedling');
  assert.deepEqual(split.pods, []);
  T.moveToGreenhouse(split, '2026-11-25');
  assert.equal(T.currentStage(kept.batch), 'tower');

  const composted = setup();
  T.moveToLights(composted.batch, '2026-11-04', 10);
  assert.equal(T.moveToTower(composted.state, composted.batch, '2026-11-25', ['1-1'], { rest: 'discard' }), null);
  assert.equal(composted.state.batches.length, 1);
});

test('harvest check waits for the crop and for time in the tower', () => {
  const { state, batch } = setup();
  toTower(state, batch, ['1-1'], '2026-11-25');
  assert.equal(T.nextCheck(batch, '2026-11-25').dueOn, '2026-12-09');
});

test('picking leaves keeps the pods and schedules the next pick', () => {
  const { state, batch } = setup();
  toTower(state, batch, ['1-1', '1-2'], '2026-11-25');
  T.logPick(batch, { on: '2026-12-10', grams: 80 });
  assert.equal(T.nextCheck(batch, '2026-12-10').dueOn, '2026-12-17');
  assert.deepEqual(batch.pods, ['1-1', '1-2']);
  assert.equal(T.totalGrams(batch), 80);
});

test('removing plants frees pods and finishes the batch when none remain', () => {
  const { state, batch } = setup();
  toTower(state, batch, ['1-1', '1-2'], '2026-11-25');
  T.removePods(batch, { on: '2026-12-20', pods: ['1-1'], grams: 100 });
  assert.equal(batch.status, 'growing');
  assert.equal(T.freePods(state).length, 49);
  T.removePods(batch, { on: '2026-12-21', pods: ['1-2'], harvested: false, notes: 'Bolted' });
  assert.equal(batch.status, 'finished');
  assert.equal(T.freePods(state).length, 50);
  assert.equal(batch.harvests.length, 1);
  assert.equal(T.totalGrams(batch), 100);
});

test('a removal can be undone unless the pod was replanted', () => {
  const { state, batch } = setup();
  toTower(state, batch, ['1-1'], '2026-11-25');
  T.removePods(batch, { on: '2026-12-20', pods: ['1-1'], grams: 100 });
  T.undoRemoval(state, batch);
  assert.equal(batch.status, 'growing');
  assert.deepEqual(batch.pods, ['1-1']);
  assert.equal(batch.harvests.length, 0);

  T.removePods(batch, { on: '2026-12-20', pods: ['1-1'] });
  const next = T.createBatch(state, { cropId: 'basil', cubes: 1, sownOn: SOWN });
  T.moveToLights(next, '2026-11-08', 1);
  T.moveToTower(state, next, '2026-12-21', ['1-1']);
  assert.throws(() => T.undoRemoval(state, batch), /replanted/);
});

test('undoing a move into the tower gives the pods back', () => {
  const { state, batch } = setup();
  toTower(state, batch, ['1-1'], '2026-11-25');
  T.undoLastMove(batch);
  assert.equal(T.currentStage(batch), 'seedling');
  assert.equal(T.freePods(state).length, 50);
});

test('a move is refused once harvests exist', () => {
  const { state, batch } = setup();
  toTower(state, batch, ['1-1'], '2026-11-25');
  T.logPick(batch, { on: '2026-12-10' });
  assert.throws(() => T.undoLastMove(batch), /harvests logged/);
});

test('reservoir target is the overlap of what is in the tower', () => {
  const salad = T.targetForCrops(['looseleaf', 'arugula', 'mustard', 'bokchoy'].map(T.cropById));
  assert.deepEqual(salad.ph.range, [6.0, 6.2]);
  assert.deepEqual(salad.ec.range, [1.5, 1.8]);
  assert.equal(salad.ph.shared, true);
  assert.equal(salad.ec.shared, true);
});

test('crops with no shared range get a compromise that names who misses out', () => {
  const target = T.targetForCrops(['basil', 'kale'].map(T.cropById));
  assert.equal(target.ec.shared, false);
  assert.deepEqual(target.ec.range, [1.6, 1.8]);

  const clash = T.targetForCrops(['thyme', 'beans'].map(T.cropById));
  assert.deepEqual(clash.ec.range, [1.7, 1.9]);
  assert.deepEqual(clash.ec.outliers.sort(), ['Bush beans', 'Thyme']);
});

test('the suggested starter mix fills the tower and shares a range', () => {
  const state = T.newState();
  T.loadStarterMix(state);
  assert.ok(T.planTotalPods(state) >= 45 && T.planTotalPods(state) <= 50);
  const target = T.reservoirTarget(state, SOWN);
  assert.equal(target.basis, 'plan');
  assert.equal(target.ph.shared, true);
  assert.equal(target.ec.shared, true);
});

test('the target follows the tower once planted', () => {
  const state = T.newState();
  T.loadStarterMix(state);
  const batch = T.createBatch(state, { cropId: 'basil', cubes: 1, sownOn: SOWN });
  T.moveToLights(batch, '2026-11-06', 1);
  T.moveToTower(state, batch, '2026-11-25', ['1-1']);
  const target = T.reservoirTarget(state, '2026-11-26');
  assert.equal(target.basis, 'tower');
  assert.deepEqual(target.ph.range, [5.5, 6.0]);
  assert.equal(target.justPlanted, true);
  assert.equal(T.reservoirTarget(state, '2026-12-10').justPlanted, false);
});

test('meter units convert both ways', () => {
  assert.equal(T.toEc(12, 'CF'), 1.2);
  assert.equal(T.fromEc(1.2, 'PPM500'), 600);
  assert.equal(T.fromEc(1.2, 'PPM700'), 840);
  assert.equal(T.fromEc(1.2, 'EC'), 1.2);
});

const TARGET = T.targetForCrops([T.cropById('looseleaf')]);

test('reading advice flags each side of the target', () => {
  const title = (r) => T.adviseReading(r, TARGET)[0];
  assert.equal(title({ ph: 6.2 }).level, 'ok');
  assert.match(title({ ph: 5.6 }).text, /pH Up/);
  assert.match(title({ ph: 5.6 }).title, /aim for 6.0–6.5/);
  assert.match(title({ ph: 6.9 }).text, /pH Down/);
  assert.equal(title({ ph: 4.8 }).level, 'urgent');
  assert.match(title({ ec: 0.8 }).text, /part A/);
  assert.match(title({ ec: 2.0 }).text, /plain water/);
  assert.equal(title({ ec: 2.5 }).level, 'urgent');
  assert.equal(title({ waterTemp: 27 }).level, 'urgent');
  assert.equal(title({ waterTemp: 25 }).level, 'act');
  assert.equal(T.adviseReading({ waterTemp: 20 }, TARGET).length, 0);
});

test('advice shows EC in the meter’s own units', () => {
  const [item] = T.adviseReading({ ec: 0.8 }, TARGET, null, 'PPM500');
  assert.match(item.title, /400 \(aim for 600–900\)/);
});

test('EC trend needs a reading from the past week', () => {
  const titles = (r, p) => T.adviseReading(r, TARGET, p).map((i) => i.title);
  const near = { on: '2026-11-01', ec: 1.4 };
  assert.ok(titles({ on: '2026-11-03', ec: 1.7 }, near).includes('EC is climbing'));
  assert.ok(titles({ on: '2026-11-03', ec: 1.2 }, near).includes('EC is falling'));
  assert.ok(!titles({ on: '2026-11-20', ec: 1.7 }, near).includes('EC is climbing'));
});

test('readings are refused when they cannot be right', () => {
  const state = T.newState();
  assert.throws(() => T.logReading(state, { on: SOWN }), /at least one/);
  assert.throws(() => T.logReading(state, { on: SOWN, ph: 15 }), /pH must/);
  assert.throws(() => T.logReading(state, { on: SOWN, ec: 800 }), /units/);
});

test('readings stay in date order', () => {
  const state = T.newState();
  T.logReading(state, { on: '2026-11-05', ph: 6 });
  T.logReading(state, { on: '2026-11-02', ph: 5.9 });
  assert.equal(T.latestReading(state).on, '2026-11-05');
});

test('nutrient amounts only appear once the label rates are entered', () => {
  const { settings } = T.newState();
  assert.deepEqual(T.mixAmounts(settings), { a: 100, b: 100 }); // Origin Hydro, 20 L.
  settings.partAMlPerL = null;
  assert.equal(T.mixAmounts(settings), null);
  settings.partAMlPerL = 2;
  settings.partBMlPerL = 2.5;
  assert.deepEqual(T.mixAmounts(settings), { a: 40, b: 50 });
  assert.deepEqual(T.mixAmounts(settings, 20, 0.5), { a: 20, b: 25 });
});

test('routines stay quiet until the tower is running', () => {
  const state = T.newState();
  assert.deepEqual(T.routineStatus(state, SOWN), []);
  T.startTower(state, SOWN);
  const due = (day) => T.routineStatus(state, day).filter((r) => r.isDue).map((r) => r.id);
  assert.deepEqual(due(SOWN), []);
  assert.deepEqual(due('2026-11-02'), ['level', 'ph']);
  assert.ok(due('2026-11-15').includes('change'));
});

test('logging a reading or top-up counts as doing that job', () => {
  const state = T.newState();
  T.startTower(state, SOWN);
  T.logReading(state, { on: '2026-11-03', ph: 6.1, addedL: 2 });
  const status = T.routineStatus(state, '2026-11-03');
  assert.equal(status.find((r) => r.id === 'ph').isDue, false);
  assert.equal(status.find((r) => r.id === 'level').isDue, false);
  T.logCare(state, 'change', '2026-11-05');
  assert.equal(T.lastDone(state, 'change'), '2026-11-05');
});

test('batch size keeps pods full across the rotation', () => {
  const { settings } = T.newState();
  // 24 pods, each plant stays 49 days, sown every 14 days: 24 x 14 / 49 = 7 pods.
  assert.deepEqual(T.batchSize({ cropId: 'looseleaf', pods: 24, intervalDays: 14 }, settings), { pods: 7, cubes: 9 });
  // A long interval can't plant more than the crop's share.
  assert.equal(T.batchSize({ cropId: 'bokchoy', pods: 4, intervalDays: 60 }, settings).pods, 4);
  // Never less than one.
  assert.equal(T.batchSize({ cropId: 'chives', pods: 1, intervalDays: 14 }, settings).pods, 1);
});

test('the next sowing follows the last one, and can be skipped', () => {
  const state = T.newState();
  assert.equal(T.addPlanItem(state, { cropId: 'butterhead', pods: 8 }).intervalDays, 7);
  const item = T.addPlanItem(state, { cropId: 'looseleaf', pods: 24, intervalDays: 14 });
  assert.equal(T.nextSowOn(state, item, SOWN), SOWN);
  T.createBatch(state, { cropId: 'looseleaf', cubes: 9, sownOn: SOWN });
  assert.equal(T.nextSowOn(state, item, '2026-11-02'), '2026-11-15');
  T.skipSowing(item, '2026-11-15');
  assert.equal(T.nextSowOn(state, item, '2026-11-15'), '2026-11-29');
  assert.throws(() => T.addPlanItem(state, { cropId: 'looseleaf', pods: 1 }), /already in the plan/);
});

test('today lists sowings, checks and care that are due', () => {
  const state = T.newState();
  T.addPlanItem(state, { cropId: 'arugula', pods: 6 });
  T.createBatch(state, { cropId: 'basil', cubes: 4, sownOn: SOWN });
  T.startTower(state, SOWN);
  const view = T.todayView(state, '2026-11-06');
  assert.equal(view.sows[0].crop.id, 'arugula');
  assert.equal(view.sows[0].size.pods, 2);
  assert.equal(view.checks.length, 1);
  assert.ok(view.care.some((r) => r.id === 'level'));
});

test('forecast starts empty, fills up, and frees pods as crops finish', () => {
  const state = T.newState();
  T.addPlanItem(state, { cropId: 'bokchoy', pods: 8 }); // 14 + 2 days to tower, 28 in it, every 14.
  const rows = T.forecast(state, SOWN, 12);
  assert.equal(rows[0].inUse, 0);
  assert.equal(rows[0].sow.length, 1);
  const peak = Math.max(...rows.map((r) => r.inUse));
  assert.ok(peak <= 12, `peak was ${peak}`);
  assert.ok(peak >= 8, `peak was ${peak}`);
  assert.ok(rows.some((r) => r.comingOut > 0));
  assert.equal(rows.every((r) => r.over === 0), true);
});

test('forecast warns when the plan overfills the tower', () => {
  const state = T.newState();
  T.addPlanItem(state, { cropId: 'looseleaf', pods: 100, intervalDays: 7 });
  const rows = T.forecast(state, SOWN, 12);
  assert.ok(rows.some((r) => r.over > 0));
});

test('forecast counts batches already growing', () => {
  const { state, batch } = setup();
  toTower(state, batch, ['1-1', '1-2', '1-3'], '2026-11-25');
  const rows = T.forecast(state, '2026-11-26', 12);
  assert.equal(rows[0].inUse, 3);
  assert.equal(T.podsFreeOn(state, '2026-11-26', '2026-11-27'), 47);
});

test('an overdue tower batch still counts as using its pods', () => {
  const { state, batch } = setup();
  toTower(state, batch, ['1-1'], '2026-11-25');
  assert.equal(T.podsFreeOn(state, '2027-06-01', '2027-06-02'), 49);
  assert.equal(T.pastPlannedTowerTime(batch, '2027-06-01'), true);
  assert.equal(T.pastPlannedTowerTime(batch, '2026-12-01'), false);
});

test('season warnings use Southern Hemisphere months and skip indoor towers', () => {
  const { settings } = T.newState();
  const lettuce = T.cropById('looseleaf');
  const basil = T.cropById('basil');
  assert.match(T.seasonWarning(lettuce, '2027-01-10', settings), /bolt/);
  assert.equal(T.seasonWarning(lettuce, '2026-07-10', settings), '');
  assert.match(T.seasonWarning(basil, '2026-07-10', settings), /warm-season/);
  assert.equal(T.seasonWarning(basil, '2027-01-10', settings), '');
  assert.equal(T.seasonWarning(lettuce, '2027-01-10', { ...settings, location: 'Indoors' }), '');
});

test('lower-placed crops are offered the bottom pods first', () => {
  const state = T.newState();
  assert.deepEqual(T.suggestPods(state, T.cropById('looseleaf'), 2), ['1-1', '1-2']);
  assert.deepEqual(T.suggestPods(state, T.cropById('kale'), 2), ['10-5', '10-4']);
});

test('a batch can be composted before the tower, not after', () => {
  const { state, batch } = setup();
  T.discardBatch(batch, { on: '2026-11-05', reason: 'Damping off' });
  assert.equal(batch.status, 'ended');
  const second = T.createBatch(state, { cropId: 'basil', cubes: 1, sownOn: SOWN });
  toTower(state, second, ['1-1']);
  assert.throws(() => T.discardBatch(second, { on: '2026-12-01' }), /out of their pods/);
});

test('seasons follow the Gold Coast year', () => {
  const seasons = ['01', '03', '04', '05', '09', '10', '11', '12'].map((m) => T.seasonOf(`2026-${m}-15`));
  assert.deepEqual(seasons, ['hot', 'hot', 'warm', 'cool', 'cool', 'warm', 'hot', 'hot']);
  const { settings } = T.newState();
  assert.match(T.seasonAdvice('2026-12-01', settings).where, /no direct afternoon sun/);
  assert.match(T.seasonAdvice('2026-07-01', settings).where, /Direct sun/);
  assert.equal(T.seasonAdvice('2026-07-01', { ...settings, location: 'Indoors' }), null);
});

test('the summer mix fills the tower and centres EC on the label dose', () => {
  const state = T.newState();
  T.loadStarterMix(state, '2026-11-09');
  assert.equal(T.planTotalPods(state), 50);
  assert.ok(state.plan.some((item) => item.cropId === 'basil'));
  const target = T.reservoirTarget(state, '2026-11-09');
  assert.deepEqual(target.ec.range, [1.2, 1.6]);
  assert.equal(target.ec.shared, true);
  assert.deepEqual(target.ph.outliers, []);
  assert.deepEqual(target.ec.outliers, []);
  assert.ok(target.ph.range[0] <= 6.0 && target.ph.range[1] >= 6.0);
});

test('the cool mix applies outside summer', () => {
  const state = T.newState();
  T.loadStarterMix(state, '2026-07-01');
  assert.ok(state.plan.some((item) => item.cropId === 'bokchoy'));
  assert.ok(!state.plan.some((item) => item.cropId === 'basil'));
  const target = T.reservoirTarget(state, '2026-07-01');
  assert.equal(target.ph.shared, true);
  assert.equal(target.ec.shared, true);
});

test('default nutrient matches the Origin Hydro label', () => {
  const { settings } = T.newState();
  assert.deepEqual(T.mixAmounts(settings, 20, 0.5), { a: 50, b: 50 });
  // Raising EC by 0.18 in 20 L takes 20 ml of each part.
  assert.equal(T.doseToRaiseEc(settings, 0.18), 20);
  assert.equal(T.doseToRaiseEc(settings, 0.01), 5);
  assert.equal(T.doseToRaiseEc(settings, 0), null);
});

test('low EC advice gives amounts for the actual tank', () => {
  const { settings } = T.newState();
  const [item] = T.adviseReading({ ec: 1.0 }, TARGET, null, 'EC', settings);
  // Target midpoint 1.5, so 0.5 / 0.18 x 20 L = 55.6, rounded to 55 ml.
  assert.match(item.text, /about 55 ml of part A/);
  assert.match(T.adviseReading({ ec: 1.0 }, TARGET)[0].text, /a little at a time/);
});

test('EC is accepted however the meter shows it', () => {
  assert.equal(T.readingToEc(1.4, 'EC'), 1.4);
  assert.equal(T.readingToEc(1400, 'EC'), 1.4);
  assert.equal(T.readingToEc(1400, 'USCM'), 1.4);
  assert.equal(T.fromEc(1.4, 'USCM'), 1400);
});

test('neither suggested mix overfills the tower over 40 weeks', () => {
  for (const start of ['2026-11-09', '2026-05-01']) {
    const state = T.newState();
    T.loadStarterMix(state, start);
    assert.ok(T.planTotalPods(state) <= 50, start);
    assert.ok(T.forecast(state, start, 40).every((row) => row.over === 0), start);
  }
});

test('cube use adds up across the plan', () => {
  const state = T.newState();
  T.loadStarterMix(state, '2026-11-09');
  assert.equal(Math.round(T.cubesPerWeek(state)), 9);
  assert.equal(T.cubesPerWeek(T.newState()), 0);
});

test('your meter’s units are the default, and both ways of typing EC work', () => {
  assert.equal(T.newState().settings.meterUnit, 'USCM');
  assert.equal(T.readingToEc(1400, 'USCM'), 1.4);
  assert.equal(T.readingToEc(1.4, 'USCM'), 1.4);
  const [item] = T.adviseReading({ ec: 1000 / 1000 }, T.targetForCrops([T.cropById('looseleaf')]), null, 'USCM');
  assert.match(item.title, /1000 \(aim for 1200–1800\)/);
});

test('the seed box matches the sheet and every packet has a crop', () => {
  assert.equal(T.SEEDS.length, 89);
  assert.equal(T.SEEDS.filter((s) => s.tier === 'star').length, 44);
  assert.equal(T.SEEDS.filter((s) => s.tier === 'try').length, 45);
  for (const seed of T.SEEDS) assert.ok(T.cropById(seed.cropId), seed.plant);
  assert.deepEqual(T.SEEDS.filter((s) => s.treated).map((s) => s.plant).sort(), ['Capsicum', 'Cucumber', 'Mizuna']);
  for (const banned of ['Wormwood', 'Foxglove', 'Rue', 'Fennel']) {
    assert.ok(!T.SEEDS.some((s) => s.plant === banned), banned);
  }
});

test('sowing windows follow the sheet', () => {
  const find = (plant, when) => T.SEEDS.find((s) => s.plant === plant && s.when === when);
  const genovese = find('Basil', 'Sow now');
  const spinach = find('Spinach', 'Autumn');
  const lettuce = find('Lettuce', 'Now or autumn');
  assert.equal(T.seedInWindow(genovese, '2026-11-09'), true);
  assert.equal(T.seedInWindow(genovese, '2026-04-01'), false);
  assert.equal(T.seedInWindow(spinach, '2026-11-09'), false);
  assert.equal(T.seedInWindow(spinach, '2026-04-01'), true);
  assert.equal(T.seedInWindow(lettuce, '2026-11-09'), true);
  assert.equal(T.seedInWindow(lettuce, '2026-04-01'), true);
  assert.equal(T.seedInWindow(lettuce, '2026-07-01'), true);
  assert.equal(T.seedInWindow(spinach, '2026-07-01'), true);
  assert.equal(T.seedInWindow(genovese, '2026-07-01'), false);
  assert.match(T.seedWindowText(spinach, '2026-11-09'), /until March/);
});

test('suggested mixes use only untreated seed from the box, in season', () => {
  for (const today of ['2026-11-09', '2026-05-01', '2026-04-01', '2027-01-15']) {
    const { items } = T.starterMixFor(today);
    for (const { cropId } of items) {
      const seed = T.bestSeedFor(cropId, today);
      assert.ok(seed, `${cropId} has no packet`);
      assert.equal(seed.treated, false, cropId);
      assert.equal(seed.status, 'In box', cropId);
      assert.equal(T.seedInWindow(seed, today), true, `${cropId} on ${today}`);
    }
  }
});

test('the best packet skips treated and out-of-season seed where it can', () => {
  const capsicum = T.bestSeedFor('pepper', '2026-11-09');
  assert.equal(capsicum.treated, false);
  assert.equal(T.bestSeedFor('butterhead', '2026-11-09'), null);
  assert.match(T.seedWarnings(T.SEEDS.find((s) => s.plant === 'Mizuna'), '2026-11-09')[0], /Thiram/);
  assert.match(T.seedWarnings(T.SEEDS.find((s) => s.status === 'On order'), '2026-11-09').join(' '), /on order/);
});

test('the seed box groups every packet once', () => {
  const box = T.seedBox('2026-11-09');
  const total = box.stars.length + box.tries.length + box.later.length + box.flagged.length;
  assert.equal(total, 89);
  assert.ok(box.flagged.some((s) => s.plant === 'Mizuna'));
  assert.ok(!box.stars.some((s) => s.treated));
  assert.ok(box.later.some((s) => s.plant === 'Spinach'));
});

test('a batch sown from a packet remembers it', () => {
  const state = T.newState();
  const seed = T.SEEDS.find((s) => s.plant === 'Lettuce' && s.variety === 'Parris Island Cos');
  const batch = T.createBatch(state, { seedId: seed.id, cubes: 4, sownOn: SOWN });
  assert.equal(batch.cropId, 'romaine');
  assert.equal(batch.variety, 'Parris Island Cos');
  assert.equal(batch.brand, 'Happy Valley Seeds');
  assert.equal(T.batchesFromSeed(state, seed.id), 1);
  assert.equal(T.batchName(batch), 'Romaine (cos), Parris Island Cos');
  assert.throws(() => T.createBatch(state, { seedId: 99999, cubes: 1, sownOn: SOWN }), /isn’t in the seed box/);
});

test('the header names the date’s season', () => {
  assert.equal(T.seasonLabel('2026-11-09'), 'Spring, hot growing season');
  assert.equal(T.seasonLabel('2027-01-15'), 'Summer, hot growing season');
  assert.equal(T.seasonLabel('2027-04-10'), 'Autumn, in-between growing season');
  assert.equal(T.seasonLabel('2027-07-01'), 'Winter, cool growing season');
  assert.equal(T.seasonLabel('2027-10-01'), 'Spring, in-between growing season');
});

test('seed choices change with the date and hold only in-season packets', () => {
  const { settings } = T.newState();
  for (const today of ['2026-11-09', '2027-01-15', '2027-04-10', '2027-07-01', '2027-10-01']) {
    const picker = T.seedPicker(today, settings);
    for (const seed of [...picker.stars, ...picker.tries, ...picker.treated]) {
      assert.equal(T.seedInWindow(seed, today), true, `${seed.plant} on ${today}`);
      assert.notEqual(seed.status, 'On order');
    }
    assert.ok(picker.stars.length > 0, today);
    assert.ok(!picker.stars.some((s) => s.treated) && !picker.tries.some((s) => s.treated));
  }
  const names = (today) => T.seedPicker(today, settings).stars.map((s) => s.plant);
  assert.ok(names('2026-11-09').includes('Basil') && !names('2026-11-09').includes('Spinach'));
  assert.ok(names('2027-04-10').includes('Spinach') && !names('2027-04-10').includes('Basil'));
  assert.ok(!T.seedPicker('2026-11-09', settings).others.some((c) => c.id === 'butterhead'));
  assert.ok(T.seedPicker('2027-07-01', settings).others.some((c) => c.id === 'butterhead'));
});

test('sowing reminders and the forecast skip what is out of season', () => {
  const state = T.newState();
  T.addPlanItem(state, { cropId: 'basil', pods: 8 });
  T.addPlanItem(state, { cropId: 'spinach', pods: 8 });
  assert.deepEqual(T.todayView(state, '2026-11-09').sows.map((s) => s.crop.id), ['basil']);
  assert.deepEqual(T.todayView(state, '2027-04-10').sows.map((s) => s.crop.id), ['spinach']);
  const sown = T.forecast(state, '2026-11-09', 12).flatMap((r) => r.sow.map((s) => s.name));
  assert.ok(sown.includes('Basil') && !sown.includes('Spinach'));
});

test('a paused crop restarts when its season returns', () => {
  const state = T.newState();
  T.addPlanItem(state, { cropId: 'spinach', pods: 8 });
  const sowWeeks = T.forecast(state, '2027-02-01', 12).filter((r) => r.sow.length);
  assert.ok(sowWeeks.length > 0 && sowWeeks[0].start >= '2027-02-22');
});

test('IDs stay unique and in order without a shared counter', () => {
  const ids = Array.from({ length: 500 }, () => T.newId());
  assert.equal(new Set(ids).size, 500);
  assert.deepEqual(ids, ids.slice().sort((a, b) => a - b));
  assert.ok(ids.every(Number.isSafeInteger));
});

test('batch numbers carry on from what another phone added', () => {
  const state = T.newState();
  state.batches.push({ ...T.createBatch(T.newState(), { cropId: 'basil', cubes: 1, sownOn: SOWN }), code: 'Batch 7' });
  assert.equal(T.nextBatchNumber(state), 8);
  assert.equal(T.createBatch(state, { cropId: 'basil', cubes: 1, sownOn: SOWN }).code, 'Batch 8');
});

test('two batches claiming one pod are reported', () => {
  const state = T.newState();
  const first = T.createBatch(state, { cropId: 'basil', cubes: 1, sownOn: SOWN });
  const second = T.createBatch(state, { cropId: 'basil', cubes: 1, sownOn: SOWN });
  T.moveToLights(first, SOWN, 1);
  T.moveToTower(state, first, '2026-11-20', ['1-1']);
  T.moveToLights(second, SOWN, 1);
  second.stages.push({ stage: 'tower', startedOn: '2026-11-20' });
  second.pods = ['1-1'];
  assert.deepEqual(T.podClashes(state), [{ pod: '1-1', codes: ['Batch 1', 'Batch 2'] }]);
});
