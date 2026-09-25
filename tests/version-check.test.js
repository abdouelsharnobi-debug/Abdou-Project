/* "New version available" check: compares the installed build with the latest published one. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareBuilds, checkLatest } = require('../desktop/version-check.js');

const inst = { format: 'coldload-update', version: '2.1.0', builtAt: '2026-09-25T05:00:00.000Z', sha256: 'a'.repeat(64) };

test('version check: newer published build is reported; same or older is not', () => {
  assert.equal(compareBuilds(inst, { ...inst }).status, 'up-to-date');
  assert.equal(compareBuilds(inst, { ...inst, sha256: 'b'.repeat(64), builtAt: '2026-09-26T00:00:00.000Z' }).status, 'available');
  assert.equal(compareBuilds(inst, { ...inst, sha256: 'b'.repeat(64), builtAt: '2026-09-20T00:00:00.000Z' }).status, 'up-to-date', 'older build is never offered');
  assert.equal(compareBuilds(inst, { ...inst, builtAt: '2026-09-26T00:00:00.000Z' }).status, 'up-to-date', 'same bundle, only rebuilt');
  assert.equal(compareBuilds(inst, { nonsense: 1 }).status, 'invalid');
});

test('version check: network answers are validated', async () => {
  const fake = (status, body) => async () => ({ ok: status === 200, status, text: async () => body });
  const r = await checkLatest(fake(200, JSON.stringify({ ...inst, sha256: 'c'.repeat(64), builtAt: '2026-10-01T00:00:00Z', version: '2.2.0' })), 'x', inst);
  assert.equal(r.status, 'available'); assert.equal(r.version, '2.2.0');
  await assert.rejects(checkLatest(fake(404, ''), 'x', inst), /no published version/);
  await assert.rejects(checkLatest(fake(200, '<html>'), 'x', inst), /not readable/);
  await assert.rejects(checkLatest(fake(200, '{"a":1}'), 'x', inst), /not valid/);
});
