/* DP-AUTH — accesso con passkey (ripiego: password) per Diario Protocollo. Identico in index.html e v2.html.
   Sorgente: tools/auth/dp-auth.js; inserito da tools/auth/apply.py tra i marcatori DP-AUTH:BEGIN/END.
   AUTH_REQUIRED = false  -> modalita' permissiva: l'app funziona anche senza accesso (schermata chiudibile).
   AUTH_REQUIRED = true   -> senza sessione le chiamate al proxy vengono bloccate nel browser e compare l'accesso.
   Il proxy (diario-proxy v13) e' l'unico controllo che conta davvero: questo codice e' pubblico. */
(function () {
  'use strict';
  var AUTH_REQUIRED = false;                       // <- interruttore unico
  var SB_URL = 'https://viarmvaukgwdoursfnwu.supabase.co';
  var SB_KEY = 'sb_publishable_ppqlo1IbPDjWqnkw_h5wuA_WH8dCtPx';
  var PROXY = SB_URL + '/functions/v1/diario-proxy';
  var LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.js';
  var LIB_SRI = 'sha384-ysv13JVP3fufiEXfjML9OdCa/rRbMJvUBOWyor82wfuK8INNZAvmbxHgKIHi+oqz';
  var sb = null, session = null, libP = null, overlay = null, chip = null;

  function loadLib() {
    if (libP) return libP;
    libP = new Promise(function (res, rej) {
      if (window.supabase && window.supabase.createClient) return res();
      var s = document.createElement('script');
      s.src = LIB; s.integrity = LIB_SRI; s.crossOrigin = 'anonymous';
      s.onload = res; s.onerror = function () { libP = null; rej(new Error('Libreria di accesso non caricata')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  function client() {
    return loadLib().then(function () {
      if (!sb) sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { storageKey: 'dp-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, experimental: { passkey: true } } });
      return sb;
    });
  }
  // Sessione corrente (rinnovata se in scadenza). Mai eccezioni: null se non c'e'.
  function getSess() {
    return client().then(function (c) { return c.auth.getSession(); })
      .then(function (r) { session = (r && r.data && r.data.session) || null; return session; })
      .catch(function () { return session; });
  }

  // ── fetch: aggiunge il token ai soli URL del proxy ──────────────────────
  var origFetch = window.fetch.bind(window);
  function isProxy(u) { return typeof u === 'string' && u.indexOf(PROXY) === 0; }
  function withToken(init, tok) {
    var i = Object.assign({}, init || {}), h = new Headers(i.headers || {});
    h.set('Authorization', 'Bearer ' + tok); i.headers = h; return i;
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (typeof input !== 'string' || !isProxy(url)) return origFetch(input, init);   // solo chiamate con URL stringa verso il proxy
    return getSess().then(function (s) {
      if (!s) {
        if (AUTH_REQUIRED) { showLogin(); return Promise.reject(new TypeError('Accesso richiesto')); }
        return origFetch(input, init);
      }
      return origFetch(input, withToken(init, s.access_token)).then(function (r) {
        if (r.status !== 401) return r;
        return client().then(function (c) { return c.auth.refreshSession(); }).then(function (rr) {
          var ns = rr && rr.data && rr.data.session;
          if (!ns) { session = null; showLogin(); return r; }
          session = ns; return origFetch(input, withToken(init, ns.access_token));
        }).catch(function () { return r; });
      });
    });
  };

  // ── interfaccia ─────────────────────────────────────────────────────────
  var CSS = '#dpa{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:16px;font:14px/1.4 -apple-system,system-ui,sans-serif}' +
    '#dpa .b{background:#0a0a0c;color:#fff;border-radius:16px;padding:22px 18px;width:100%;max-width:340px;display:flex;flex-direction:column;gap:12px}' +
    '#dpa h2{margin:0;font-size:22px}#dpa p{margin:0;color:#aeaeb2;font-size:13px}' +
    '#dpa button{font:inherit;border:0;border-radius:12px;padding:13px;min-height:44px;width:100%;cursor:pointer}' +
    '#dpa .p{background:#5b95e8;color:#fff;font-weight:600}#dpa .s{background:transparent;color:#aeaeb2;border:1px solid #38383a}#dpa .l{background:none;color:#aeaeb2;min-height:36px;font-size:12px;text-decoration:underline}' +
    '#dpa input{font:inherit;font-size:16px;width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #38383a;background:#1c1c1e;color:#fff;min-height:44px}' +
    '#dpa .e{color:#ff3b30;font-size:12px;min-height:16px}' +
    '#dpc{position:fixed;left:max(8px,env(safe-area-inset-left));bottom:max(8px,env(safe-area-inset-bottom));z-index:2147482000;display:flex;gap:6px}' +
    '#dpc button{font:600 11px/1 -apple-system,system-ui,sans-serif;border:0;border-radius:99px;min-height:32px;padding:0 12px;background:rgba(10,10,12,.72);color:#fff;cursor:pointer;opacity:.75}';
  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function ensureCss() { if (!document.getElementById('dpa-css')) { var s = el('style', { id: 'dpa-css' }); s.textContent = CSS; document.head.appendChild(s); } }
  function say(msg) { var e = document.getElementById('dpa-err'); if (e) e.textContent = msg || ''; }
  function msgOf(err) { var m = (err && err.message) || ''; return /invalid login/i.test(m) ? 'Email o password non corretta.' : (m || 'Accesso non riuscito.'); }

  function showLogin(pw) {
    ensureCss();
    if (overlay) overlay.remove();
    overlay = el('div', { id: 'dpa', role: 'dialog', 'aria-modal': 'true' });
    var h = pw
      ? '<div class="b"><h2>Accedi con password</h2><input id="dpa-em" type="email" autocomplete="username" placeholder="Email"><input id="dpa-pw" type="password" autocomplete="current-password" placeholder="Password"><button class="p" id="dpa-go">Accedi</button><button class="s" id="dpa-back">← Torna alla passkey</button><div class="e" id="dpa-err"></div></div>'
      : '<div class="b"><h2>Diario Protocollo</h2><p>Accedi per vedere e salvare i tuoi dati.</p><button class="p" id="dpa-pk">Accedi con passkey</button><button class="s" id="dpa-pwb">Usa la password</button><div class="e" id="dpa-err"></div><p style="font-size:11px">Una sola volta per dispositivo: la sessione resta attiva.</p>' + (AUTH_REQUIRED ? '' : '<button class="l" id="dpa-later">Più tardi</button>') + '</div>';
    overlay.innerHTML = h; document.body.appendChild(overlay);
    var $ = function (id) { return document.getElementById(id); };
    if (pw) {
      $('dpa-back').onclick = function () { showLogin(false); };
      $('dpa-go').onclick = function () {
        var em = $('dpa-em').value.trim(), p = $('dpa-pw').value; if (!em || !p) return say('Inserisci email e password.');
        say('Accesso in corso…');
        client().then(function (c) { return c.auth.signInWithPassword({ email: em, password: p }); })
          .then(function (r) { if (r.error) say(msgOf(r.error)); else done(); }).catch(function (e) { say(msgOf(e)); });
      };
    } else {
      $('dpa-pwb').onclick = function () { showLogin(true); };
      if ($('dpa-later')) $('dpa-later').onclick = function () { overlay.remove(); overlay = null; };
      $('dpa-pk').onclick = function () {
        say('Segui la richiesta del dispositivo…');
        client().then(function (c) { return c.auth.signInWithPasskey(); })
          .then(function (r) { if (r && r.error) say(msgOf(r.error) + ' Prova con la password.'); else done(); })
          .catch(function (e) { say((e && e.message ? e.message : 'Passkey non disponibile') + ' Prova con la password.'); });
      };
    }
  }
  function done() { if (overlay) { overlay.remove(); overlay = null; } location.reload(); }   // ricarica: l'app riparte con la sessione

  function showChip() {
    ensureCss(); if (chip) chip.remove();
    chip = el('div', { id: 'dpc' });
    var out = el('button', { type: 'button' }, 'Esci'); out.onclick = function () { client().then(function (c) { return c.auth.signOut(); }).then(function () { location.reload(); }); };
    var pk = el('button', { type: 'button' }, '+ Passkey'); pk.title = 'Aggiungi una passkey su questo dispositivo';
    pk.onclick = function () { client().then(function (c) { return c.auth.registerPasskey(); }).then(function (r) { alert(r && r.error ? 'Passkey non registrata: ' + r.error.message : 'Passkey registrata su questo dispositivo.'); }).catch(function (e) { alert('Passkey non registrata: ' + e.message); }); };
    chip.appendChild(pk); chip.appendChild(out); document.body.appendChild(chip);
  }

  window.dpAuth = { required: function () { return AUTH_REQUIRED; }, session: function () { return session; }, show: function () { showLogin(false); }, ready: null };
  function start() {
    var skip = false; try { skip = !AUTH_REQUIRED && localStorage.getItem('dp-auth-skip') === '1'; } catch (e) {}   // solo per i test automatici (solo UI)
    if (skip) return;
    window.dpAuth.ready = getSess().then(function (s) { if (s) showChip(); else showLogin(false); }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
