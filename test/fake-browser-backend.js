// A pretend Firebase for trying two phones in two browser tabs on this computer.
// Only loads on localhost with ?fake in the address. Open ?fake&phone=a and ?fake&phone=b.
const SERVER_KEY = 'fake-firebase-server';

export function fakeBackend() {
  const channel = new BroadcastChannel('fake-firebase');
  const phone = new URLSearchParams(location.search).get('phone') || 'a';
  const authKey = `fake-firebase-user-${phone}`;
  const read = () => JSON.parse(localStorage.getItem(SERVER_KEY) || '{}');
  let authCallback = () => {};
  let online = true;
  let queue = [];
  let seen = read();
  let snapshotCallback = null;

  const view = () => {
    const records = { ...(online ? read() : seen) };
    for (const op of queue) {
      if (op.remove) delete records[op.key];
      else records[op.key] = op.value;
    }
    return records;
  };
  const notify = () => {
    if (online) seen = read();
    if (snapshotCallback) snapshotCallback({ records: view(), fromCache: !online, pending: queue.length > 0 });
  };
  const applyOp = (op) => {
    const docs = read();
    if (op.remove) delete docs[op.key];
    else docs[op.key] = op.value;
    localStorage.setItem(SERVER_KEY, JSON.stringify(docs));
  };
  const send = (op) => {
    if (online) {
      applyOp(op);
      notify();
      channel.postMessage('changed');
    } else {
      queue.push(op);
      notify();
    }
  };
  channel.onmessage = () => { if (online) notify(); };

  window.fakeNetwork = (isOnline) => {
    online = isOnline;
    if (online) {
      const pending = queue;
      queue = [];
      pending.forEach(applyOp);
      channel.postMessage('changed');
    }
    notify();
  };

  const user = () => (localStorage.getItem(authKey) ? { uid: 'household', email: localStorage.getItem(authKey) } : null);
  return {
    onAuth(callback) {
      authCallback = callback;
      setTimeout(() => callback(user()), 0);
    },
    async signIn(email, password) {
      if (password !== 'correct-test-password') {
        throw Object.assign(new Error('bad'), { code: 'auth/invalid-credential' });
      }
      localStorage.setItem(authKey, email);
      authCallback(user());
    },
    async signOut() {
      localStorage.removeItem(authKey);
      authCallback(null);
    },
    open() {
      return {
        write: (key, value) => send({ key, value }),
        remove: (key) => send({ key, remove: true }),
        subscribe(callback) {
          snapshotCallback = callback;
          setTimeout(notify, 0);
          return () => { snapshotCallback = null; };
        },
      };
    },
  };
}
