// Connects the app to Firebase. The rules for what to send live in sync-core.js.
// If this can't load, the app keeps working on the phone and catches up next time.
const FIREBASE = 'https://www.gstatic.com/firebasejs/13.2.0';
const app = window.TowerApp;
const core = window.TowerSyncCore;
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const useFake = isLocal && new URLSearchParams(location.search).has('fake');

async function firebaseBackend(config) {
  const [{ initializeApp }, auth, store] = await Promise.all([
    import(`${FIREBASE}/firebase-app.js`),
    import(`${FIREBASE}/firebase-auth.js`),
    import(`${FIREBASE}/firebase-firestore.js`),
  ]);
  const firebaseApp = initializeApp(config);
  const authClient = auth.getAuth(firebaseApp);
  const db = store.initializeFirestore(firebaseApp, {
    localCache: store.persistentLocalCache({ tabManager: store.persistentMultipleTabManager() }),
  });
  return {
    onAuth: (callback) => auth.onAuthStateChanged(authClient, callback),
    signIn: (email, password) => auth.signInWithEmailAndPassword(authClient, email, password),
    signOut: () => auth.signOut(authClient),
    open(uid, onError) {
      const records = store.collection(db, 'households', uid, 'records');
      return {
        write(key, json) {
          store.setDoc(store.doc(records, key), { json, updatedAt: store.serverTimestamp() }).catch(onError);
        },
        remove(key) {
          store.deleteDoc(store.doc(records, key)).catch(onError);
        },
        subscribe(callback) {
          return store.onSnapshot(records, { includeMetadataChanges: true }, (snapshot) => {
            const docs = {};
            snapshot.forEach((d) => { docs[d.id] = d.data().json; });
            callback({ records: docs, fromCache: snapshot.metadata.fromCache, pending: snapshot.metadata.hasPendingWrites });
          }, onError);
        },
      };
    },
  };
}

const SIGN_IN_ERRORS = {
  'auth/invalid-credential': 'That email or password isn’t right.',
  'auth/wrong-password': 'That email or password isn’t right.',
  'auth/user-not-found': 'That email or password isn’t right.',
  'auth/invalid-email': 'That doesn’t look like an email address.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'Couldn’t reach the internet. Try again when you’re connected.',
};

async function start() {
  let backend;
  try {
    backend = useFake
      ? await (await import('./test/fake-browser-backend.js')).fakeBackend()
      : await firebaseBackend(window.TOWER_FIREBASE);
  } catch (error) {
    // Most likely offline with nothing cached yet. Everything still saves on the phone.
    app.setSync({ status: 'unavailable' });
    return;
  }

  let engine = null;
  app.setSync({
    signIn: async (email, password) => {
      try {
        await backend.signIn(email, password);
        return '';
      } catch (error) {
        return SIGN_IN_ERRORS[error.code] || 'Couldn’t sign in. Please try again.';
      }
    },
    signOut: () => backend.signOut(),
  });

  backend.onAuth((user) => {
    if (engine) engine.stop();
    engine = null;
    app.onLocalChange = null;
    if (!user) {
      app.setSync({ signedIn: false, email: '', status: '' });
      return;
    }
    const baseKey = `${app.storageKey}-synced-${user.uid}`;
    const onError = (error) => app.setSync({ status: 'error', error: error.code || error.message });
    engine = new core.SyncEngine({
      backend: backend.open(user.uid, onError),
      getRecords: () => core.toRecords(app.state()),
      applyRecords: (records) => app.applyRemote(core.fromRecords(records, window.Tower.newState())),
      loadBase: () => JSON.parse(localStorage.getItem(baseKey) || 'null'),
      saveBase: (records) => localStorage.setItem(baseKey, JSON.stringify(records)),
      onStatus: (status) => app.setSync({ status, error: '' }),
    });
    app.onLocalChange = () => engine.localChanged();
    app.setSync({ signedIn: true, email: user.email || '' });
    engine.start();
  });
}

if (window.TOWER_FIREBASE || useFake) start();
