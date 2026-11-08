// A stand-in for Firestore, used only by tests. Each phone sees the server plus its own
// unsent writes, and a phone that's offline keeps working from what it last saw.
class Server {
  constructor() {
    this.docs = {};
    this.phones = [];
    this.writes = 0;
  }

  apply(op) {
    this.writes++;
    if (op.remove) delete this.docs[op.key];
    else this.docs[op.key] = op.value;
    for (const phone of this.phones) phone.notify();
  }
}

class FakeBackend {
  constructor(server, online = true) {
    Object.assign(this, { server, online, queue: [], callback: null, lastSeen: {} });
    server.phones.push(this);
  }

  view() {
    const records = { ...(this.online ? this.server.docs : this.lastSeen) };
    for (const op of this.queue) {
      if (op.remove) delete records[op.key];
      else records[op.key] = op.value;
    }
    return records;
  }

  notify() {
    if (!this.callback) return;
    if (this.online) this.lastSeen = { ...this.server.docs };
    this.callback({ records: this.view(), fromCache: !this.online, pending: this.queue.length > 0 });
  }

  send(op) {
    if (this.online) this.server.apply(op);
    else {
      this.queue.push(op);
      this.notify();
    }
  }

  write(key, value) { this.send({ key, value }); }

  remove(key) { this.send({ key, remove: true }); }

  subscribe(callback) {
    this.callback = callback;
    this.notify();
    return () => { this.callback = null; };
  }

  goOffline() {
    this.lastSeen = { ...this.server.docs };
    this.online = false;
  }

  goOnline() {
    this.online = true;
    const queue = this.queue;
    this.queue = [];
    for (const op of queue) this.server.apply(op);
    this.notify();
  }
}

module.exports = { Server, FakeBackend };
