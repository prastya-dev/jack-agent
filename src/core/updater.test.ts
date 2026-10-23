// PRD F10 / O-02: pembanding versi untuk updater.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewer } from './updater';

test('isNewer membandingkan angka, bukan string', () => {
  assert.equal(isNewer('1.10.0', '1.9.9'), true);
  assert.equal(isNewer('1.9.9', '1.10.0'), false);
  assert.equal(isNewer('2.0.0', '1.99.99'), true);
});

test('isNewer menolak versi sama atau lebih lama', () => {
  assert.equal(isNewer('1.2.0', '1.2.0'), false);
  assert.equal(isNewer('1.1.9', '1.2.0'), false);
});

test('isNewer menerima awalan v dan versi pendek', () => {
  assert.equal(isNewer('v1.2.1', '1.2.0'), true);
  assert.equal(isNewer('1.3', '1.2.9'), true);
});
