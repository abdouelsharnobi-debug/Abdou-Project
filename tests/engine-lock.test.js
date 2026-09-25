/*
 * Engine lock: the files that make up calculation engine 1.0.0 must not change without a
 * Gate 3 approval, a new ENGINE_VERSION (js/core/version.js) and a new baseline.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const version = require('../js/core/version.js');
const locked = require(`./fixtures/engine-${version.ENGINE_VERSION}.sha256.json`);

test(`engine ${version.ENGINE_VERSION} files are unchanged`, () => {
  for (const [file, hash] of Object.entries(locked)) {
    const now = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', file))).digest('hex');
    assert.equal(now, hash, `${file} changed: engine changes require Gate 3 approval and a new ENGINE_VERSION`);
  }
});
