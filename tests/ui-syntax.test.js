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

test('every v1 input is still available in v2 (or mapped to a v2 structure)', () => {
  const v1 = fs.readFileSync(path.join(root, 'legacy/app-v1.js'), 'utf8');
  const v2 = ['js/ui/views-design.js', 'js/ui/views-project.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const keys = (src, re) => new Set([...src.matchAll(re)].map((m) => m[1]));
  const k1 = keys(v1, /(?:field|cell)\(\s*[\w.[\]=|{}: ,0-9]*?,\s*'(\w+)'/g);
  const k2 = new Set([...keys(v2, /(?:F|FM|field|cell|f)\(\s*[\w.[\]=|{}: ,0-9]*?,\s*'(\w+)'/g), ...keys(v2, /FM\('(\w+)'/g)]);
  // v1 project-info fields replaced by v2 structures: customer record, Prepared/Created by, site/city/country, revision system
  const mapped = new Set(['client', 'engineer', 'location', 'rev']);
  const missing = [...k1].filter((k) => !k2.has(k) && !mapped.has(k));
  assert.ok(k1.size > 90, `parsed ${k1.size} v1 inputs`);
  assert.deepEqual(missing, []);
});
