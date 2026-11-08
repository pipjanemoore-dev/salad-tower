// Screens and event handling. All the grow rules live in logic.js.
(function () {
  const { CROPS, STAGES, METER_UNITS } = Tower;
  const { GUIDE } = TowerGuide;
  const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
  const debugParams = new URLSearchParams(isLocalHost ? location.search : '');
  // Separate storage per pretend phone, for testing two phones on one computer.
  const STORAGE_KEY = debugParams.get('phone') ? `salad-tower-${debugParams.get('phone')}` : 'salad-tower';
  const SYNC_LABEL = {
    synced: 'Synced',
    saving: 'Saving',
    offline: 'Offline, will sync',
    waiting: 'Waiting for internet',
    unavailable: 'Offline, will sync',
    error: 'Sync problem',
  };
  const INTERVAL_CHOICES = [7, 10, 14, 21, 28, 42, 60, 90, 120, 180, 270];
  const app = document.getElementById('app');

  let flash = '';
  let state = load();
  let panel = null; // The open form on a batch: { id, kind }.
  let prefill = null; // Crop and cube count carried from a "Sow now" button.
  let renderedOn = Tower.localToday();
  let renderPending = false; // Another phone changed something while a form was open.
  const sync = {
    enabled: Boolean(window.TOWER_FIREBASE) || debugParams.has('fake'),
    signedIn: null,
    email: '',
    status: '',
    error: '',
    signIn: null,
    signOut: null,
  };

  function load() {
    const fresh = Tower.newState();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return fresh;
    try {
      return mergeSaved(fresh, JSON.parse(saved));
    } catch (error) {
      // Keep unreadable data rather than overwriting it on the next save.
      localStorage.setItem(`${STORAGE_KEY}-unreadable-${Date.now()}`, saved);
      flash = 'Your saved data could not be read. A copy was kept, and the app has started empty.';
      return fresh;
    }
  }

  function mergeSaved(fresh, data) {
    return {
      ...fresh,
      ...data,
      settings: {
        ...fresh.settings,
        ...Object.fromEntries(Object.entries(data.settings || {}).filter(([, v]) => v != null && v !== '')),
        intervals: { ...fresh.settings.intervals, ...(data.settings && data.settings.intervals) },
      },
    };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (window.TowerApp.onLocalChange) window.TowerApp.onLocalChange();
  }

  function isEditing() {
    const active = document.activeElement;
    return Boolean(panel) || Boolean(active && active.closest && active.closest('form'));
  }

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const today = () => Tower.localToday();
  const findBatch = (id) => state.batches.find((b) => b.id === Number(id));
  const number = (value) => (value === '' || value == null ? null : Number(value));
  const unit = () => state.settings.meterUnit;
  const unitLabel = () => METER_UNITS[unit()].label;
  const ecShort = () => ({ EC: 'EC', USCM: 'EC', CF: 'CF' }[unit()] || 'PPM');
  const showEc = (ec) => Tower.fromEc(ec, unit());

  function formatDate(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  }

  function cropChip(crop) {
    return `<span class="chip" style="background:${esc(crop.colour)}">${esc(crop.short)}</span>`;
  }

  function batchTitle(batch, side = '') {
    const crop = Tower.cropById(batch.cropId);
    return `<div class="grow-title">
      ${cropChip(crop)}
      <h3>${esc(Tower.batchName(batch))}</h3>
      <span class="subtle">${side || esc(batch.code)}</span>
    </div>`;
  }

  function countdownText(check) {
    if (check.isDue) {
      return check.overdueBy
        ? { big: `${days(check.overdueBy)} overdue`, small: check.label }
        : { big: 'Check today', small: check.label };
    }
    return { big: days(check.daysLeft), small: `until ${check.label}` };
  }

  function dateField(batch, labelText = 'Date') {
    const started = Tower.currentEntry(batch).startedOn;
    return `<label>${esc(labelText)}
      <input type="date" name="on" value="${today()}" min="${started}" max="${today()}" required>
    </label>`;
  }

  // ---- The readiness question for each stage ----

  const PROMPTS = {
    germinating: {
      question: 'Have they sprouted?',
      lookFor: ['A seedling with open seed leaves in most cubes', 'A pale root heading down into the cube'],
      then: 'Take the dome off by about day 7 and get them under lights straight away, so they stay short and sturdy.',
    },
    seedling: {
      question: 'Ready to leave the lights?',
      lookFor: ['2–4 true leaves, not just the first seed leaves', 'Roots coming through the cube by about 1.5–2.5 cm', 'Plug is intact, and the stem is sturdy. Height alone isn’t the test'],
      then: 'Choose the tower if they’re ready and a pod is free. Choose the greenhouse if they need more time.',
    },
    greenhouse: {
      question: 'Ready for the tower?',
      lookFor: ['2–4 true leaves or more', 'Roots coming through the cube by about 1.5–2.5 cm', 'Looks settled in real light, with no scorched leaves'],
      then: 'Have water running first, hold the plug rather than the stem, and shade for a day or two if the tower is in direct sun.',
    },
  };

  function promptFor(batch) {
    const stage = Tower.currentStage(batch);
    if (stage !== 'tower') return PROMPTS[stage];
    const crop = Tower.cropById(batch.cropId);
    const old = Tower.pastPlannedTowerTime(batch, today());
    return {
      question: batch.harvests.length ? 'Ready to pick again?' : 'Ready for a first harvest?',
      lookFor: [crop.cue].concat(old
        ? [`These have been in the tower for ${crop.towerDays} days or more. If they’re bitter, woody or stretching upwards, take them out and free the pods.`]
        : []),
      then: 'Pick in the coolest part of the day and refrigerate promptly.',
    };
  }

  function transitionPrompt(batch) {
    const stage = Tower.currentStage(batch);
    const crop = Tower.cropById(batch.cropId);
    const prompt = promptFor(batch);
    const open = panel && panel.id === batch.id ? panel.kind : null;
    const button = (kind, label, primary) =>
      `<button type="button" class="${primary ? 'primary' : ''}" data-action="panel" data-kind="${kind}" data-id="${batch.id}">${esc(label)}</button>`;

    let buttons = '';
    if (stage === 'germinating') {
      buttons = button('sprout', 'Yes, move under the lights', true) + button('notyet', 'Not yet');
    } else if (stage === 'seedling') {
      buttons = button('tower', 'Ready: move to the tower', true)
        + button('greenhouse', 'Needs more time: greenhouse')
        + button('notyet', 'Not yet: stay under the lights');
    } else if (stage === 'greenhouse') {
      buttons = button('tower', 'Ready: move to the tower', true) + button('notyet', 'Not yet: stay in the greenhouse');
    } else {
      if (crop.harvest !== 'whole') buttons += button('pick', 'Picked some: plants stay', true);
      buttons += button('remove', crop.harvest === 'whole' ? 'Harvest: plants come out' : 'Plants come out', crop.harvest === 'whole');
      buttons += button('notyet', 'Not yet');
    }

    const forms = {
      sprout: sproutPanel, greenhouse: greenhousePanel, tower: towerPanel,
      pick: pickPanel, remove: removePanel, notyet: notYetPanel,
    };
    return `
      <p><strong>${esc(prompt.question)}</strong></p>
      <ul>${prompt.lookFor.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      <p class="then">${esc(prompt.then)}</p>
      <div class="actions stack">${buttons}</div>
      ${forms[open] ? forms[open](batch) : ''}`;
  }

  function sproutPanel(batch) {
    return `<form class="panel" data-form="sprout" data-id="${batch.id}">
      <label>How many cubes sprouted?
        <input type="number" name="count" min="1" max="${batch.cubes}" step="1" inputmode="numeric" value="${batch.cubes}" required>
      </label>
      ${dateField(batch, 'Date moved')}
      <button class="primary">Save, under the lights</button>
    </form>`;
  }

  function greenhousePanel(batch) {
    return `<form class="panel" data-form="greenhouse" data-id="${batch.id}">
      <p class="then">Plants coming from indoor lights take a few days to adjust. Shade from hot afternoon sun at first, and check cubes daily, because they dry out faster here.</p>
      ${Tower.seasonAdvice(today(), state.settings) ? `<p class="warn">${esc(Tower.seasonAdvice(today(), state.settings).greenhouse)}</p>` : ''}
      ${dateField(batch, 'Date moved')}
      <button class="primary">Save, in the greenhouse</button>
    </form>`;
  }

  function notYetPanel(batch) {
    return `<form class="panel" data-form="notyet" data-id="${batch.id}">
      <label>Check again in
        <select name="recheck">
          ${[1, 2, 3, 5, 7].map((n) => `<option value="${n}"${n === 2 ? ' selected' : ''}>${days(n)}</option>`).join('')}
        </select>
      </label>
      <label>What did you see? <span class="hint">Optional</span>
        <input name="note" maxlength="300">
      </label>
      <button class="primary">Save, not ready yet</button>
    </form>`;
  }

  function podGrid(cell) {
    const { tiers, podsPerTier } = state.settings;
    let html = `<div class="pods" style="grid-template-columns:2.6rem repeat(${podsPerTier},1fr)">`;
    for (let tier = 1; tier <= tiers; tier++) {
      html += `<div class="tier">Tier ${tier}</div>`;
      for (let pod = 1; pod <= podsPerTier; pod++) html += cell(`${tier}-${pod}`);
    }
    return `${html}</div>`;
  }

  function towerPanel(batch) {
    const crop = Tower.cropById(batch.cropId);
    const used = Tower.occupiedPods(state);
    const suggested = Tower.suggestPods(state, crop, batch.plants);
    const free = Tower.freePods(state).length;
    if (!free) {
      return `<div class="panel"><p><strong>The tower is full.</strong> Take some plants out first, or send these to the greenhouse until pods come free.</p></div>`;
    }
    const remainder = batch.plants - suggested.length;
    return `<form class="panel" data-form="tower" data-id="${batch.id}" data-plants="${batch.plants}">
      ${dateField(batch, 'Date moved')}
      <fieldset>
        <legend>Which pods? <span class="subtle pod-count">${suggested.length} of ${plural(batch.plants, 'plant')} chosen</span></legend>
        <p class="subtle">Suggested for ${esc(crop.name)}: ${crop.placement === 'lower' ? 'low on the tower, so it won’t shade the others' : `${esc(crop.placement)} tiers`}. Tier 1 is the top.</p>
        ${podGrid((id) => {
          const holder = used[id];
          if (holder) {
            const c = Tower.cropById(holder.cropId);
            return `<div class="pod taken" style="background:${esc(c.colour)}" title="${esc(Tower.podLabel(id))}: ${esc(c.name)}">${esc(c.short)}</div>`;
          }
          return `<label class="pod pick" title="${esc(Tower.podLabel(id))}">
            <input type="checkbox" name="pods" value="${esc(id)}"${suggested.includes(id) ? ' checked' : ''} aria-label="${esc(Tower.podLabel(id))}">
            <span aria-hidden="true">${esc(id.split('-')[1])}</span>
          </label>`;
        })}
      </fieldset>
      <fieldset class="rest-block"${remainder > 0 ? '' : ' hidden'}>
        <legend>The plants not going in</legend>
        <label class="check-option"><input type="radio" name="rest" value="stay" checked>Keep growing as their own batch</label>
        <label class="check-option"><input type="radio" name="rest" value="discard">Compost them</label>
      </fieldset>
      <button class="primary">Save, in the tower</button>
    </form>`;
  }

  function pickPanel(batch) {
    return `<form class="panel" data-form="pick" data-id="${batch.id}">
      ${dateField(batch, 'Date picked')}
      <label>Weight (g) <span class="hint">Optional</span>
        <input type="number" name="grams" min="0" step="1" inputmode="numeric">
      </label>
      <label>Notes <input name="notes" maxlength="300"></label>
      <button class="primary">Save picking</button>
    </form>`;
  }

  function removePanel(batch) {
    return `<form class="panel" data-form="remove" data-id="${batch.id}">
      ${dateField(batch, 'Date')}
      <fieldset>
        <legend>Which pods are coming free?</legend>
        ${batch.pods.map((pod) => `<label class="check-option">
          <input type="checkbox" name="pods" value="${esc(pod)}" checked>${esc(Tower.podLabel(pod))}
        </label>`).join('')}
      </fieldset>
      <fieldset>
        <legend>Why?</legend>
        <label class="check-option"><input type="radio" name="harvested" value="yes" checked>Harvested</label>
        <label class="check-option"><input type="radio" name="harvested" value="no">Failed or bolted, nothing to harvest</label>
      </fieldset>
      <label>Final weight (g) <span class="hint">Optional</span>
        <input type="number" name="grams" min="0" step="1" inputmode="numeric">
      </label>
      <label>Notes <input name="notes" maxlength="300"></label>
      <button class="primary">Save and free the pods</button>
    </form>`;
  }

  // ---- Today ----

  function renderToday() {
    const date = today();
    const view = Tower.todayView(state, date);
    const total = Tower.totalPods(state.settings);
    const free = Tower.freePods(state).length;
    let html = `<header class="page-head row-head">
      <div><h1>Today</h1></div>
      <a class="gear" href="#/settings">Settings</a>
    </header>`;

    if (!state.towerStartedOn) {
      html += `<article class="card setup">
        <h3>Get the tower running</h3>
        <p>Fill it, test for leaks, mix nutrient and set pH. Routine care starts counting when you tap below.</p>
        <div class="actions">
          <a class="button" href="#/guide/start">Show me how</a>
          <button class="primary" data-action="start-tower">Tower is running</button>
        </div>
      </article>`;
    }

    if (!state.plan.length) {
      html += `<article class="card setup">
        <h3>Choose what to grow</h3>
        <p>Pick your crops and how many pods each gets, and the app works out what to sow and when.</p>
        <a class="button primary" href="#/plan">Set up the plan</a>
      </article>`;
    }

    const season = Tower.seasonAdvice(date, state.settings);
    if (season) {
      html += `<details class="card season-card">
        <summary><b>Where to park it:</b> ${esc(season.where)}</summary>
        <p class="subtle" style="margin-top:8px">${esc(season.name)}, Gold Coast</p>
        <ul>${season.tips.map((tip) => `<li>${esc(tip)}</li>`).join('')}</ul>
      </details>`;
    }

    html += `<a class="stats" href="#/tower">
      <div><strong>${total - free}</strong><span>pods planted</span></div>
      <div><strong>${free}</strong><span>pods free</span></div>
      <div><strong>${state.batches.filter((b) => b.status === 'growing' && Tower.currentStage(b) !== 'tower').length}</strong><span>batches raising</span></div>
    </a>`;

    if (view.care.length) {
      html += '<h2>Tower care</h2>';
      html += view.care.map(careCard).join('');
    }

    if (view.sows.length) {
      html += '<h2>Sow today</h2>';
      html += view.sows.map((sow) => `<article class="card sow">
        <div class="grow-title">${cropChip(sow.crop)}<h3>${esc(sow.crop.name)}</h3><span class="subtle">${plural(sow.size.cubes, 'cube')}</span></div>
        <p>Sow ${plural(sow.size.cubes, 'cube')} to fill about ${plural(sow.size.pods, 'pod')}. ${esc(sow.crop.seeds)}</p>
        ${sow.seed ? `<p class="subtle"><b>Your packet:</b> ${esc(Tower.seedLabel(sow.seed))} (${esc(sow.seed.brand)}). ${esc(sow.seed.tips)}</p>` : '<p class="warn">You don’t have this in your seed box.</p>'}
        ${sow.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
        <p class="subtle">Should reach the tower about ${formatDate(sow.reachesTower)}, when about ${plural(Math.max(0, sow.freeThen), 'pod')} ${sow.freeThen === 1 ? 'is' : 'are'} expected to be free.</p>
        ${sow.freeThen < sow.size.pods ? '<p class="warn">That’s tight. Plan on holding these in the greenhouse until pods free up, or skip this round.</p>' : ''}
        ${sow.season ? `<p class="warn">${esc(sow.season)}</p>` : ''}
        <div class="actions">
          <button class="primary" data-action="sow" data-crop="${esc(sow.crop.id)}" data-seed="${sow.seed ? sow.seed.id : ''}" data-cubes="${sow.size.cubes}">Sow now</button>
          <button data-action="skip-sow" data-crop="${esc(sow.crop.id)}">Skip this round</button>
        </div>
      </article>`).join('');
    }

    if (view.checks.length) {
      html += '<h2>Check these batches</h2>';
      html += view.checks.map((batch) => {
        const check = Tower.nextCheck(batch, date);
        const side = check.overdueBy ? `${days(check.overdueBy)} overdue` : esc(STAGES[Tower.currentStage(batch)].label);
        return `<article class="card check">${batchTitle(batch, side)}${transitionPrompt(batch)}</article>`;
      }).join('');
    }

    if (!view.care.length && !view.sows.length && !view.checks.length && state.towerStartedOn && state.plan.length) {
      html += `<div class="card empty"><p>Nothing needs doing today.</p></div>`;
    }

    if (view.growing.length) {
      html += '<h2>All batches</h2>';
      html += view.growing.map(batchRow).join('');
    }
    return html;
  }

  function careCard(routine) {
    const never = !routine.lastDone;
    const last = never ? 'Not done yet' : `Last done ${formatDate(routine.lastDone)}`;
    const button = routine.id === 'ph'
      ? '<a class="button primary" href="#/water">Log a reading</a>'
      : `<button class="primary" data-action="care" data-routine="${esc(routine.id)}">Done</button>`;
    return `<article class="card water">
      <div class="grow-title"><h3>${esc(routine.label)}</h3><span class="subtle">${esc(last)}</span></div>
      <p>${esc(routine.how)}</p>
      <div class="actions">${button}</div>
    </article>`;
  }

  function batchRow(batch) {
    const check = Tower.nextCheck(batch, today());
    const text = countdownText(check);
    const stage = STAGES[Tower.currentStage(batch)].label;
    const count = Tower.currentStage(batch) === 'tower' ? plural(batch.pods.length, 'pod') : plural(batch.plants, 'plant');
    return `<a class="card row-link" href="#/batch/${batch.id}">
      <div class="row-main">
        ${batchTitle(batch, ' ')}
        <span class="subtle">${esc(batch.code)} · ${esc(stage)} · ${esc(count)}</span>
      </div>
      <div class="count ${check.isDue ? 'due' : ''}">
        <strong>${esc(text.big)}</strong><span>${esc(text.small)}</span>
      </div>
    </a>`;
  }

  // ---- Batches ----

  function renderBatches() {
    let html = `<header class="page-head row-head">
      <div><h1>Batches</h1><p class="subtle">From rockwool to the tower</p></div>
      <div class="actions"><a class="button" href="#/seeds">Seed box</a><a class="button primary" href="#/new">Sow a batch</a></div>
    </header>`;
    const growing = state.batches.filter((b) => b.status === 'growing');
    if (!growing.length) html += '<div class="card empty"><p>No batches growing yet.</p></div>';
    for (const stage of ['germinating', 'seedling', 'greenhouse', 'tower']) {
      const here = growing.filter((b) => Tower.currentStage(b) === stage);
      if (!here.length) continue;
      html += `<h2>${esc(STAGES[stage].label)} (${here.length})</h2>${here.map(batchRow).join('')}`;
    }
    const finished = state.batches.filter((b) => b.status !== 'growing').reverse();
    if (finished.length) {
      html += '<h2>Finished</h2>';
      html += finished.map((batch) => `<a class="card row-link" href="#/batch/${batch.id}">
        <div class="row-main">
          ${batchTitle(batch, ' ')}
          <span class="subtle">${esc(batch.code)} · ${batch.status === 'finished' ? 'Finished' : 'Composted'} ${formatDate(batch.finishedOn)}</span>
        </div>
        <div class="count"><strong>${Tower.totalGrams(batch)} g</strong><span>harvested</span></div>
      </a>`).join('');
    }
    return html;
  }

  function cropOptions(selected) {
    const groups = [...new Set(CROPS.map((c) => c.group))];
    return groups.map((group) => `<optgroup label="${esc(group)}">
      ${CROPS.filter((c) => c.group === group).map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}${c.fit === 'good' ? '' : ` (${esc(FIT_LABEL[c.fit].toLowerCase())})`}</option>`).join('')}
    </optgroup>`).join('');
  }

  function cropHint(cropId, seed = null) {
    const crop = Tower.cropById(cropId);
    const warning = seed ? '' : Tower.seasonWarning(crop, today(), state.settings);
    const seedLines = seed ? `
      <p><b>Your packet:</b> ${esc(seed.brand)}.${seed.towerNote ? ` ${esc(seed.towerNote)}.` : ''}${seed.tips ? ` ${esc(seed.tips)}.` : ''}</p>
      ${Tower.seedWarnings(seed, today()).map((w) => `<p class="warn">${esc(w)}</p>`).join('')}` : '';
    return `${seedLines}
      <p><b>Seed:</b> ${esc(crop.seeds)}</p>
      <p><b>Timing:</b> about ${days(crop.germDays)} to sprout, ${days(Tower.daysToTower(crop))} to transplant, first harvest ${crop.firstHarvest[0]}–${crop.firstHarvest[1]} days from sowing.${crop.estimated ? ' These are estimates.' : ''}</p>
      <p>${esc(crop.tip)}</p>
      ${warning ? `<p class="warn">${esc(warning)}</p>` : ''}`;
  }

  function seedOption(seed, selected) {
    const flags = [seed.status === 'On order' ? 'on order' : '', seed.treated ? 'Thiram coated' : ''].filter(Boolean).join(', ');
    return `<option value="seed:${seed.id}"${selected === `seed:${seed.id}` ? ' selected' : ''}${seed.status === 'On order' ? ' disabled' : ''}>${esc(Tower.seedLabel(seed))} (${esc(seed.brand)})${flags ? ` – ${esc(flags)}` : ''}</option>`;
  }

  function seedChoices(selected) {
    const picker = Tower.seedPicker(today(), state.settings);
    const group = (label, list) => (list.length ? `<optgroup label="${esc(label)}">${list.map((s) => seedOption(s, selected)).join('')}</optgroup>` : '');
    const others = picker.others.length
      ? `<optgroup label="In season, not in your box">${picker.others.map((c) => `<option value="crop:${esc(c.id)}"${selected === `crop:${c.id}` ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`
      : '';
    return group('Tower stars', picker.stars) + group('Worth a try', picker.tries) + group('Thiram coated', picker.treated) + others;
  }

  function parseSeedChoice(value) {
    const [kind, id] = value.split(':');
    if (kind === 'seed') {
      const seed = Tower.seedById(id);
      return { seed, cropId: seed.cropId };
    }
    return { seed: null, cropId: id };
  }

  function renderNew() {
    const picker = Tower.seedPicker(today(), state.settings);
    const offered = [...picker.stars, ...picker.tries, ...picker.treated].map((s) => s.id);
    let choice = `seed:${picker.stars[0].id}`;
    if (prefill && offered.includes(prefill.seedId)) choice = `seed:${prefill.seedId}`;
    else if (prefill && picker.others.some((c) => c.id === prefill.cropId)) choice = `crop:${prefill.cropId}`;
    const cubes = (prefill && prefill.cubes) || 12;
    const { seed, cropId } = parseSeedChoice(choice);
    return `<header class="page-head row-head">
        <div><h1>Sow a batch</h1><p class="subtle">This will be Batch ${Tower.nextBatchNumber(state)}</p></div>
        <a class="gear" href="#/seeds">Seed box</a>
      </header>
      <article class="card water">
        <p style="margin:0"><b>Prepare the cubes:</b> soak for 2 minutes in water at about pH 5.5, drain for about 15 minutes, put seed in the hole, then spray with water. Keep them in a seed tray.</p>
      </article>
      <form data-form="new">
        <label>What are you sowing? <span class="hint">Only what’s in season today</span> <select name="seedChoice">${seedChoices(choice)}</select></label>
        <div class="card crop-hint" id="crop-hint">${cropHint(cropId, seed)}</div>
        <label>Variety <span class="hint">Change this if you need to</span>
          <input name="variety" maxlength="80" autocomplete="off" value="${esc(seed ? seed.variety : '')}">
        </label>
        <label>Rockwool cubes sown
          <input type="number" name="cubes" min="1" max="200" step="1" inputmode="numeric" value="${esc(cubes)}" required>
        </label>
        <label>Date sown
          <input type="date" name="sownOn" value="${today()}" max="${today()}" required>
        </label>
        <div class="actions stack"><button class="primary">Save batch</button></div>
      </form>`;
  }

  function seedRow(seed) {
    const crop = Tower.cropById(seed.cropId);
    const sown = Tower.batchesFromSeed(state, seed.id);
    const warnings = Tower.seedWarnings(seed, today());
    const sowable = seed.status !== 'On order' && Tower.seedInWindow(seed, today());
    return `<article class="card">
      <div class="grow-title">${cropChip(crop)}<h3>${esc(seed.variety || seed.plant)}</h3>
        <span class="subtle">${seed.variety ? esc(seed.plant) : ''}</span></div>
      <p class="subtle" style="margin-bottom:6px">${esc(seed.brand)}${sown ? ` · sown ${sown === 1 ? 'once' : `${sown} times`}` : ''}</p>
      ${seed.towerNote ? `<p style="margin-bottom:6px">${esc(seed.towerNote)}</p>` : ''}
      ${seed.tips ? `<p class="subtle" style="margin-bottom:6px">${esc(seed.tips)}</p>` : ''}
      ${warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
      ${sowable ? `<button data-action="sow" data-seed="${seed.id}">Sow this</button>` : ''}
    </article>`;
  }

  function renderSeeds() {
    const box = Tower.seedBox(today());
    const section = (label, note, list) => `<details class="guide-section"${label.startsWith('Tower stars') ? ' open' : ''}>
      <summary>${esc(label)} (${list.length})</summary>
      <div class="guide-body"><p class="subtle">${esc(note)}</p>${list.map(seedRow).join('')}</div>
    </details>`;
    return `<a class="back" href="#/plan">← Plan</a>
      <header class="page-head"><h1>Seed box</h1>
        <p class="subtle">${Tower.SEEDS.length} packets your sheet marks for the tower, sown by your Gold Coast calendar</p></header>
      ${section('Tower stars to sow now', 'Leafy greens and herbs that thrive in a tower.', box.stars)}
      ${section('Worth a try now', 'Possible with stakes, trimming or a top pod. The bigger plants will be a stretch for 3.8 cm pods.', box.tries)}
      ${section('Not in season yet', 'Waiting for their sowing window on your sheet. They’ll move up on their own, and can’t be sown until then.', box.later)}
      ${section('Treated or on order', 'Thiram-coated packets, and ones that haven’t arrived yet.', box.flagged)}`;
  }

  function renderBatch(batch) {
    const date = today();
    const growing = batch.status === 'growing';
    const crop = Tower.cropById(batch.cropId);
    const open = panel && panel.id === batch.id ? panel.kind : null;
    let html = `<a class="back" href="#/batches">← Batches</a>
      <header class="page-head">
        <h1>${esc(Tower.batchName(batch))}</h1>
        <p class="subtle">${esc(batch.code)} · ${growing ? `Day ${Tower.daysBetween(batch.sownOn, date)} from sowing` : batch.status === 'finished' ? 'Finished' : 'Composted'}</p>
      </header>`;

    if (growing) {
      const check = Tower.nextCheck(batch, date);
      const text = countdownText(check);
      const stage = STAGES[Tower.currentStage(batch)];
      html += `<div class="hero ${check.isDue ? 'due' : ''}">
        <strong>${esc(text.big)}</strong>
        <span>${esc(text.small)}${check.isDue ? '' : ` (${formatDate(check.dueOn)})`}</span>
        <p><b>${esc(stage.label)}:</b> ${esc(stage.care)}</p>
      </div>`;
      if (check.isDue || open) {
        html += `<article class="card check">${transitionPrompt(batch)}</article>`;
      } else {
        const label = Tower.currentStage(batch) === 'tower' ? 'Picking or taking plants out?' : 'Looks ready early?';
        html += `<div class="actions" style="margin-bottom:10px">
          <button data-action="panel" data-kind="early" data-id="${batch.id}">${esc(label)}</button>
        </div>`;
      }
    }

    html += `<h2>Details</h2><article class="card"><dl class="facts">
      <div><dt>Sown</dt><dd>${formatDate(batch.sownOn)}</dd></div>
      <div><dt>Cubes sown</dt><dd>${esc(batch.cubes)}</dd></div>
      <div><dt>Plants now</dt><dd>${esc(batch.plants)}</dd></div>
      <div><dt>Total harvested</dt><dd>${Tower.totalGrams(batch)} g</dd></div>
    </dl>
    ${batch.pods.length ? `<p class="pod-list"><b>Pods:</b> ${batch.pods.map((p) => esc(Tower.podLabel(p))).join('; ')}</p>` : ''}
    ${batch.endReason ? `<p class="pod-list"><b>Reason:</b> ${esc(batch.endReason)}</p>` : ''}
    </article>`;

    html += `<h2>Stages</h2><article class="card"><table>
      <thead><tr><th>Stage</th><th>Started</th><th>Days</th></tr></thead>
      <tbody>${batch.stages.map((entry, i) => {
        const next = batch.stages[i + 1];
        const end = next ? next.startedOn : batch.finishedOn || date;
        return `<tr><td>${esc(STAGES[entry.stage].label)}</td><td>${formatDate(entry.startedOn)}</td><td>${Tower.daysBetween(entry.startedOn, end)}</td></tr>`;
      }).join('')}</tbody></table></article>`;

    if (batch.harvests.length) {
      html += `<h2>Harvests</h2><article class="card"><ul class="log">
        ${batch.harvests.map((h) => `<li><span><b>${formatDate(h.on)}</b>: ${h.grams == null ? 'not weighed' : `${esc(h.grams)} g`}${h.final ? ', plants out' : ''}${h.notes ? `. ${esc(h.notes)}` : ''}</span></li>`).join('')}
      </ul></article>`;
    }

    if (batch.checks.length) {
      html += `<h2>“Not yet” answers</h2><article class="card"><ul class="log">
        ${batch.checks.map((c) => `<li><span><b>${formatDate(c.on)}</b>, ${esc(STAGES[c.stage].label)}${c.note ? `: ${esc(c.note)}` : ''}</span></li>`).join('')}
      </ul></article>`;
    }

    html += `<h2>Notes</h2><article class="card">
      ${batch.notes.length ? `<ul class="log" style="margin-bottom:12px">
        ${batch.notes.map((note, i) => `<li><span><b>${formatDate(note.on)}</b>: ${esc(note.text)}</span>
          <button data-action="remove-note" data-id="${batch.id}" data-index="${i}">Remove</button></li>`).join('')}
      </ul>` : ''}
      <form class="inline-form" data-form="note" data-id="${batch.id}">
        <label>Add a note <input name="text" required maxlength="500"></label>
        <button>Add</button>
      </form></article>`;

    html += `<h2>About ${esc(crop.name)}</h2><article class="card crop-hint">${cropHint(crop.id, batch.seedId ? Tower.seedById(batch.seedId) : null)}</article>`;

    const canUndoMove = growing && batch.stages.length > 1 && !batch.harvests.length && !batch.removals.length;
    html += `<h2>Manage</h2><div class="actions">
      ${canUndoMove ? `<button data-action="undo-move" data-id="${batch.id}">Undo last move</button>` : ''}
      ${batch.removals.length ? `<button data-action="undo-removal" data-id="${batch.id}">Put last plants back</button>` : ''}
      ${growing && Tower.currentStage(batch) !== 'tower' ? `<button data-action="panel" data-kind="discard" data-id="${batch.id}">Compost this batch</button>` : ''}
      <button class="danger" data-action="delete" data-id="${batch.id}">Delete batch</button>
    </div>`;

    if (open === 'discard') {
      html += `<form class="panel" data-form="discard" data-id="${batch.id}">
        <label>What happened? <span class="hint">Optional</span><input name="reason" maxlength="300"></label>
        <button class="primary">Compost this batch</button>
      </form>`;
    }
    return html;
  }

  // ---- Tower ----

  function renderTower() {
    const used = Tower.occupiedPods(state);
    const total = Tower.totalPods(state.settings);
    const free = Tower.freePods(state).length;
    const inTower = Tower.towerBatches(state);
    let html = `<header class="page-head">
      <h1>Tower</h1>
      <p class="subtle">${total - free} of ${total} pods planted, ${free} free. Tier 1 is the top.</p>
    </header>`;
    for (const clash of Tower.podClashes(state)) {
      html += `<div class="flash" role="alert">${esc(Tower.podLabel(clash.pod))} is claimed by ${esc(clash.codes.join(' and '))}. This can happen if you both planted while offline. Open one of those batches and fix it.</div>`;
    }
    html += `<article class="card">${podGrid((id) => {
      const holder = used[id];
      if (!holder) return `<div class="pod free" title="${esc(Tower.podLabel(id))}: free"></div>`;
      const crop = Tower.cropById(holder.cropId);
      return `<a class="pod" style="background:${esc(crop.colour)}" href="#/batch/${holder.id}" title="${esc(Tower.podLabel(id))}: ${esc(crop.name)}" aria-label="${esc(Tower.podLabel(id))}: ${esc(crop.name)}">${esc(crop.short)}</a>`;
    })}</article>`;

    if (inTower.length) {
      html += '<h2>What’s planted</h2>';
      html += inTower.map(batchRow).join('');
    } else {
      html += '<div class="card empty"><p>Nothing in the tower yet. Seedlings move here from the Batches screen.</p></div>';
    }
    return html;
  }

  // ---- Water ----

  function targetCard(target) {
    const basis = {
      tower: 'Based on what’s in the tower now.',
      plan: 'Nothing planted yet, so this is based on your plan.',
      default: 'Nothing planted or planned yet, so this is a general lettuce range.',
    }[target.basis];
    const warn = (range, name) => {
      if (range.shared) return '';
      return range.outliers.length
        ? `<p class="warn">No shared ${name} range. This is a compromise, and it doesn’t suit ${esc(range.outliers.join(' or '))}.</p>`
        : `<p class="warn">Your crops only just share a ${name} range, so hold it closely.</p>`;
    };
    return `<article class="card target">
      <div class="target-grid">
        <div><span>pH</span><strong>${target.ph.range[0].toFixed(1)}–${target.ph.range[1].toFixed(1)}</strong></div>
        <div><span>${esc(unitLabel())}</span><strong>${showEc(target.ec.range[0])}–${showEc(target.ec.range[1])}</strong></div>
        <div><span>Water</span><strong>18–22°C</strong></div>
      </div>
      <p class="subtle">${esc(basis)}</p>
      ${warn(target.ph, 'pH')}${warn(target.ec, 'EC')}
      ${target.justPlanted ? '<p class="warn">New transplants this week: hold EC at the low end of the range.</p>' : ''}
      <dl class="facts" style="margin-top:10px">
        <div><dt>Pump, starting point</dt><dd>15 min on, ${esc(target.pumpOffMinutes)} off</dd></div>
        ${Tower.seasonAdvice(today(), state.settings)
          ? `<div><dt>Where to park it</dt><dd>${esc(Tower.seasonAdvice(today(), state.settings).where)}</dd></div>`
          : `<div><dt>Light under lights</dt><dd>${esc(target.lightHours[0])}–${esc(target.lightHours[1])} hours</dd></div>`}
      </dl>
      <p class="subtle" style="margin:8px 0 0">Pump timing is Nutraponics’ starting cycle, so shorten the off time if plants wilt in heat. Set the cycle in Smart Life rather than running the 45 W Aqua One non-stop, which would warm a 20 L tank.</p>
    </article>`;
  }

  function renderWater() {
    const date = today();
    const target = Tower.reservoirTarget(state, date);
    const { settings } = state;
    const latest = Tower.latestReading(state);
    const previous = state.readings[state.readings.length - 2] || null;
    let html = `<header class="page-head"><h1>Water</h1><p class="subtle">One tank feeds every plant</p></header>`;
    html += targetCard(target);

    if (latest) {
      const advice = Tower.adviseReading(latest, target, previous, unit(), settings);
      if (advice.length) {
        html += `<h2>Latest reading: ${formatDate(latest.on)}</h2>`;
        html += advice.map((item) => `<article class="card advice advice-${esc(item.level)}">
          <strong>${esc(item.title)}</strong>${item.text ? `<p>${esc(item.text)}</p>` : ''}
        </article>`).join('');
      }
    }

    html += `<h2>Log a reading</h2><form class="card" data-form="reading">
      <div class="fields-3">
        <label>pH <input type="number" name="ph" min="0" max="14" step="0.01" inputmode="decimal"></label>
        <label>${esc(ecShort())} <input type="number" name="ec" min="0" step="any" inputmode="decimal"></label>
        <label>Water °C <input type="number" name="waterTemp" step="0.1" inputmode="decimal"></label>
      </div>
      <div class="fields-2">
        <label>Water added (L) <input type="number" name="addedL" min="0" step="0.5" inputmode="decimal"></label>
        <label>Date <input type="date" name="on" value="${date}" max="${date}" required></label>
      </div>
      <label>Note <input name="note" maxlength="300"></label>
      <p class="subtle">Enter the EC figure from your GIDIGI, not TDS. 1400 and 1.4 both work.</p>
      <button class="primary" style="width:100%">Save reading</button>
    </form>`;

    const statuses = Tower.routineStatus(state, date);
    html += '<h2>Routine care</h2>';
    if (!statuses.length) {
      html += `<article class="card"><p>This starts when the tower is running.</p>
        <div class="actions"><a class="button" href="#/guide/start">Show me how</a>
        <button class="primary" data-action="start-tower">Tower is running</button></div></article>`;
    } else {
      html += `<article class="card"><ul class="log routines">${statuses.map((r) => `<li>
        <span><b>${esc(r.label)}</b><br><small class="${r.isDue ? 'due-text' : 'subtle'}">${r.isDue ? 'Due now' : `Due ${formatDate(r.dueOn)}`}${r.lastDone ? `, last ${formatDate(r.lastDone)}` : ''}</small>
        <br><small class="subtle">${esc(r.how)}</small></span>
        ${r.id === 'ph' ? '' : `<button data-action="care" data-routine="${esc(r.id)}">Done</button>`}
      </li>`).join('')}</ul></article>`;
    }

    html += '<h2>Mixing nutrient</h2><article class="card">';
    const full = Tower.mixAmounts(settings);
    if (full) {
      const half = Tower.mixAmounts(settings, settings.reservoirL, 0.5);
      html += `<p>${settings.nutrientName ? `<b>${esc(settings.nutrientName)}</b> for` : 'For'} a full ${esc(settings.reservoirL)} L tank:</p>
        <table><thead><tr><th>Strength</th><th>Part A</th><th>Part B</th></tr></thead><tbody>
          <tr><td>Full</td><td>${full.a} ml</td><td>${full.b} ml</td></tr>
          <tr><td>Half</td><td>${half.a} ml</td><td>${half.b} ml</td></tr>
        </tbody></table>
        <p class="subtle" style="margin:10px 0 0">Seedling water, at half strength: ${settings.partAMlPerL / 2} ml of A and ${settings.partBMlPerL / 2} ml of B per litre.</p>
        <p class="warn" style="margin:8px 0 0">The label says this mix lands near EC ${showEc(1.4)} and pH 6.7, depending on your water. That pH is above target, so expect to use pH Down each time.</p>`;
    } else {
      html += '<p>Enter your nutrient’s label rate in <a href="#/settings">Settings</a> and the doses for your tank will appear here.</p>';
    }
    html += `<ol class="steps">
        <li>Add water first, and note its starting EC.</li>
        <li>Add part A and stir well.</li>
        <li>Add part B and stir well. Never mix the concentrates directly together.</li>
        <li>Check EC. Adjust towards the target.</li>
        <li>Set pH last, and recheck after the pump has run.</li>
      </ol></article>`;

    if (state.readings.length) {
      const rows = state.readings.slice(-14).reverse();
      html += `<h2>Recent readings</h2><article class="card table-wrap"><table>
        <thead><tr><th>Date</th><th>pH</th><th>${esc(ecShort())}</th><th>°C</th><th>Added</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>${formatDate(r.on)}${r.note ? `<br><small class="subtle">${esc(r.note)}</small>` : ''}</td>
          <td>${r.ph ?? '–'}</td>
          <td>${r.ec == null ? '–' : showEc(r.ec)}</td>
          <td>${r.waterTemp ?? '–'}</td>
          <td>${r.addedL ? `${esc(r.addedL)} L` : '–'}</td>
          <td><button class="mini" data-action="remove-reading" data-reading="${r.id}">Remove</button></td>
        </tr>`).join('')}</tbody></table></article>`;
    }

    if (state.careLog.length) {
      const labelOf = (id) => (Tower.ROUTINES.find((r) => r.id === id) || { label: id }).label;
      html += `<h2>Care done</h2><article class="card"><ul class="log">
        ${state.careLog.slice(-10).reverse().map((c) => `<li><span><b>${formatDate(c.on)}</b>: ${esc(labelOf(c.routine))}</span>
          <button data-action="remove-care" data-care="${c.id}">Remove</button></li>`).join('')}
      </ul></article>`;
    }
    return html;
  }

  // ---- Plan ----

  function renderPlan() {
    const date = today();
    const total = Tower.totalPods(state.settings);
    const allocated = Tower.planTotalPods(state);
    let html = `<header class="page-head row-head">
      <div><h1>Succession plan</h1>
      <p class="subtle">${allocated} of ${total} pods given to crops</p></div>
      <a class="gear" href="#/seeds">Seed box</a>
    </header>`;

    if (!state.plan.length) {
      html += `<article class="card setup">
        <h3>Start with a suggested salad mix?</h3>
        <p>${esc(Tower.starterMixFor(date).note)}</p>
        <button class="primary" data-action="starter-mix">Use this mix</button>
      </article>`;
    } else {
      if (allocated > total) html += `<div class="flash">That’s ${allocated - total} more pods than the tower has.</div>`;
      html += `<form data-form="plan">${state.plan.map((item) => {
        const crop = Tower.cropById(item.cropId);
        const size = Tower.batchSize(item, state.settings);
        const next = Tower.nextSowOn(state, item, date);
        const choices = [...new Set([...INTERVAL_CHOICES, item.intervalDays])].sort((a, b) => a - b);
        return `<article class="card">
          <div class="grow-title">${cropChip(crop)}<h3>${esc(crop.name)}</h3>
            <button type="button" class="mini" data-action="plan-remove" data-crop="${esc(crop.id)}" style="margin-left:auto">Remove</button></div>
          <div class="fields-2">
            <label>Pods <input type="number" name="pods-${esc(crop.id)}" min="1" max="${total}" step="1" inputmode="numeric" value="${esc(item.pods)}" required></label>
            <label>Sow every <select name="every-${esc(crop.id)}">
              ${choices.map((n) => `<option value="${n}"${n === item.intervalDays ? ' selected' : ''}>${days(n)}</option>`).join('')}
            </select></label>
          </div>
          <p class="subtle" style="margin:0">Sow ${plural(size.cubes, 'cube')} to fill about ${plural(size.pods, 'pod')} each round. Stays about ${days(crop.towerDays)}. ${Tower.cropInSeason(crop.id, date, state.settings) ? `Next sowing ${next <= date ? 'today' : formatDate(next)}.` : 'Sowing is paused until it’s back in season.'}</p>
          <p class="subtle" style="margin:6px 0 0">${Tower.seedsForCrop(crop.id).length ? `Your seed: ${esc(Tower.seedsForCrop(crop.id).map((s) => s.variety || s.brand).join(', '))}` : 'Not in your seed box'}</p>
          ${crop.fit === 'poor' ? `<p class="warn">${esc(crop.tip)}</p>` : ''}
        </article>`;
      }).join('')}
      <div class="actions stack" style="margin-bottom:10px"><button class="primary">Save changes</button></div>
      </form>`;
    }

    const available = CROPS.filter((c) => !state.plan.some((item) => item.cropId === c.id) && Tower.cropInSeason(c.id, date, state.settings));
    const tierOf = (c) => {
      const seeds = Tower.seedsForCrop(c.id);
      if (!seeds.length) return 'Not in your seed box';
      return seeds.some((s) => s.tier === 'star') ? 'Tower stars in your box' : 'Worth a try, in your box';
    };
    const groups = ['Tower stars in your box', 'Worth a try, in your box', 'Not in your seed box'].filter((g) => available.some((c) => tierOf(c) === g));
    html += `<h2>Add a crop</h2><form class="card" data-form="plan-add">
      <p class="subtle">Only crops in season today are listed.</p>
      <label>Crop <select name="cropId">${groups.map((group) => `<optgroup label="${esc(group)}">
        ${available.filter((c) => tierOf(c) === group).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}${c.fit === 'poor' ? ' (a stretch for these pods)' : ''}</option>`).join('')}
      </optgroup>`).join('')}</select></label>
      <label>Pods <input type="number" name="pods" min="1" max="${total}" step="1" inputmode="numeric" value="4" required></label>
      <button style="width:100%">Add to plan</button>
    </form>`;

    if (state.plan.length) {
      const target = Tower.targetForCrops(state.plan.map((item) => Tower.cropById(item.cropId)));
      const clash = (range) => (range.shared ? '' : range.outliers.length ? ` No shared range: ${range.outliers.join(' and ')} would miss out.` : ' A very tight fit.');
      html += `<h2>Do these crops share a tank?</h2><article class="card">
        <p><b>pH ${target.ph.range[0].toFixed(1)}–${target.ph.range[1].toFixed(1)}.</b>${esc(clash(target.ph))}</p>
        <p style="margin:0"><b>${esc(unitLabel())} ${showEc(target.ec.range[0])}–${showEc(target.ec.range[1])}.</b>${esc(clash(target.ec))}</p>
      </article>`;

      const perWeek = Math.round(Tower.cubesPerWeek(state));
      html += `<h2>Rockwool cubes</h2><article class="card">
        <p style="margin:0">This plan uses about <b>${plural(perWeek, 'cube')} a week</b>, so a pack of 50 lasts about ${plural(Math.max(1, Math.round(50 / Math.max(1, perWeek))), 'week')}.</p>
      </article>`;

      const rows = Tower.forecast(state, date, 12);
      const firstOver = rows.find((r) => r.over > 0);
      html += '<h2>Next 12 weeks</h2>';
      if (firstOver) {
        html += `<div class="flash">The plan overfills the tower by ${firstOver.over} pods in the week of ${formatDate(firstOver.start)}. Give a crop fewer pods or sow less often.</div>`;
      }
      html += `<article class="card table-wrap"><table class="forecast">
        <thead><tr><th>Week of</th><th>Sow (cubes)</th><th>In</th><th>Out</th><th>Used</th></tr></thead>
        <tbody>${rows.map((r) => `<tr${r.over ? ' class="over"' : ''}>
          <td>${formatDate(r.start).replace(/^\w+,? /, '')}</td>
          <td>${r.sow.length ? r.sow.map((s) => `${esc(s.name)} ×${s.cubes}`).join('<br>') : '–'}</td>
          <td>${r.goingIn || '–'}</td>
          <td>${r.comingOut || '–'}</td>
          <td><b>${r.inUse}</b>/${total}</td>
        </tr>`).join('')}</tbody></table>
        <p class="subtle" style="margin:10px 0 0">An estimate. “In” and “Out” are pods. Real plants will vary, and nothing moves until you confirm it.</p>
      </article>`;
    }
    return html;
  }

  // ---- Guide ----

  function cropLibrary() {
    const inBox = (crop) => {
      const seeds = Tower.seedsForCrop(crop.id);
      if (!seeds.length) return 'Not in your box';
      return `${plural(seeds.length, 'packet')}${seeds.some((s) => s.tier === 'star') ? ', tower star' : ''}`;
    };
    return CROPS.map((crop) => `<details class="crop-entry">
      <summary>${cropChip(crop)} ${esc(crop.name)} <span class="subtle">${esc(inBox(crop))}</span></summary>
      <p>${esc(crop.tip)}</p>
      <dl class="facts">
        <div><dt>pH</dt><dd>${crop.ph[0].toFixed(1)}–${crop.ph[1].toFixed(1)}</dd></div>
        <div><dt>${esc(unitLabel())}</dt><dd>${showEc(crop.ec[0])}–${showEc(crop.ec[1])}</dd></div>
        <div><dt>Light</dt><dd>${crop.light[0]}–${crop.light[1]} hours</dd></div>
        <div><dt>Pump, starting point</dt><dd>15 on, ${crop.off} off</dd></div>
        <div><dt>First harvest from sowing</dt><dd>${crop.firstHarvest[0]}–${crop.firstHarvest[1]} days</dd></div>
        <div><dt>Days to transplant, estimate</dt><dd>${Tower.daysToTower(crop)}</dd></div>
        <div><dt>Time in tower, estimate</dt><dd>${crop.towerDays} days</dd></div>
        <div><dt>Harvest</dt><dd>${{ repeat: 'Pick repeatedly', whole: 'Whole plant', both: 'Pick or whole head' }[crop.harvest]}</dd></div>
      </dl>
      <p style="margin-top:10px"><b>Seed:</b> ${esc(crop.seeds)}</p>
      <p><b>Harvest cue:</b> ${esc(crop.cue)}</p>
      ${crop.rangeNote ? `<p class="subtle">${esc(crop.rangeNote)}</p>` : ''}
    </details>`).join('');
  }

  function renderGuide(openId) {
    return `<header class="page-head row-head">
        <div><h1>Guide</h1><p class="subtle">Tags show where each point came from</p></div>
        <a class="gear" href="#/settings">Settings</a>
      </header>
      ${GUIDE.map((section) => `<details class="guide-section"${section.id === openId ? ' open' : ''}>
        <summary>${esc(section.title)}</summary>
        <div class="guide-body">${section.html}</div>
      </details>`).join('')}
      <details class="guide-section"${openId === 'crops' ? ' open' : ''}>
        <summary>Crop library</summary>
        <div class="guide-body">${cropLibrary()}</div>
      </details>`;
  }

  // ---- Settings ----

  function renderSettings() {
    const s = state.settings;
    const iv = s.intervals;
    const options = (list, selected) => list.map((item) =>
      `<option${item === selected ? ' selected' : ''}>${esc(item)}</option>`).join('');
    return `<a class="back" href="#/today">← Today</a>
      <header class="page-head"><h1>Settings</h1></header>
      <form data-form="settings">
        <fieldset>
          <legend>The tower</legend>
          <div class="fields-3">
            <label>Tiers <input type="number" name="tiers" min="1" max="30" value="${esc(s.tiers)}" required></label>
            <label>Pods per tier <input type="number" name="podsPerTier" min="1" max="12" value="${esc(s.podsPerTier)}" required></label>
            <label>Tank (L) <input type="number" name="reservoirL" min="1" step="0.5" value="${esc(s.reservoirL)}" required></label>
          </div>
          <p class="subtle">Yours is 10 tiers of 5 pods, with a 20 L tank.</p>
          <label>Where the tower lives
            <select name="location">${options(['Patio', 'Greenhouse', 'Indoors'], s.location)}</select>
            <span class="hint">Indoors turns off seasonal warnings.</span>
          </label>
        </fieldset>
        <fieldset>
          <legend>Meter and nutrient</legend>
          <label>Your strength meter reads in
            <select name="meterUnit">${Object.entries(METER_UNITS).map(([key, u]) => `<option value="${key}"${key === s.meterUnit ? ' selected' : ''}>${esc(u.label)}</option>`).join('')}</select>
          </label>
          <label>Nutrient name <input name="nutrientName" maxlength="80" value="${esc(s.nutrientName)}"></label>
          <div class="fields-2">
            <label>Part A, ml per litre <input type="number" name="partAMlPerL" min="0" step="0.1" inputmode="decimal" value="${esc(s.partAMlPerL)}"></label>
            <label>Part B, ml per litre <input type="number" name="partBMlPerL" min="0" step="0.1" inputmode="decimal" value="${esc(s.partBMlPerL)}"></label>
          </div>
          <p class="subtle">Filled in from the Origin Hydro label: 5 ml of each per litre.</p>
        </fieldset>
        <fieldset>
          <legend>Sowing</legend>
          <label>Extra cubes to allow for losses (%)
            <input type="number" name="seedAllowancePct" min="0" max="100" value="${esc(s.seedAllowancePct)}" required>
          </label>
        </fieldset>
        <fieldset>
          <legend>Routine care, in days</legend>
          <div class="fields-2">
            ${Tower.ROUTINES.map((r) => `<label>${esc(r.label)} <input type="number" name="iv-${esc(r.id)}" min="1" max="365" value="${esc(iv[r.id])}" required></label>`).join('')}
          </div>
        </fieldset>
        <div class="actions stack"><button class="primary">Save settings</button></div>
      </form>
      ${sync.enabled ? `<h2>Syncing</h2>
      <article class="card">
        <p><b>${esc(sync.signedIn ? SYNC_LABEL[sync.status] || 'Connecting' : 'Not signed in')}</b>${sync.email ? ` as ${esc(sync.email)}` : ''}</p>
        ${sync.error ? `<p class="warn">${esc(sync.error)}</p>` : ''}
        ${sync.signedIn ? '<div class="actions"><button data-action="sign-out">Sign out on this phone</button></div>' : ''}
      </article>` : ''}
      <h2>Backup</h2>
      <article class="card">
        <p>${sync.enabled ? 'A backup is a copy to keep safe, in case something goes wrong with syncing. Download one every month or so.' : 'Everything is saved only in this browser. Download a backup now and then, because clearing browser data would erase it.'}</p>
        <div class="actions">
          <button data-action="export">Download backup</button>
          <label class="button" style="margin:0">Restore backup
            <input type="file" accept="application/json,.json" data-action="import" hidden>
          </label>
        </div>
      </article>`;
  }

  // ---- Routing ----

  function renderSignIn() {
    return `<header class="page-head"><h1>Salad Tower</h1>
        <p class="subtle">Sign in with the login you and Wes share, so you both see the same tower.</p></header>
      <form class="card" data-form="signin">
        <label>Email <input type="email" name="email" autocomplete="username" autocapitalize="off" required></label>
        <label>Password <input type="password" name="password" autocomplete="current-password" required></label>
        <button class="primary" style="width:100%">Sign in</button>
      </form>`;
  }

  function renderTodayBar() {
    const date = today();
    const long = new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
    const label = sync.enabled && sync.signedIn !== false ? SYNC_LABEL[sync.status] : '';
    const syncText = label ? `<br><span class="sync-state${sync.status === 'error' ? ' problem' : ''}">${esc(label)}</span>` : '';
    document.getElementById('today-bar').innerHTML = `<b>${esc(long)}</b> · ${esc(Tower.seasonLabel(date))}${syncText}`;
  }

  function render() {
    renderedOn = today();
    renderPending = false;
    renderTodayBar();
    document.body.classList.toggle('locked', sync.enabled && sync.signedIn === false);
    if (sync.enabled && sync.signedIn === false) {
      app.innerHTML = (flash ? `<div class="flash" role="alert">${esc(flash)}</div>` : '') + renderSignIn();
      flash = '';
      return;
    }
    const [route = 'today', id] = location.hash.replace(/^#\/?/, '').split('/');
    let html;
    let tab = route;
    if (route === 'batch') {
      const batch = findBatch(id);
      tab = 'batches';
      html = batch ? renderBatch(batch)
        : '<div class="card empty"><p>That batch doesn’t exist.</p><a href="#/batches">Back to Batches</a></div>';
    } else if (route === 'new') { tab = 'batches'; html = renderNew(); }
    else if (route === 'batches') html = renderBatches();
    else if (route === 'tower') html = renderTower();
    else if (route === 'water') html = renderWater();
    else if (route === 'plan') html = renderPlan();
    else if (route === 'seeds') { tab = 'plan'; html = renderSeeds(); }
    else if (route === 'guide') html = renderGuide(id);
    else if (route === 'settings') { tab = ''; html = renderSettings(); }
    else { tab = 'today'; html = renderToday(); }

    app.innerHTML = (flash ? `<div class="flash" role="alert">${esc(flash)}</div>` : '') + html;
    flash = '';
    document.querySelectorAll('.tabs a').forEach((link) => {
      const active = link.dataset.tab === tab;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function go(hash) {
    panel = null;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  // Saves the change, or shows the reason it was refused.
  function apply(change) {
    try {
      change();
      save();
      return true;
    } catch (error) {
      flash = error.message;
      return false;
    }
  }

  function finish() {
    panel = null;
    render();
  }

  // ---- Forms ----

  const forms = {
    async signin(data) {
      if (!sync.signIn) {
        flash = 'Can’t reach the sign-in service yet. Check your internet, then try again.';
        render();
        return;
      }
      const problem = await sync.signIn(data.get('email').trim(), data.get('password'));
      if (problem) {
        flash = problem;
        render();
      }
    },
    new(data) {
      let batch;
      const ok = apply(() => {
        const { seed, cropId } = parseSeedChoice(data.get('seedChoice'));
        batch = Tower.createBatch(state, {
          seedId: seed ? seed.id : null,
          cropId,
          variety: data.get('variety').trim(),
          cubes: number(data.get('cubes')),
          sownOn: data.get('sownOn'),
        });
      });
      prefill = null;
      if (ok) go(`#/batch/${batch.id}`);
      else render();
    },
    sprout(data, batch) {
      apply(() => Tower.moveToLights(batch, data.get('on'), number(data.get('count'))));
      finish();
    },
    greenhouse(data, batch) {
      apply(() => Tower.moveToGreenhouse(batch, data.get('on')));
      finish();
    },
    tower(data, batch) {
      apply(() => Tower.moveToTower(state, batch, data.get('on'), data.getAll('pods'), { rest: data.get('rest') }));
      finish();
    },
    notyet(data, batch) {
      apply(() => Tower.notReady(batch, today(), {
        recheckInDays: number(data.get('recheck')),
        note: data.get('note').trim(),
      }));
      finish();
    },
    pick(data, batch) {
      apply(() => Tower.logPick(batch, {
        on: data.get('on'), grams: number(data.get('grams')), notes: data.get('notes').trim(),
      }));
      finish();
    },
    remove(data, batch) {
      const harvested = data.get('harvested') === 'yes';
      apply(() => Tower.removePods(batch, {
        on: data.get('on'),
        pods: data.getAll('pods'),
        harvested,
        grams: harvested ? number(data.get('grams')) : null,
        notes: data.get('notes').trim(),
      }));
      finish();
    },
    discard(data, batch) {
      apply(() => Tower.discardBatch(batch, { on: today(), reason: data.get('reason').trim() }));
      finish();
    },
    note(data, batch) {
      const text = data.get('text').trim();
      if (text) apply(() => batch.notes.push({ on: today(), text }));
      render();
    },
    reading(data) {
      const rawEc = number(data.get('ec'));
      apply(() => Tower.logReading(state, {
        on: data.get('on'),
        ph: number(data.get('ph')),
        ec: rawEc == null ? null : Tower.readingToEc(rawEc, unit()),
        waterTemp: number(data.get('waterTemp')),
        addedL: number(data.get('addedL')),
        note: data.get('note').trim(),
      }));
      render();
      window.scrollTo(0, 0);
    },
    plan(data) {
      apply(() => {
        for (const item of state.plan) {
          item.pods = number(data.get(`pods-${item.cropId}`));
          const every = number(data.get(`every-${item.cropId}`));
          if (every !== item.intervalDays) item.skipUntil = null;
          item.intervalDays = every;
        }
      });
      render();
    },
    'plan-add'(data) {
      apply(() => Tower.addPlanItem(state, { cropId: data.get('cropId'), pods: number(data.get('pods')) }));
      render();
    },
    settings(data) {
      const tiers = number(data.get('tiers'));
      const podsPerTier = number(data.get('podsPerTier'));
      const valid = Tower.allPods({ tiers, podsPerTier });
      const stranded = Object.keys(Tower.occupiedPods(state)).filter((pod) => !valid.includes(pod));
      if (stranded.length) {
        flash = `That would remove planted pods (${stranded.map(Tower.podLabel).join('; ')}). Take those plants out first.`;
        render();
        return;
      }
      const intervals = {};
      for (const routine of Tower.ROUTINES) intervals[routine.id] = number(data.get(`iv-${routine.id}`));
      apply(() => {
        state.settings = {
          ...state.settings,
          tiers,
          podsPerTier,
          reservoirL: number(data.get('reservoirL')),
          location: data.get('location'),
          meterUnit: data.get('meterUnit'),
          nutrientName: data.get('nutrientName').trim(),
          partAMlPerL: number(data.get('partAMlPerL')),
          partBMlPerL: number(data.get('partBMlPerL')),
          seedAllowancePct: number(data.get('seedAllowancePct')),
          intervals,
        };
      });
      render();
      if (!document.querySelector('.flash')) {
        app.querySelector('form[data-form="settings"] button.primary').textContent = 'Saved';
      }
    },
  };

  app.addEventListener('submit', (event) => {
    const form = event.target;
    const handler = forms[form.dataset.form];
    if (!handler) return;
    event.preventDefault();
    const batch = findBatch(form.dataset.id);
    if (form.dataset.id && !batch) {
      flash = 'That batch was removed on the other phone.';
      panel = null;
      render();
      return;
    }
    handler(new FormData(form), batch, event.submitter);
  });

  // ---- Buttons ----

  const actions = {
    panel(el, batch) {
      const kind = el.dataset.kind;
      if (kind === 'early') panel = { id: batch.id, kind: 'early' };
      else {
        const closing = panel && panel.id === batch.id && panel.kind === kind;
        panel = closing ? null : { id: batch.id, kind };
      }
      render();
    },
    'sign-out'() {
      if (confirm('Sign out on this phone? Your data stays safe and comes back when you sign in again.') && sync.signOut) sync.signOut();
    },
    'start-tower'() {
      apply(() => Tower.startTower(state, today()));
      render();
    },
    care(el) {
      apply(() => Tower.logCare(state, el.dataset.routine, today()));
      render();
    },
    sow(el) {
      const seedId = Number(el.dataset.seed) || null;
      const cropId = el.dataset.crop || (seedId ? Tower.seedById(seedId).cropId : null);
      const item = state.plan.find((p) => p.cropId === cropId);
      prefill = { seedId, cropId, cubes: Number(el.dataset.cubes) || (item ? Tower.batchSize(item, state.settings).cubes : 12) };
      go('#/new');
    },
    'skip-sow'(el) {
      const item = state.plan.find((p) => p.cropId === el.dataset.crop);
      apply(() => Tower.skipSowing(item, today()));
      render();
    },
    'starter-mix'() {
      apply(() => Tower.loadStarterMix(state, today()));
      render();
    },
    'plan-remove'(el) {
      state.plan = state.plan.filter((p) => p.cropId !== el.dataset.crop);
      save();
      render();
    },
    'undo-move'(el, batch) {
      apply(() => Tower.undoLastMove(batch));
      finish();
    },
    'undo-removal'(el, batch) {
      apply(() => Tower.undoRemoval(state, batch));
      finish();
    },
    delete(el, batch) {
      if (!confirm(`Delete ${batch.code} (${Tower.batchName(batch)})? This can’t be undone.`)) return;
      state.batches = state.batches.filter((b) => b !== batch);
      save();
      go('#/batches');
    },
    'remove-note'(el, batch) {
      batch.notes.splice(Number(el.dataset.index), 1);
      save();
      render();
    },
    'remove-reading'(el) {
      state.readings = state.readings.filter((r) => r.id !== Number(el.dataset.reading));
      save();
      render();
    },
    'remove-care'(el) {
      state.careLog = state.careLog.filter((c) => c.id !== Number(el.dataset.care));
      save();
      render();
    },
    export() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `salad-tower-backup-${today()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    },
  };

  app.addEventListener('click', (event) => {
    const el = event.target.closest('button[data-action]');
    if (!el) return;
    if (el.dataset.id && !findBatch(el.dataset.id)) {
      flash = 'That batch was removed on the other phone.';
      panel = null;
      render();
      return;
    }
    actions[el.dataset.action](el, findBatch(el.dataset.id));
  });

  app.addEventListener('change', async (event) => {
    const el = event.target;

    if (el.dataset.action === 'import' && el.files[0]) {
      try {
        const data = JSON.parse(await el.files[0].text());
        if (!Array.isArray(data.batches) || !Array.isArray(data.readings) || !data.settings) {
          throw new Error('not a backup');
        }
        if (confirm(`Replace everything with this backup (${data.batches.length} batches)?${sync.signedIn ? ' This changes it on both phones.' : ''}`)) {
          state = mergeSaved(Tower.newState(), data);
          save();
        }
      } catch (error) {
        flash = 'That file isn’t a Salad Tower backup.';
      }
      render();
      return;
    }

    if (el.name === 'seedChoice') {
      const { seed, cropId } = parseSeedChoice(el.value);
      document.getElementById('crop-hint').innerHTML = cropHint(cropId, seed);
      el.form.elements.variety.value = seed ? seed.variety : '';
    }

    if (el.name === 'pods' && el.form && el.form.dataset.form === 'tower') {
      const plants = Number(el.form.dataset.plants);
      const chosen = el.form.querySelectorAll('input[name="pods"]:checked').length;
      el.form.querySelector('.pod-count').textContent = `${chosen} of ${plural(plants, 'plant')} chosen`;
      el.form.querySelector('.rest-block').hidden = chosen >= plants;
    }
  });

  window.addEventListener('hashchange', () => {
    panel = null;
    render();
    window.scrollTo(0, 0);
  });

  // Rolls the countdowns over if the app is left open past midnight, without
  // wiping a half-filled form on any other return to the tab.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && today() !== renderedOn) render();
  });

  // Catches midnight with the app open on screen, leaving any half-filled form alone.
  setInterval(() => {
    const newDay = today() !== renderedOn;
    if (newDay) renderTodayBar();
    if ((newDay || renderPending) && !isEditing()) render();
  }, 3000);

  // The phone holds the only copy, so ask the browser not to clear it to free up space.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

  window.TowerApp = {
    storageKey: STORAGE_KEY,
    onLocalChange: null,
    state: () => state,
    applyRemote(next) {
      state = mergeSaved(Tower.newState(), next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Don't wipe a half-filled form. It redraws once you've finished.
      if (isEditing()) renderPending = true;
      else render();
    },
    setSync(changes) {
      const authChanged = 'signedIn' in changes && changes.signedIn !== sync.signedIn;
      Object.assign(sync, changes);
      renderTodayBar();
      if (authChanged) render();
    },
  };

  if ('serviceWorker' in navigator && !debugParams.has('phone') && (location.protocol === 'https:' || isLocalHost)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
})();
