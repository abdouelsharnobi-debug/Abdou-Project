/*
 * Storage adapters with one async interface:
 *   get(store, key) · all(store) · byIndex(store, field, value) · put(store, value)
 *   del(store, key) · batch([{op:'put'|'del', store, value|key}]) — atomic · clear(store)
 * IDBAdapter: browser IndexedDB (schema v2). MemoryAdapter: tests and fallback.
 */
(function (root) {
  'use strict';

  const STORES = {
    meta: { key: 'key' },
    users: { key: 'id', indexes: ['username'] },
    sessions: { key: 'id', indexes: ['userId'] },
    companies: { key: 'id', indexes: ['name'] },
    customers: { key: 'id', indexes: ['name'] },
    projects: { key: 'id', indexes: ['projectNo', 'customerId', 'status', 'modifiedAt', 'archived'] },
    revisions: { key: 'id', indexes: ['projectId'] },
    templates: { key: 'id', indexes: ['kind'] },
    climate: { key: 'id', indexes: ['country'] },
    references: { key: 'id', indexes: ['topic'] },
    attachments: { key: 'id', indexes: ['projectId'] },
    settings: { key: 'key' },
    safetyBackups: { key: 'id', indexes: ['createdAt'] },
    auditLog: { key: 'id', indexes: ['entityId'] },
  };

  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

  class MemoryAdapter {
    constructor() { this.kind = 'memory'; this.s = {}; for (const k of Object.keys(STORES)) this.s[k] = new Map(); }
    _k(store, v) { return v[STORES[store].key]; }
    async get(store, key) { return clone(this.s[store].get(key)); }
    async all(store) { return [...this.s[store].values()].map(clone); }
    async byIndex(store, field, value) { return [...this.s[store].values()].filter((v) => v[field] === value).map(clone); }
    async put(store, value) { this.s[store].set(this._k(store, value), clone(value)); return value; }
    async del(store, key) { this.s[store].delete(key); }
    async clear(store) { this.s[store].clear(); }
    async batch(ops) {
      for (const o of ops) {
        if (!this.s[o.store]) throw new Error(`Unknown store ${o.store}`);
        if (o.op === 'put' && this._k(o.store, o.value) == null) throw new Error(`Missing key for ${o.store}`);
      }
      for (const o of ops) o.op === 'put' ? this.s[o.store].set(this._k(o.store, o.value), clone(o.value)) : this.s[o.store].delete(o.key);
    }
    async estimate() { return null; }
  }

  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  class IDBAdapter {
    constructor(db) { this.kind = 'indexeddb'; this.db = db; }
    static open(name = 'coldload', version = 2) {
      return new Promise((res, rej) => {
        if (!root.indexedDB) { rej(new Error('IndexedDB is not available in this browser.')); return; }
        const r = root.indexedDB.open(name, version);
        r.onupgradeneeded = () => {
          const db = r.result;
          for (const [name, def] of Object.entries(STORES)) {
            const os = db.objectStoreNames.contains(name) ? r.transaction.objectStore(name) : db.createObjectStore(name, { keyPath: def.key });
            for (const ix of def.indexes || []) if (!os.indexNames.contains(ix)) os.createIndex(ix, ix);
          }
        };
        r.onsuccess = () => res(new IDBAdapter(r.result));
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('The database is open in another tab with an older version. Close other ColdLoad tabs and reload.'));
      });
    }
    _os(store, mode = 'readonly') { return this.db.transaction(store, mode).objectStore(store); }
    get(store, key) { return req(this._os(store).get(key)); }
    all(store) { return req(this._os(store).getAll()); }
    byIndex(store, field, value) {
      const os = this._os(store);
      if (typeof value === 'boolean' || !os.indexNames.contains(field)) return this.all(store).then((a) => a.filter((v) => v[field] === value));
      return req(os.index(field).getAll(value));
    }
    put(store, value) { return req(this._os(store, 'readwrite').put(value)).then(() => value); }
    del(store, key) { return req(this._os(store, 'readwrite').delete(key)); }
    clear(store) { return req(this._os(store, 'readwrite').clear()); }
    batch(ops) {
      const names = [...new Set(ops.map((o) => o.store))];
      if (!names.length) return Promise.resolve();
      return new Promise((res, rej) => {
        let tx;
        try { tx = this.db.transaction(names, 'readwrite'); } catch (e) { rej(e); return; }
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('Transaction aborted'));
        try {
          for (const o of ops) o.op === 'put' ? tx.objectStore(o.store).put(o.value) : tx.objectStore(o.store).delete(o.key);
        } catch (e) { tx.abort(); rej(e); }
      });
    }
    async estimate() {
      try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; }
    }
  }

  const api = { STORES, MemoryAdapter, IDBAdapter };
  root.CL = root.CL || {};
  root.CL.db = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
