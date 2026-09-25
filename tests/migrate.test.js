/* Gate 2 evidence: v1 → v2 migration preserves data and calculation results exactly. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');
const M = require('../js/model.js');
const G = require('../js/migrate.js');
const { cases } = require('./baseline-cases.js');

const results = (p) => p.rooms.map((r) => C.calcRoom(r, p).capacity);

test('every regression project migrates with identical payload and identical results', () => {
  for (const [name, make] of Object.entries(cases)) {
    const v1 = make();
    const before = JSON.stringify(v1);
    const out = G.migrateV1Project(v1, { user: 'tester', source: 'localStorage' });
    assert.equal(JSON.stringify(v1), before, `${name}: input mutated`);
    assert.deepEqual(out.revision.data, v1, `${name}: revision payload differs`);
    assert.deepEqual(out.project.working.data, v1, `${name}: working copy differs`);
    assert.deepEqual(results(out.revision.data), results(v1), `${name}: results differ`);
    assert.deepEqual(G.toV1(out.revision), v1, `${name}: rollback export differs`);
    assert.equal(out.revision.rev, '00');
    assert.equal(out.project.currentRevId, out.revision.id);
  }
});

test('customer is created from info.client and re-used case-insensitively', () => {
  const v1 = M.exampleProject();
  const a = G.migrateV1Project(v1, {});
  assert.ok(a.customerCreated);
  assert.equal(a.customer.name, 'Demo client');
  const b = G.migrateV1Project({ ...v1, info: { ...v1.info, client: '  demo CLIENT ' } }, { customers: [a.customer] });
  assert.equal(b.customerCreated, false);
  assert.equal(b.project.customerId, a.customer.id);
});

test('project IDs are unique across migrations', () => {
  const ids = new Set(Array.from({ length: 200 }, () => G.migrateV1Project(M.exampleProject()).project.id));
  assert.equal(ids.size, 200);
});

test('invalid files are rejected with readable reasons and never executed', () => {
  assert.equal(G.validateV1(null).ok, false);
  assert.equal(G.validateV1({ info: {}, design: {}, rooms: 'x' }).ok, false);
  assert.match(G.validateV1({ version: 7, info: {}, design: {}, rooms: [] }).errors[0], /Unsupported project version/);
  const bad = G.validateV1({ info: {}, design: {}, rooms: [{ name: 'R1', dims: {} }] });
  assert.ok(bad.errors.some((e) => /R1.*cond/.test(e)));
  assert.throws(() => G.migrateV1Project({ rooms: 5 }), /Invalid v1 project/);
  // content that looks like code stays inert data
  const v1 = M.exampleProject();
  v1.info.name = '<img src=x onerror=alert(1)>';
  assert.equal(G.migrateV1Project(v1).project.name, '<img src=x onerror=alert(1)>');
});
