// Sync rules with no browser or Firebase code, so they can be tested with `node --test`.
//
// The state is split into one record per batch, reading, care job and planned crop, so
// two phones only clash if they change the very same record. Each phone compares its
// data with the last version it saw, and sends only what changed.
(function (root) {
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function toRecords(state) {
    const records = {
      settings: stable(state.settings),
      meta: stable({ towerStartedOn: state.towerStartedOn, nextBatchNumber: state.nextBatchNumber }),
    };
    for (const batch of state.batches) records[`batch_${batch.id}`] = stable(batch);
    for (const reading of state.readings) records[`reading_${reading.id}`] = stable(reading);
    for (const care of state.careLog) records[`care_${care.id}`] = stable(care);
    for (const item of state.plan) records[`plan_${item.cropId}`] = stable(item);
    return records;
  }

  function fromRecords(records, fresh) {
    const state = fresh;
    const byId = (a, b) => (a.id || 0) - (b.id || 0);
    for (const key of Object.keys(records)) {
      const value = JSON.parse(records[key]);
      if (key === 'settings') state.settings = value;
      else if (key === 'meta') Object.assign(state, value);
      else if (key.startsWith('batch_')) state.batches.push(value);
      else if (key.startsWith('reading_')) state.readings.push(value);
      else if (key.startsWith('care_')) state.careLog.push(value);
      else if (key.startsWith('plan_')) state.plan.push(value);
    }
    state.batches.sort(byId);
    state.careLog.sort(byId);
    state.plan.sort(byId);
    state.readings.sort((a, b) => (a.on === b.on ? byId(a, b) : a.on < b.on ? -1 : 1));
    return state;
  }

  function diffRecords(before, after) {
    const upserts = Object.keys(after).filter((k) => before[k] !== after[k]);
    const removes = Object.keys(before).filter((k) => !(k in after));
    return { upserts, removes };
  }

  function sameRecords(a, b) {
    const { upserts, removes } = diffRecords(a, b);
    return !upserts.length && !removes.length;
  }

  // backend: write(key, value), remove(key), subscribe(callback) -> unsubscribe.
  // A snapshot is { records, fromCache, pending } and already includes this phone's
  // own unsent writes, which is how Firestore's offline cache behaves.
  class SyncEngine {
    constructor({ backend, getRecords, applyRecords, loadBase, saveBase, onStatus = () => {} }) {
      Object.assign(this, { backend, getRecords, applyRecords, loadBase, saveBase, onStatus });
      this.base = null;
      this.unsubscribe = null;
    }

    start() {
      this.base = this.loadBase();
      // Changes made while the app couldn't reach Firebase go out first.
      if (this.base) this.localChanged();
      this.unsubscribe = this.backend.subscribe((snapshot) => this.onSnapshot(snapshot));
    }

    stop() {
      if (this.unsubscribe) this.unsubscribe();
      this.unsubscribe = null;
    }

    setBase(records) {
      this.base = records;
      this.saveBase(records);
    }

    localChanged() {
      if (!this.base) return; // The first sync hasn't happened, and it will include this.
      const next = this.getRecords();
      const { upserts, removes } = diffRecords(this.base, next);
      if (!upserts.length && !removes.length) return;
      this.setBase(next);
      for (const key of upserts) this.backend.write(key, next[key]);
      for (const key of removes) this.backend.remove(key);
    }

    onSnapshot({ records, fromCache, pending }) {
      if (pending) this.onStatus('saving');
      else this.onStatus(fromCache ? 'offline' : 'synced');

      if (!this.base) {
        // First sync on this phone. It needs the real server copy, so it doesn't
        // mistake an empty offline cache for an empty household.
        if (fromCache) {
          this.onStatus('waiting');
          return;
        }
        const local = this.getRecords();
        const merged = { ...local, ...records };
        this.setBase(merged);
        for (const key of Object.keys(local)) {
          if (!(key in records)) this.backend.write(key, local[key]);
        }
        if (!sameRecords(local, merged)) this.applyRecords(merged);
        return;
      }

      const current = this.getRecords();
      this.setBase(records);
      if (!sameRecords(current, records)) this.applyRecords(records);
    }
  }

  const api = { stable, toRecords, fromRecords, diffRecords, sameRecords, SyncEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TowerSyncCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
