/* Every browser script must parse, and index.html must load each one exactly once. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

test('all browser scripts parse and are referenced by index.html', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(srcs).size, srcs.length, 'duplicate script');
  for (const s of srcs) {
    const code = fs.readFileSync(path.join(root, s), 'utf8');
    assert.doesNotThrow(() => new Function(code), s);
  }
  const ui = fs.readdirSync(path.join(root, 'js/ui')).map((f) => `js/ui/${f}`);
  const core = fs.readdirSync(path.join(root, 'js/core')).map((f) => `js/core/${f}`);
  for (const f of [...ui, ...core]) assert.ok(srcs.includes(f), `${f} not loaded by index.html`);
});
