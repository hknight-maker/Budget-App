// Sign-in and sync through Firebase (free Spark plan).
// The Firebase files load straight from Google's CDN in the browser, so there is nothing to install or build.
// Data layout, all private to the signed-in user:
//   users/{uid}/bills/{billId}        name, amount, dueDay, category, paidMonth
//   users/{uid}/paychecks/{id}        date (YYYY-MM-DD), commission (before tax), net (after tax)
//   users/{uid}/checks/{id}           date, forecast, actual, commission, net, implied (logged paychecks)
//   users/{uid}/meta/settings         salary, frequency
//   users/{uid}/budgets/{id}          name, amount (monthly spending categories)
//   users/{uid}/spending/{id}         categoryId, amount, date (YYYY-MM-DD), note

const SDK = 'https://www.gstatic.com/firebasejs/11.10.0/';

const AUTH_MESSAGES = {
  'auth/invalid-email': 'That email address does not look right.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-credential': 'Email or password is wrong. If you have not made an account yet, choose Create account.',
  'auth/wrong-password': 'Email or password is wrong.',
  'auth/user-not-found': 'No account with that email. Choose Create account.',
  'auth/email-already-in-use': 'An account with that email already exists. Choose Sign in.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/operation-not-allowed': 'Email sign-in is not turned on in your Firebase project. See SETUP.md, step 2.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The settings in config.js are not valid. See SETUP.md, step 5.',
  'auth/invalid-api-key': 'The settings in config.js are not valid. See SETUP.md, step 5.',
  'auth/configuration-not-found': 'Sign-in is not set up in your Firebase project yet. See SETUP.md, step 2.'
};
export function authMessage(e) {
  return AUTH_MESSAGES[e && e.code] || ('Something went wrong' + (e && e.code ? ' (' + e.code + ')' : '') + '. Try again.');
}

export async function createBackend(config) {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js')
  ]);

  const app = appMod.initializeApp(config);
  const auth = authMod.getAuth(app);

  // Keep a copy of the data on the device so the app opens instantly and works offline.
  let db;
  try {
    db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
    });
  } catch (e) {
    db = fsMod.getFirestore(app);
  }

  function storeFor(user) {
    const uid = user.uid;
    const billsC = fsMod.collection(db, 'users', uid, 'bills');
    const paysC = fsMod.collection(db, 'users', uid, 'paychecks');
    const settingsD = fsMod.doc(db, 'users', uid, 'meta', 'settings');
    const budgetsC = fsMod.collection(db, 'users', uid, 'budgets');
    const spendC = fsMod.collection(db, 'users', uid, 'spending');
    const checksC = fsMod.collection(db, 'users', uid, 'checks');

    let writeErr = () => {};
    let statusCb = () => {};
    const pendingBy = { bills: false, pays: false, settings: false, budgets: false, spends: false, checks: false };

    function pushStatus() {
      statusCb({
        offline: typeof navigator !== 'undefined' && navigator.onLine === false,
        pending: Object.values(pendingBy).some(Boolean)
      });
    }
    window.addEventListener('online', pushStatus);
    window.addEventListener('offline', pushStatus);

    // A write is applied on this device straight away and confirmed by the server later (or when back online).
    // So report success right away and surface a failure only if the server rejects it.
    function fire(promise) {
      // The timeout makes sure a failure message always appears after the "saved" message, never under it.
      Promise.resolve(promise).catch((e) => setTimeout(() => writeErr(e), 0));
      return Promise.resolve();
    }
    function listen(ref, key, cb, shape) {
      fsMod.onSnapshot(
        ref,
        (snap) => {
          pendingBy[key] = snap.metadata.hasPendingWrites;
          cb(shape(snap));
          pushStatus();
        },
        (e) => writeErr(e)
      );
    }

    return {
      onWriteError: (cb) => { writeErr = cb; },
      onStatus: (cb) => { statusCb = cb; },
      onBills: (cb) => listen(billsC, 'bills', cb, (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onPays: (cb) => listen(paysC, 'pays', cb, (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onSettings: (cb) => listen(settingsD, 'settings', cb, (s) => (s.exists() ? s.data() : {})),
      saveBill: (id, data) => fire(id
        ? fsMod.updateDoc(fsMod.doc(db, 'users', uid, 'bills', id), data)
        : fsMod.addDoc(billsC, { paidMonth: null, createdAt: Date.now(), ...data })),
      patchBill: (id, patch) => fire(fsMod.updateDoc(fsMod.doc(db, 'users', uid, 'bills', id), patch)),
      deleteBill: (id) => fire(fsMod.deleteDoc(fsMod.doc(db, 'users', uid, 'bills', id))),
      addPay: (d) => fire(fsMod.addDoc(paysC, d)),
      deletePay: (id) => fire(fsMod.deleteDoc(fsMod.doc(db, 'users', uid, 'paychecks', id))),
      saveSettings: (s) => fire(fsMod.setDoc(settingsD, s, { merge: true })),
      onBudgets: (cb) => listen(budgetsC, 'budgets', cb, (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onSpends: (cb) => listen(spendC, 'spends', cb, (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      saveBudget: (id, data) => fire(id
        ? fsMod.updateDoc(fsMod.doc(db, 'users', uid, 'budgets', id), data)
        : fsMod.addDoc(budgetsC, { createdAt: Date.now(), ...data })),
      deleteBudget: (id) => fire(fsMod.deleteDoc(fsMod.doc(db, 'users', uid, 'budgets', id))),
      onChecks: (cb) => listen(checksC, 'checks', cb, (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      addCheck: (d) => fire(fsMod.addDoc(checksC, d)),
      deleteCheck: (id) => fire(fsMod.deleteDoc(fsMod.doc(db, 'users', uid, 'checks', id))),
      addSpend: (d) => fire(fsMod.addDoc(spendC, d)),
      deleteSpend: (id) => fire(fsMod.deleteDoc(fsMod.doc(db, 'users', uid, 'spending', id)))
    };
  }

  return {
    onUser: (cb) => authMod.onAuthStateChanged(auth, cb),
    signIn: (email, pass) => authMod.signInWithEmailAndPassword(auth, email, pass),
    signUp: (email, pass) => authMod.createUserWithEmailAndPassword(auth, email, pass),
    resetPassword: (email) => authMod.sendPasswordResetEmail(auth, email),
    signOut: () => authMod.signOut(auth),
    storeFor
  };
}
