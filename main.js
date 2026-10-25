// Entry point: checks the setup, shows the sign-in screen, then starts the budget screen.
import { startApp, toast } from './app.js';

const $ = (id) => document.getElementById(id);
const show = (id) => {
  for (const s of ['screenLoading', 'screenSetup', 'screenAuth', 'screenApp']) $(s).hidden = s !== id;
};

function configured(cfg) {
  return !!(cfg && cfg.apiKey && cfg.projectId && cfg.appId &&
    ![cfg.apiKey, cfg.projectId, cfg.appId].some((v) => String(v).startsWith('PASTE')));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

(async function main() {
  const cfg = window.BUDGET_FIREBASE_CONFIG;
  if (!configured(cfg)) {
    $('setupMsg').textContent = 'The settings in config.js are still the placeholders.';
    show('screenSetup');
    return;
  }

  let backend, authMod;
  try {
    authMod = await import('./firebase-store.js');
    backend = await authMod.createBackend(cfg);
  } catch (e) {
    $('setupMsg').textContent = 'The app could not load Firebase. Check your internet connection and reload.';
    show('screenSetup');
    return;
  }

  let started = false;
  const msg = $('authMsg');
  const setMsg = (text, ok) => { msg.textContent = text || ''; msg.classList.toggle('ok', !!ok); };

  function creds() {
    const email = $('authEmail').value.trim();
    const pass = $('authPass').value;
    return { email, pass };
  }
  async function run(btn, fn) {
    const buttons = [$('signInBtn'), $('signUpBtn'), $('resetBtn')];
    buttons.forEach((b) => { b.disabled = true; });
    setMsg('');
    try { await fn(); } catch (e) { setMsg(authMod.authMessage(e)); }
    buttons.forEach((b) => { b.disabled = false; });
  }

  $('authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const { email, pass } = creds();
    run($('signInBtn'), () => backend.signIn(email, pass));
  });
  $('signUpBtn').addEventListener('click', () => {
    const { email, pass } = creds();
    if (!email || pass.length < 6) { setMsg('Enter your email and a password with at least 6 characters.'); return; }
    $('authPass').setAttribute('autocomplete', 'new-password');
    run($('signUpBtn'), () => backend.signUp(email, pass));
  });
  $('resetBtn').addEventListener('click', () => {
    const { email } = creds();
    if (!email) { setMsg('Enter your email above, then choose Forgot password.'); return; }
    run($('resetBtn'), async () => {
      await backend.resetPassword(email);
      setMsg('If that email has an account, a reset link is on its way.', true);
    });
  });

  backend.onUser((user) => {
    if (user) {
      if (started) return;
      started = true;
      show('screenApp');
      startApp(backend.storeFor(user), {
        email: user.email || '',
        onSignOut: () => backend.signOut().then(() => location.reload(), () => toast('Could not sign out. Try again.'))
      });
    } else {
      started = false;
      show('screenAuth');
    }
  });
})();
