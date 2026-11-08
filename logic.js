// Grow rules with no browser code, so they can be tested with `node --test`.
// A batch only moves when you say so: time passing makes a check due, nothing more.
(function (root) {
  const { CROPS, FIT_LABEL } = typeof module !== 'undefined' && module.exports
    ? require('./crops.js')
    : root.TowerCrops;
  const { SEEDS } = typeof module !== 'undefined' && module.exports
    ? require('./seeds.js')
    : root.TowerSeeds;

  const GREENHOUSE_DAYS = 7;
  const MIN_DAYS_IN_TOWER_BEFORE_HARVEST = 14;

  const STAGES = {
    germinating: { label: 'Germinating', care: 'In rockwool under a clear dome at 20–24°C. Mist only when the cube surface starts to dry, and never leave cubes sitting in water. Plain water or very weak feed only.' },
    seedling: { label: 'Under lights', care: 'Lights on about 16 hours, then a full dark period. Feed at half strength at most (EC 500–800 µS/cm, rising to 800–1200 as true leaves appear), with a gentle fan for an hour or two a day.' },
    greenhouse: { label: 'Greenhouse', care: 'Extra growing time. Shade from hot afternoon sun, keep air moving, and check cubes daily because they dry out quickly here.' },
    tower: { label: 'In the tower', care: 'Fed by the reservoir. Keep one plant per pod, and take off yellow leaves as you see them.' },
  };

  const ROUTINES = [
    { id: 'level', label: 'Daily look: water level and flow', how: 'Top up before the pump can run dry, because a low 20 L tank also heats up quickly. Check water is coming from the top, pull yellow leaves, and glance for pests.' },
    { id: 'ph', label: 'Test pH and EC', how: 'Test at the same time each day, before topping up. Log it on the Water screen and follow the advice shown.' },
    { id: 'inspect', label: 'Weekly check: pests, roots, pump inlet', how: 'Check leaf undersides and crowns for pests, and look at roots (white is healthy). Pump off, then clean the inlet filter. Calibrate the pH meter, and turn the tower a quarter turn if light comes from one side.' },
    { id: 'change', label: 'Change the whole reservoir', how: 'Pump off. Empty the tank, wipe the inside, flush the water lines, refill, mix fresh nutrient, then set pH last. Topping up doesn’t replace this.' },
    { id: 'deep', label: 'Deep clean, a section at a time', how: 'A succession tower never stands empty, so clean one section each month as pods come free: rinse pods, clear roots from the water path, and scrub any algae.' },
  ];

  const DEFAULT_SETTINGS = {
    tiers: 10,
    podsPerTier: 5,
    reservoirL: 20,
    location: 'Patio',
    meterUnit: 'USCM',
    nutrientName: 'Origin Hydro Leafy Greens and Herbs',
    partAMlPerL: 5,
    partBMlPerL: 5,
    ecPerMlPerL: 0.18,
    seedAllowancePct: 20,
    intervals: { level: 1, ph: 1, inspect: 7, change: 14, deep: 30 },
  };

  const COOL_MIX = [
    { cropId: 'looseleaf', pods: 24 },
    { cropId: 'romaine', pods: 6 },
    { cropId: 'arugula', pods: 6 },
    { cropId: 'bokchoy', pods: 4 },
    { cropId: 'tatsoi', pods: 4 },
    { cropId: 'watercress', pods: 2 },
    { cropId: 'sorrel', pods: 2 },
  ];

  // Basil, shiso and rocket carry the heat, and EC 1.2–1.6 centres on the label dose.
  const HOT_MIX = [
    { cropId: 'looseleaf', pods: 22 },
    { cropId: 'romaine', pods: 6 },
    { cropId: 'arugula', pods: 6 },
    { cropId: 'basil', pods: 8 },
    { cropId: 'shiso', pods: 4 },
    { cropId: 'nasturtium', pods: 4 },
  ];

  // Two phones can create records offline at once, so IDs can't be a shared counter.
  // These rise over time and have a random part, so they sort in order and don't clash.
  let lastId = 0;
  function newId() {
    lastId = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), lastId + 1);
    return lastId;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function newState() {
    return {
      nextBatchNumber: 1, batches: [], readings: [], careLog: [], plan: [],
      towerStartedOn: null, settings: clone(DEFAULT_SETTINGS),
    };
  }

  // ---- Dates: plain YYYY-MM-DD strings, so clock changes can't shift a day count ----

  function dateToUtc(date) {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function daysBetween(from, to) {
    return Math.round((dateToUtc(to) - dateToUtc(from)) / 86400000);
  }
  function addDays(date, days) {
    return new Date(dateToUtc(date) + days * 86400000).toISOString().slice(0, 10);
  }
  function localToday(now = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  const later = (a, b) => (a > b ? a : b);

  function cropById(id) {
    const crop = CROPS.find((c) => c.id === id);
    if (!crop) throw new Error(`Unknown crop: ${id}`);
    return crop;
  }

  // ---- Pods ----

  function allPods(settings) {
    const pods = [];
    for (let tier = 1; tier <= settings.tiers; tier++) {
      for (let pod = 1; pod <= settings.podsPerTier; pod++) pods.push(`${tier}-${pod}`);
    }
    return pods;
  }
  function podLabel(id) {
    const [tier, pod] = id.split('-');
    return `Tier ${tier}, pod ${pod}`;
  }
  function totalPods(settings) {
    return settings.tiers * settings.podsPerTier;
  }
  function towerBatches(state) {
    return state.batches.filter((b) => b.status === 'growing' && currentStage(b) === 'tower');
  }
  function occupiedPods(state) {
    const map = {};
    for (const batch of towerBatches(state)) {
      for (const pod of batch.pods) map[pod] = batch;
    }
    return map;
  }
  function freePods(state) {
    const used = occupiedPods(state);
    return allPods(state.settings).filter((pod) => !used[pod]);
  }

  // Tall and trailing crops start from the bottom, where they won't shade anything.
  // Two phones offline could fill the same pod. This shows it instead of hiding it.
  function podClashes(state) {
    const seen = {};
    for (const batch of towerBatches(state)) {
      for (const pod of batch.pods) (seen[pod] = seen[pod] || []).push(batch.code);
    }
    return Object.entries(seen).filter(([, codes]) => codes.length > 1).map(([pod, codes]) => ({ pod, codes }));
  }

  function suggestPods(state, crop, count) {
    const free = freePods(state);
    const ordered = crop.placement === 'lower' ? free.slice().reverse() : free;
    return ordered.slice(0, count);
  }

  // ---- Batches ----

  function createBatch(state, input) {
    if (!(input.cubes >= 1)) throw new Error('Enter how many cubes you sowed.');
    const seed = input.seedId ? seedById(input.seedId) : null;
    const fields = seed
      ? { ...input, cropId: seed.cropId, variety: input.variety ?? seed.variety, brand: seed.brand }
      : input;
    cropById(fields.cropId);
    const id = newId();
    const number = nextBatchNumber(state);
    state.nextBatchNumber = number + 1;
    const batch = {
      id,
      code: `Batch ${number}`,
      cropId: fields.cropId,
      variety: fields.variety || '',
      seedId: seed ? seed.id : null,
      brand: fields.brand || '',
      cubes: fields.cubes,
      plants: fields.cubes,
      sownOn: fields.sownOn,
      status: 'growing',
      stages: [{ stage: 'germinating', startedOn: fields.sownOn }],
      pods: [],
      checks: [],
      harvests: [],
      removals: [],
      notes: [],
      finishedOn: null,
      endReason: '',
    };
    state.batches.push(batch);
    return batch;
  }

  // Never reuses a number, even when another phone has added batches since.
  function nextBatchNumber(state) {
    const used = state.batches.map((b) => Number((b.code.match(/\d+/) || [0])[0]));
    return Math.max(state.nextBatchNumber || 1, ...used.map((n) => n + 1));
  }

  function currentEntry(batch) {
    return batch.stages[batch.stages.length - 1];
  }
  function currentStage(batch) {
    return currentEntry(batch).stage;
  }
  function batchName(batch) {
    const crop = cropById(batch.cropId);
    return batch.variety ? `${crop.name}, ${batch.variety}` : crop.name;
  }

  function assertGrowing(batch) {
    if (batch.status !== 'growing') throw new Error(`${batch.code} has already finished.`);
  }
  function assertNotBeforeStage(batch, on) {
    if (on < currentEntry(batch).startedOn) {
      throw new Error(`That date is before this stage started (${currentEntry(batch).startedOn}).`);
    }
  }

  function moveToLights(batch, on, sprouted) {
    assertGrowing(batch);
    assertNotBeforeStage(batch, on);
    if (currentStage(batch) !== 'germinating') throw new Error('Only a germinating batch can go under the lights.');
    if (!Number.isInteger(sprouted) || sprouted < 1) throw new Error('Enter how many cubes sprouted.');
    if (sprouted > batch.cubes) throw new Error(`This batch only has ${batch.cubes} cubes.`);
    batch.plants = sprouted;
    batch.stages.push({ stage: 'seedling', startedOn: on });
  }

  function moveToGreenhouse(batch, on) {
    assertGrowing(batch);
    assertNotBeforeStage(batch, on);
    if (currentStage(batch) !== 'seedling') throw new Error('Only a batch under the lights can move to the greenhouse.');
    batch.stages.push({ stage: 'greenhouse', startedOn: on });
  }

  // Fewer pods than plants is normal: the strong ones go now and the rest either
  // carry on as their own batch ("stay") or go in the compost ("discard").
  function moveToTower(state, batch, on, pods, { rest = 'discard' } = {}) {
    assertGrowing(batch);
    assertNotBeforeStage(batch, on);
    const stage = currentStage(batch);
    if (stage !== 'seedling' && stage !== 'greenhouse') throw new Error('Only seedlings can move to the tower.');
    if (!pods.length) throw new Error('Choose at least one pod.');
    if (pods.length > batch.plants) throw new Error(`This batch only has ${batch.plants} plants.`);
    const valid = allPods(state.settings);
    const used = occupiedPods(state);
    for (const pod of pods) {
      if (!valid.includes(pod)) throw new Error(`${pod} isn’t a pod on this tower.`);
      if (used[pod]) throw new Error(`${podLabel(pod)} is already planted.`);
    }
    const remainder = batch.plants - pods.length;
    let split = null;
    if (remainder > 0 && rest === 'stay') {
      split = clone(batch);
      split.id = newId();
      split.code = nextSplitCode(state, batch);
      split.plants = remainder;
      split.cubes = remainder;
      split.notes = [];
      state.batches.push(split);
    }
    batch.plants = pods.length;
    batch.pods = pods.slice();
    batch.stages.push({ stage: 'tower', startedOn: on });
    return split;
  }

  function nextSplitCode(state, batch) {
    const stem = batch.code.replace(/[a-z]$/, '');
    for (const letter of 'bcdefghijklmnopqrstuvwxyz') {
      const code = `${stem}${letter}`;
      if (!state.batches.some((b) => b.code === code)) return code;
    }
    return `${stem}+`;
  }

  function notReady(batch, on, { recheckInDays = 1, note = '' } = {}) {
    assertGrowing(batch);
    if (!Number.isInteger(recheckInDays) || recheckInDays < 1) throw new Error('Check again in at least 1 day.');
    batch.checks.push({ stage: currentStage(batch), on, recheckOn: addDays(on, recheckInDays), note });
  }

  function assertInTower(batch) {
    assertGrowing(batch);
    if (currentStage(batch) !== 'tower') throw new Error('This batch isn’t in the tower yet.');
  }

  // A picking: the plants stay in their pods and keep growing.
  function logPick(batch, { on, grams = null, notes = '' }) {
    assertInTower(batch);
    assertNotBeforeStage(batch, on);
    batch.harvests.push({ on, grams, notes, final: false });
  }

  // Whole plants come out, harvested or failed. Their pods are free from then on.
  function removePods(batch, { on, pods, harvested = true, grams = null, notes = '' }) {
    assertInTower(batch);
    assertNotBeforeStage(batch, on);
    if (!pods.length) throw new Error('Choose which pods the plants came out of.');
    for (const pod of pods) {
      if (!batch.pods.includes(pod)) throw new Error(`${podLabel(pod)} isn’t part of ${batch.code}.`);
    }
    batch.pods = batch.pods.filter((pod) => !pods.includes(pod));
    batch.plants = batch.pods.length;
    batch.removals.push({ on, pods: pods.slice(), harvested, notes, hadHarvestEntry: harvested });
    if (harvested) batch.harvests.push({ on, grams, notes, final: true });
    if (!batch.pods.length) {
      batch.status = 'finished';
      batch.finishedOn = on;
    }
  }

  function undoRemoval(state, batch) {
    const last = batch.removals[batch.removals.length - 1];
    if (!last) throw new Error('There’s nothing to put back.');
    const used = occupiedPods(state);
    for (const pod of last.pods) {
      if (used[pod]) throw new Error(`${podLabel(pod)} has been replanted, so this can’t be undone.`);
    }
    batch.removals.pop();
    if (last.hadHarvestEntry) {
      const index = batch.harvests.map((h) => h.final && h.on === last.on).lastIndexOf(true);
      if (index >= 0) batch.harvests.splice(index, 1);
    }
    batch.pods = batch.pods.concat(last.pods);
    batch.plants = batch.pods.length;
    batch.status = 'growing';
    batch.finishedOn = null;
  }

  function discardBatch(batch, { on, reason = '' }) {
    assertGrowing(batch);
    if (currentStage(batch) === 'tower') throw new Error('Take plants out of their pods instead.');
    batch.status = 'ended';
    batch.finishedOn = on;
    batch.endReason = reason;
  }

  function undoLastMove(batch) {
    assertGrowing(batch);
    if (batch.stages.length < 2) throw new Error('There’s no move to undo.');
    if (batch.removals.length || batch.harvests.length) {
      throw new Error('This batch already has harvests logged, so the move can’t be undone.');
    }
    const undone = batch.stages.pop();
    if (undone.stage === 'tower') batch.pods = [];
    if (undone.stage === 'seedling') batch.plants = batch.cubes;
  }

  function totalGrams(batch) {
    return batch.harvests.reduce((sum, h) => sum + (h.grams || 0), 0);
  }

  // ---- What's due ----

  const CHECK_LABEL = {
    germinating: 'sprout check',
    seedling: 'readiness check',
    greenhouse: 'readiness check',
    tower: 'harvest check',
  };

  function nextCheck(batch, today) {
    const entry = currentEntry(batch);
    const crop = cropById(batch.cropId);
    const stage = entry.stage;
    let planned;
    let since = entry.startedOn;
    if (stage === 'germinating') planned = addDays(entry.startedOn, crop.germDays);
    else if (stage === 'seedling') planned = addDays(entry.startedOn, crop.seedlingDays);
    else if (stage === 'greenhouse') planned = addDays(entry.startedOn, GREENHOUSE_DAYS);
    else {
      const last = batch.harvests[batch.harvests.length - 1];
      if (last) {
        since = last.on;
        planned = addDays(last.on, crop.regrowDays || 7);
      } else {
        planned = later(
          addDays(batch.sownOn, crop.firstHarvest[0]),
          addDays(entry.startedOn, MIN_DAYS_IN_TOWER_BEFORE_HARVEST),
        );
      }
    }
    const check = batch.checks.filter((c) => c.stage === stage && c.on >= since).pop();
    const dueOn = check ? check.recheckOn : planned;
    const daysLeft = daysBetween(today, dueOn);
    return {
      dueOn, daysLeft, isDue: daysLeft <= 0, overdueBy: Math.max(0, -daysLeft),
      rechecking: Boolean(check), label: CHECK_LABEL[stage],
    };
  }

  function pastPlannedTowerTime(batch, today) {
    if (batch.status !== 'growing' || currentStage(batch) !== 'tower') return false;
    return daysBetween(currentEntry(batch).startedOn, today) >= cropById(batch.cropId).towerDays;
  }

  // ---- The shared reservoir ----

  const round1 = (n) => Math.round(n * 10) / 10;

  // Every crop drinks from one tank, so the target is where their ranges overlap.
  // With little or no overlap, it's the closest compromise, naming who misses out.
  function sharedRange(crops, key) {
    const low = Math.max(...crops.map((c) => c[key][0]));
    const high = Math.min(...crops.map((c) => c[key][1]));
    if (high - low >= 0.2 - 1e-9) {
      return { range: [round1(low), round1(high)], shared: true, outliers: [] };
    }
    const mid = (low + high) / 2;
    const range = [round1(mid - 0.1), round1(mid + 0.1)];
    const outliers = crops
      .filter((c) => c[key][1] < range[0] - 1e-9 || c[key][0] > range[1] + 1e-9)
      .map((c) => c.name);
    return { range, shared: false, outliers };
  }

  function targetForCrops(crops) {
    if (!crops.length) return null;
    return {
      ph: sharedRange(crops, 'ph'),
      ec: sharedRange(crops, 'ec'),
      pumpOffMinutes: Math.min(...crops.map((c) => c.off)),
      lightHours: [Math.max(...crops.map((c) => c.light[0])), Math.max(...crops.map((c) => c.light[1]))],
      crops: crops.map((c) => c.name),
    };
  }

  // Follows what's in the tower. An empty tower falls back to the plan, then to a
  // general salad range so a newly filled tank still has something to aim for.
  function reservoirTarget(state, today) {
    const inTower = towerBatches(state);
    const planned = state.plan.map((item) => cropById(item.cropId));
    const unique = (list) => [...new Map(list.map((c) => [c.id, c])).values()];
    let target;
    let basis;
    if (inTower.length) {
      target = targetForCrops(unique(inTower.map((b) => cropById(b.cropId))));
      basis = 'tower';
    } else if (planned.length) {
      target = targetForCrops(unique(planned));
      basis = 'plan';
    } else {
      target = targetForCrops([cropById('looseleaf')]);
      basis = 'default';
    }
    const justPlanted = inTower.some((b) => daysBetween(currentEntry(b).startedOn, today) < 7);
    return { ...target, basis, justPlanted };
  }

  // ---- Meter units: readings are stored as EC in mS/cm ----

  const METER_UNITS = {
    EC: { label: 'EC (mS/cm)', perEc: 1, step: '0.1', digits: 1 },
    USCM: { label: 'EC (µS/cm)', perEc: 1000, step: '10', digits: 0 },
    CF: { label: 'CF', perEc: 10, step: '1', digits: 0 },
    PPM500: { label: 'PPM (500 scale)', perEc: 500, step: '10', digits: 0 },
    PPM700: { label: 'PPM (700 scale)', perEc: 700, step: '10', digits: 0 },
  };
  function toEc(value, unit) {
    return value / METER_UNITS[unit].perEc;
  }
  // 1400 typed as mS/cm can only mean 1.4, and 1.4 typed as µS/cm can only mean 1400.
  function readingToEc(value, unit) {
    if (unit === 'EC' && value >= 20) return value / 1000;
    if (unit === 'USCM' && value < 20) return value;
    return toEc(value, unit);
  }
  function fromEc(ec, unit) {
    const u = METER_UNITS[unit];
    return Number((ec * u.perEc).toFixed(u.digits));
  }

  // ---- Readings ----

  function logReading(state, { on, ph = null, ec = null, waterTemp = null, addedL = null, note = '' }) {
    if (ph == null && ec == null && waterTemp == null && !addedL) throw new Error('Enter at least one reading.');
    if (ph != null && (ph < 0 || ph > 14)) throw new Error('pH must be between 0 and 14.');
    if (ec != null && (ec < 0 || ec > 10)) throw new Error('That EC looks wrong. Check your meter’s units in Settings.');
    const reading = { id: newId(), on, ph, ec, waterTemp, addedL, note };
    state.readings.push(reading);
    state.readings.sort((a, b) => (a.on === b.on ? a.id - b.id : a.on < b.on ? -1 : 1));
    return reading;
  }

  function latestReading(state) {
    return state.readings[state.readings.length - 1] || null;
  }

  // What to do about one reading, most urgent first. `previous` adds the trend.
  function adviseReading(reading, target, previous, unit = 'EC', settings = null) {
    const items = [];
    const add = (level, title, text) => items.push({ level, title, text });
    const ecText = (n) => `${fromEc(n, unit)}`;

    if (reading.ph != null) {
      const [lo, hi] = target.ph.range;
      const aim = `${lo.toFixed(1)}–${hi.toFixed(1)}`;
      if (reading.ph < lo) {
        add(reading.ph < 5.0 ? 'urgent' : 'act', `pH ${reading.ph} is low (aim for ${aim})`,
          'Add a few drops of pH Up, mix, run the pump for 15–30 minutes, then retest. Move it no more than 0.5 in a day, because pH overshoots easily in 20 L.');
      } else if (reading.ph > hi) {
        add(reading.ph > 7.0 ? 'urgent' : 'act', `pH ${reading.ph} is high (aim for ${aim})`,
          'Add a few drops of pH Down, mix, run the pump for 15–30 minutes, then retest. Move it no more than 0.5 in a day. High pH locks up iron, which shows as yellowing new leaves.');
      } else add('ok', `pH ${reading.ph} is on target`, '');
    }

    if (reading.ec != null) {
      const [lo, hi] = target.ec.range;
      const shown = `${ecText(reading.ec)} (aim for ${ecText(lo)}–${ecText(hi)})`;
      if (reading.ec < lo) {
        const ml = settings ? doseToRaiseEc(settings, (lo + hi) / 2 - reading.ec) : null;
        add('act', `Nutrient strength ${shown} is low`, ml
          ? `Add about ${ml} ml of part A, mix well, then ${ml} ml of part B (worked out for a full ${settings.reservoirL} L tank). Retest EC, then pH, because nutrient shifts pH.`
          : 'Add part A, mix well, then the same amount of part B, a little at a time. Retest EC, then pH, because nutrient shifts pH.');
      } else if (reading.ec > hi) {
        add(reading.ec > hi + 0.5 ? 'urgent' : 'act', `Nutrient strength ${shown} is high`,
          'Add plain water to bring it down, then retest. Too-strong solution causes wilting and tip burn.');
      } else add('ok', `Nutrient strength ${shown} is on target`, '');
    }

    if (reading.waterTemp != null) {
      if (reading.waterTemp > 26) {
        add('urgent', `Water at ${reading.waterTemp}°C is too warm`,
          'Warm water holds little oxygen and invites root rot. Keep the tank full, shade it, and use cooler top-up water. Lettuce will bolt soon if this continues.');
      } else if (reading.waterTemp > 24) {
        add('act', `Water at ${reading.waterTemp}°C is getting warm`,
          'Aim for 18–22°C. Keep the tank full and shaded, since a low tank heats up fastest.');
      } else if (reading.waterTemp < 14) {
        add('act', `Water at ${reading.waterTemp}°C is cold`, 'Growth will be slow and plants take up less. Expect harvests to run late.');
      }
    }

    if (previous && reading.ec != null && previous.ec != null && daysBetween(previous.on, reading.on) <= 7) {
      const change = reading.ec - previous.ec;
      if (change >= 0.2 - 1e-9) {
        add('info', 'EC is climbing',
          'Plants are drinking more water than food. Top up with plain or weak solution, not a full dose.');
      } else if (change <= -0.2 + 1e-9) {
        add('info', 'EC is falling',
          'Plants are feeding hard, which is normal for a tower full of growing plants. Top up with slightly stronger solution.');
      }
    }

    const rank = { urgent: 0, act: 1, info: 2, ok: 3 };
    return items.sort((a, b) => rank[a.level] - rank[b.level]);
  }

  // Uses the label's figure for how much each ml per litre lifts EC, rounded to 5 ml.
  function doseToRaiseEc(settings, ecRise, volumeL = settings.reservoirL) {
    if (!(settings.ecPerMlPerL > 0) || !(ecRise > 0)) return null;
    return Math.max(5, Math.round(((ecRise / settings.ecPerMlPerL) * volumeL) / 5) * 5);
  }

  // Doses come only from the label you enter, because products differ too much to guess.
  function mixAmounts(settings, volumeL = settings.reservoirL, strength = 1) {
    const { partAMlPerL: a, partBMlPerL: b } = settings;
    if (!(a > 0) || !(b > 0)) return null;
    const amount = (rate) => Math.round(rate * volumeL * strength * 10) / 10;
    return { a: amount(a), b: amount(b) };
  }

  // ---- Routine care ----

  function startTower(state, on) {
    state.towerStartedOn = on;
    logCare(state, 'change', on);
  }

  function logCare(state, routine, on) {
    if (!ROUTINES.some((r) => r.id === routine)) throw new Error(`Unknown job: ${routine}`);
    state.careLog.push({ id: newId(), routine, on });
  }

  function lastDone(state, routineId) {
    const dates = state.careLog.filter((c) => c.routine === routineId).map((c) => c.on);
    if (routineId === 'ph') {
      for (const r of state.readings) if (r.ph != null || r.ec != null) dates.push(r.on);
    }
    if (routineId === 'level') {
      for (const r of state.readings) if (r.addedL > 0) dates.push(r.on);
    }
    return dates.length ? dates.reduce(later) : null;
  }

  function routineStatus(state, today) {
    if (!state.towerStartedOn) return [];
    return ROUTINES.map((routine) => {
      const last = lastDone(state, routine.id);
      const dueOn = addDays(last || state.towerStartedOn, state.settings.intervals[routine.id]);
      const daysLeft = daysBetween(today, dueOn);
      return { ...routine, lastDone: last, dueOn, daysLeft, isDue: daysLeft <= 0 };
    });
  }

  // ---- The succession plan ----

  function addPlanItem(state, { cropId, pods, intervalDays }) {
    const crop = cropById(cropId);
    if (state.plan.some((item) => item.cropId === cropId)) throw new Error(`${crop.name} is already in the plan.`);
    if (!Number.isInteger(pods) || pods < 1) throw new Error('Enter how many pods to give this crop.');
    const item = { id: newId(), cropId, pods, intervalDays: intervalDays || crop.interval, skipUntil: null };
    state.plan.push(item);
    return item;
  }

  function starterMixFor(today) {
    const month = Number(today.slice(5, 7));
    return month >= 11 || month <= 2
      ? {
        items: HOT_MIX,
        note: 'For a Gold Coast summer, all from your seed box: Heirloom Mix lettuce, Parris Island Cos, rocket, basil, shiso and nasturtium. EC suits your nutrient’s label dose, though pH has to sit right at 6.0 to suit both lettuce and basil. Pick lettuce young, as it’ll be working against the heat.',
      }
      : {
        items: COOL_MIX,
        note: 'For the cooler months, all from your seed box: lettuce, Parris Island Cos, rocket, pak choi, tatsoi, watercress and sorrel. They share a pH and EC range, so one tank suits them all.',
      };
  }

  function loadStarterMix(state, today = '2026-07-01') {
    for (const entry of starterMixFor(today).items) {
      if (!state.plan.some((item) => item.cropId === entry.cropId)) addPlanItem(state, entry);
    }
  }

  // To keep P pods full when each plant stays T days, plant P x (interval / T) each
  // round. A few extra cubes cover seed that doesn't sprout or seedlings that fail.
  function batchSize(item, settings) {
    const crop = cropById(item.cropId);
    const pods = Math.min(item.pods, Math.max(1, Math.round((item.pods * item.intervalDays) / crop.towerDays)));
    return { pods, cubes: Math.ceil(pods * (1 + settings.seedAllowancePct / 100)) };
  }

  // ---- The seed box ----

  function seedById(id) {
    const seed = SEEDS.find((s) => s.id === Number(id));
    if (!seed) throw new Error('That packet isn’t in the seed box.');
    return seed;
  }

  function seedsForCrop(cropId) {
    return SEEDS.filter((s) => s.cropId === cropId);
  }

  function seedLabel(seed) {
    return seed.variety ? `${seed.plant}, ${seed.variety}` : seed.plant;
  }

  // Pip's sheet says what to sow "now" (spring into summer), hold for "autumn" (from
  // March), or both. Autumn seed stays in season through the cool months, because
  // winter is the prime lettuce time here. These ranges are a reading of those words.
  function seedInWindow(seed, today) {
    const month = Number(today.slice(5, 7));
    if (seed.when === 'Now or autumn') return true;
    const warmHalf = month >= 9 || month <= 2;
    return seed.when === 'Autumn' ? !warmHalf : warmHalf;
  }

  function seedWindowText(seed, today) {
    if (seedInWindow(seed, today)) return 'Good to sow now';
    if (seed.when === 'Autumn') return 'Your sheet says to hold this until March';
    return 'Your sheet has this for spring into summer';
  }

  // Warnings that apply to one packet right now. Treated seed comes first.
  function seedWarnings(seed, today) {
    const warnings = [];
    if (seed.treated) {
      warnings.push('Thiram-coated seed. Wear gloves, as your notes say. It’s a fungicide, so this packet is left out of suggestions, and an untreated packet is the safer choice for a shared food tank. If you do sow it, raise the cubes in their own tray, and keep that water out of the tank.');
    }
    if (seed.status === 'On order') warnings.push('This packet is still on order.');
    if (!seedInWindow(seed, today)) warnings.push(`${seedWindowText(seed, today)}. It may struggle if you sow it now.`);
    return warnings;
  }

  // The packet to reach for first: in the box, untreated and in season, if possible.
  function bestSeedFor(cropId, today) {
    const score = (s) => (s.status === 'On order' ? 0 : 4) + (s.treated ? 0 : 2) + (seedInWindow(s, today) ? 1 : 0);
    return seedsForCrop(cropId).slice().sort((a, b) => score(b) - score(a))[0] || null;
  }

  function seedBox(today) {
    const usable = (s) => s.status !== 'On order' && !s.treated;
    const ready = SEEDS.filter((s) => seedInWindow(s, today) && usable(s));
    return {
      stars: ready.filter((s) => s.tier === 'star'),
      tries: ready.filter((s) => s.tier === 'try'),
      later: SEEDS.filter((s) => !seedInWindow(s, today) && usable(s)),
      flagged: SEEDS.filter((s) => !usable(s)),
    };
  }

  // Packets count as in season by Pip's calendar. A crop with no packet falls back
  // on its own cool, mild or warm season.
  function cropInSeason(cropId, today, settings) {
    const seeds = seedsForCrop(cropId);
    if (seeds.length) return seeds.some((s) => seedInWindow(s, today));
    return !seasonWarning(cropById(cropId), today, settings);
  }

  // What the sow form offers: only what's in season and actually in the box.
  function seedPicker(today, settings) {
    const inSeason = SEEDS.filter((s) => seedInWindow(s, today) && s.status !== 'On order');
    return {
      stars: inSeason.filter((s) => s.tier === 'star' && !s.treated),
      tries: inSeason.filter((s) => s.tier === 'try' && !s.treated),
      treated: inSeason.filter((s) => s.treated),
      others: CROPS.filter((c) => !seedsForCrop(c.id).length && cropInSeason(c.id, today, settings)),
    };
  }

  function batchesFromSeed(state, seedId) {
    return state.batches.filter((b) => b.seedId === seedId).length;
  }

  function cubesPerWeek(state) {
    return state.plan.reduce(
      (sum, item) => sum + (batchSize(item, state.settings).cubes * 7) / item.intervalDays,
      0,
    );
  }

  function nextSowOn(state, item, today) {
    const lastSown = state.batches
      .filter((b) => b.cropId === item.cropId)
      .map((b) => b.sownOn)
      .reduce((a, b) => later(a, b), '');
    let date = lastSown ? addDays(lastSown, item.intervalDays) : today;
    if (item.skipUntil) date = later(date, item.skipUntil);
    return date;
  }

  function skipSowing(item, today) {
    item.skipUntil = addDays(today, item.intervalDays);
  }

  function planTotalPods(state) {
    return state.plan.reduce((sum, item) => sum + item.pods, 0);
  }

  function daysToTower(crop) {
    return crop.germDays + crop.seedlingDays;
  }

  // Where everything already growing is expected to sit in the tower.
  function committedSpans(state, today) {
    const allowance = 1 + state.settings.seedAllowancePct / 100;
    const spans = [];
    for (const batch of state.batches) {
      if (batch.status !== 'growing') continue;
      const crop = cropById(batch.cropId);
      const entry = currentEntry(batch);
      const name = crop.name;
      if (entry.stage === 'tower') {
        spans.push({
          name, inOn: entry.startedOn, pods: batch.pods.length, sowOn: null, committed: true,
          outOn: later(addDays(entry.startedOn, crop.towerDays), addDays(today, 7)),
        });
        continue;
      }
      let inOn;
      let pods = batch.plants;
      if (entry.stage === 'germinating') {
        inOn = addDays(later(today, addDays(entry.startedOn, crop.germDays)), crop.seedlingDays);
        pods = Math.max(1, Math.round(batch.plants / allowance));
      } else if (entry.stage === 'seedling') {
        inOn = later(today, addDays(entry.startedOn, crop.seedlingDays));
      } else {
        inOn = later(today, addDays(entry.startedOn, GREENHOUSE_DAYS));
      }
      spans.push({ name, inOn, pods, sowOn: null, committed: true, outOn: addDays(inOn, crop.towerDays) });
    }
    return spans;
  }

  function plannedSpans(state, today, untilDate) {
    const spans = [];
    for (const item of state.plan) {
      const crop = cropById(item.cropId);
      const size = batchSize(item, state.settings);
      let sowOn = later(nextSowOn(state, item, today), today);
      while (sowOn <= untilDate) {
        const inOn = addDays(sowOn, daysToTower(crop));
        if (cropInSeason(crop.id, sowOn, state.settings)) {
          spans.push({
            name: crop.name, sowOn, inOn, outOn: addDays(inOn, crop.towerDays),
            pods: size.pods, cubes: size.cubes, committed: false,
          });
        }
        sowOn = addDays(sowOn, item.intervalDays);
      }
    }
    return spans;
  }

  function podsInUseOn(spans, date) {
    return spans.reduce((sum, s) => (s.inOn <= date && s.outOn > date ? sum + s.pods : sum), 0);
  }

  function podsFreeOn(state, today, date) {
    return totalPods(state.settings) - podsInUseOn(committedSpans(state, today), date);
  }

  function forecast(state, today, weeks = 12) {
    const until = addDays(today, weeks * 7);
    const spans = committedSpans(state, today).concat(plannedSpans(state, today, until));
    const total = totalPods(state.settings);
    const rows = [];
    for (let i = 0; i < weeks; i++) {
      const start = addDays(today, i * 7);
      const end = addDays(start, 6);
      const within = (date) => date && date >= start && date <= end;
      const inUse = podsInUseOn(spans, end);
      rows.push({
        start, end, inUse,
        free: total - inUse,
        over: Math.max(0, inUse - total),
        sow: spans.filter((s) => within(s.sowOn)),
        goingIn: spans.filter((s) => within(s.inOn)).reduce((sum, s) => sum + s.pods, 0),
        comingOut: spans.filter((s) => within(s.outOn)).reduce((sum, s) => sum + s.pods, 0),
      });
    }
    return rows;
  }

  // ---- Season: tuned for the Gold Coast, on a patio the tower can roll around ----

  function seasonOf(today) {
    const month = Number(today.slice(5, 7));
    if (month >= 11 || month <= 3) return 'hot';
    if (month === 4 || month === 10) return 'warm';
    return 'cool';
  }

  const SEASONS = {
    hot: {
      name: 'Hot season (November to March)',
      where: 'Bright shade, no direct afternoon sun',
      tips: [
        'Keep it in bright indirect light. Morning sun is fine, but never hot afternoon sun. Add shade cloth if it needs to sit anywhere sunnier.',
        'Shade the tank and keep it full, because warm water is the biggest risk now. Aim for under 24°C, and don’t let it pass 26°C, or roots can rot.',
        'Run EC at the low end of the range, and expect to top up often.',
        'Sow somewhere cool, ideally indoors at 20–24°C. Lettuce seed may not sprout in a hot room.',
        'Pick lettuce young and choose slow-bolting varieties.',
        'Roll it under cover and lock the wheels before storms, since it’s tall and light.',
      ],
      greenhouse: 'It’s the hot season, so a small greenhouse can quickly get too hot for seedlings. Open it right up and use shade cloth. If it’s over about 30°C inside, bright shade on the patio is the better place.',
    },
    warm: {
      name: 'In-between season (April and October)',
      where: 'Morning sun, afternoon shade',
      tips: [
        'Give it morning sun and shade from early afternoon.',
        'If plants look leggy or pale, roll it somewhere brighter.',
        'This is a good time to sow lettuce and other salad greens.',
      ],
      greenhouse: 'Ventilate the greenhouse during the day, and shade seedlings from strong afternoon sun.',
    },
    cool: {
      name: 'Cool season (May to September)',
      where: 'Direct sun for much of the day',
      tips: [
        'Prime lettuce weather. Roll it into direct sun for much of the day, because indirect light may leave plants leggy now.',
        'Turn it a quarter turn each week so every side gets light.',
        'Growth slows in the coolest weeks, so harvests may run a little late. Basil will slow down the most.',
      ],
      greenhouse: 'The greenhouse should suit seedlings well now. Ventilate it on warm, sunny days.',
    },
  };

  function calendarSeason(today) {
    const month = Number(today.slice(5, 7));
    if (month >= 9 && month <= 11) return 'Spring';
    if (month === 12 || month <= 2) return 'Summer';
    return month <= 5 ? 'Autumn' : 'Winter';
  }

  function seasonLabel(today) {
    const growing = { hot: 'hot growing season', warm: 'in-between growing season', cool: 'cool growing season' }[seasonOf(today)];
    return `${calendarSeason(today)}, ${growing}`;
  }

  function seasonAdvice(today, settings) {
    if (settings && settings.location === 'Indoors') return null;
    return { key: seasonOf(today), ...SEASONS[seasonOf(today)] };
  }

  function seasonWarning(crop, today, settings) {
    if (settings.location === 'Indoors') return '';
    const season = seasonOf(today);
    if (season === 'hot' && crop.season === 'cool') {
      return `${crop.name} prefers cool weather and can bolt in Gold Coast heat. Choose a heat-tolerant or slow-bolting variety, keep it out of afternoon sun, and pick it young.`;
    }
    if (season === 'cool' && crop.season === 'warm') {
      return `${crop.name} is a warm-season crop and will grow slowly through the coolest months.`;
    }
    return '';
  }

  // ---- The Today screen ----

  function todayView(state, today) {
    const growing = state.batches.filter((b) => b.status === 'growing');
    const byDue = (a, b) => (nextCheck(a, today).dueOn < nextCheck(b, today).dueOn ? -1 : 1);
    const sows = state.plan
      .map((item) => {
        const crop = cropById(item.cropId);
        const reachesTower = addDays(today, daysToTower(crop));
        const seed = bestSeedFor(crop.id, today);
        return {
          item, crop, seed,
          warnings: seed ? seedWarnings(seed, today) : [],
          size: batchSize(item, state.settings),
          dueOn: nextSowOn(state, item, today),
          reachesTower,
          freeThen: podsFreeOn(state, today, reachesTower),
          season: seed ? '' : seasonWarning(crop, today, state.settings),
        };
      })
      .filter((sow) => sow.dueOn <= today && cropInSeason(sow.crop.id, today, state.settings));
    return {
      sows,
      checks: growing.filter((b) => nextCheck(b, today).isDue).sort(byDue),
      care: routineStatus(state, today).filter((r) => r.isDue),
      growing: growing.slice().sort(byDue),
    };
  }

  const api = {
    CROPS, SEEDS, FIT_LABEL, STAGES, ROUTINES, DEFAULT_SETTINGS, METER_UNITS, GREENHOUSE_DAYS,
    newState, daysBetween, addDays, localToday, cropById,
    allPods, podLabel, totalPods, towerBatches, occupiedPods, freePods, suggestPods, podClashes, nextBatchNumber, newId,
    createBatch, currentEntry, currentStage, batchName,
    moveToLights, moveToGreenhouse, moveToTower, notReady, logPick, removePods, undoRemoval,
    discardBatch, undoLastMove, totalGrams, nextCheck, pastPlannedTowerTime,
    targetForCrops, reservoirTarget, toEc, fromEc, readingToEc, doseToRaiseEc,
    logReading, latestReading, adviseReading, mixAmounts,
    startTower, logCare, lastDone, routineStatus,
    addPlanItem, starterMixFor, loadStarterMix, batchSize, cubesPerWeek, nextSowOn, skipSowing, planTotalPods, daysToTower,
    seedById, seedsForCrop, seedLabel, seedInWindow, seedWindowText, seedWarnings, bestSeedFor, seedBox, cropInSeason, seedPicker, batchesFromSeed,
    podsFreeOn, forecast, seasonOf, calendarSeason, seasonLabel, seasonAdvice, seasonWarning, todayView,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tower = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
