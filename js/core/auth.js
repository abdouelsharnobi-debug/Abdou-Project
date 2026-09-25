/*
 * Local user accounts. Passwords: PBKDF2-SHA256, 310 000 iterations, 16-byte random salt
 * (WebCrypto). No default or hard-coded passwords — the first account is created on setup.
 * This controls access to the app on this computer; it does not encrypt stored data.
 */
(function (root) {
  'use strict';
  const ITER = 310000;
  const SESSION_H = 12, REMEMBER_D = 14;
  const subtle = () => {
    const c = root.crypto;
    if (!c || !c.subtle) throw new Error('Secure cryptography (WebCrypto) is not available in this browser.');
    return c.subtle;
  };
  const b64 = (buf) => {
    const a = new Uint8Array(buf); let s = '';
    for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return (root.btoa ? root.btoa(s) : Buffer.from(s, 'binary').toString('base64'));
  };
  const unb64 = (s) => {
    const bin = root.atob ? root.atob(s) : Buffer.from(s, 'base64').toString('binary');
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  const uuid = () => root.crypto.randomUUID();
  const eqConst = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

  async function hashPassword(password, saltB64, iterations = ITER) {
    const salt = saltB64 ? unb64(saltB64) : root.crypto.getRandomValues(new Uint8Array(16));
    const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return { algo: 'PBKDF2-SHA256', iterations, salt: b64(salt), hash: b64(bits) };
  }

  function passwordProblems(pw) {
    const p = [];
    if (typeof pw !== 'string' || pw.length < 8) p.push('at least 8 characters');
    if (!/[A-Za-z]/.test(pw || '') || !/[0-9]/.test(pw || '')) p.push('letters and numbers');
    return p;
  }

  function createAuth(store) {
    async function hasUsers() { return (await store.all('users')).length > 0; }

    async function createUser({ username, displayName, email, password, role = 'engineer' }) {
      const u = String(username || '').trim().toLowerCase();
      if (!/^[a-z0-9._@-]{3,64}$/.test(u)) throw new Error('Username must be 3–64 characters: letters, numbers, . _ @ -');
      if ((await store.byIndex('users', 'username', u)).length) throw new Error('This username already exists.');
      const probs = passwordProblems(password);
      if (probs.length) throw new Error('Password must contain ' + probs.join(' and ') + '.');
      const user = {
        id: uuid(), username: u, displayName: String(displayName || username).trim(), email: String(email || '').trim(),
        role, pw: await hashPassword(password), createdAt: new Date().toISOString(), lastLoginAt: null,
        prefs: { theme: 'system', units: 'SI', powerUnit: 'kW', dateFormat: 'YYYY-MM-DD', autosaveSec: 0 },
      };
      await store.put('users', user);
      return publicUser(user);
    }

    function publicUser(u) { const { pw, ...rest } = u; return rest; }

    async function verify(username, password) {
      const u = (await store.byIndex('users', 'username', String(username || '').trim().toLowerCase()))[0];
      if (!u) { await hashPassword(String(password || ''), null, 1000); return null; } // similar code path
      const h = await hashPassword(String(password || ''), u.pw.salt, u.pw.iterations);
      return eqConst(h.hash, u.pw.hash) ? u : null;
    }

    async function signIn(username, password, remember) {
      const u = await verify(username, password);
      if (!u) throw new Error('Incorrect username or password.');
      const now = Date.now();
      const session = { id: uuid() + uuid(), userId: u.id, createdAt: new Date(now).toISOString(), remember: !!remember,
        expiresAt: new Date(now + (remember ? REMEMBER_D * 864e5 : SESSION_H * 36e5)).toISOString() };
      u.lastLoginAt = session.createdAt;
      await store.batch([{ op: 'put', store: 'sessions', value: session }, { op: 'put', store: 'users', value: u }]);
      return { session, user: publicUser(u) };
    }

    async function resume(sessionId) {
      if (!sessionId) return null;
      const s = await store.get('sessions', sessionId);
      if (!s || new Date(s.expiresAt) < new Date()) { if (s) await store.del('sessions', s.id); return null; }
      const u = await store.get('users', s.userId);
      return u ? { session: s, user: publicUser(u) } : null;
    }

    async function signOut(sessionId) { if (sessionId) await store.del('sessions', sessionId); }

    async function changePassword(userId, oldPw, newPw) {
      const u = await store.get('users', userId);
      if (!u || !(await verify(u.username, oldPw))) throw new Error('Current password is incorrect.');
      const probs = passwordProblems(newPw);
      if (probs.length) throw new Error('New password must contain ' + probs.join(' and ') + '.');
      u.pw = await hashPassword(newPw);
      const others = (await store.byIndex('sessions', 'userId', userId)).map((s) => ({ op: 'del', store: 'sessions', key: s.id }));
      await store.batch([{ op: 'put', store: 'users', value: u }, ...others]);
    }

    async function updateProfile(userId, patch) {
      const u = await store.get('users', userId);
      for (const k of ['displayName', 'email']) if (patch[k] !== undefined) u[k] = String(patch[k]);
      if (patch.prefs) u.prefs = { ...u.prefs, ...patch.prefs };
      await store.put('users', u);
      return publicUser(u);
    }

    async function listUsers() { return (await store.all('users')).map(publicUser); }

    return { hasUsers, createUser, signIn, resume, signOut, changePassword, updateProfile, listUsers, verify };
  }

  const api = { createAuth, hashPassword, passwordProblems, ITERATIONS: ITER };
  root.CL = root.CL || {};
  root.CL.auth = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
