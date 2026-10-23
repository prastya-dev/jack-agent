import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrollbarCells, windowStart } from './viewport';

test('window menyembunyikan item di luar viewport', () => {
  assert.equal(windowStart(0, 3, 8), 0);
  assert.equal(windowStart(4, 3, 8), 0);
  assert.equal(windowStart(9, 20, 8), 5);
  assert.equal(windowStart(19, 20, 8), 12);
});

test('scrollbar penuh saat daftar muat', () => {
  const cells = scrollbarCells(5, 8, 0);
  assert.equal(cells.length, 8);
  assert.ok(cells.every(Boolean));
});

test('ibu jari scrollbar di atas, tengah, dan bawah', () => {
  const top = scrollbarCells(20, 8, 0);
  assert.equal(top.length, 8);
  assert.equal(top[0], true);
  assert.equal(top[7], false);

  const bottom = scrollbarCells(20, 8, 12);
  assert.equal(bottom[0], false);
  assert.equal(bottom[7], true);

  const middle = scrollbarCells(20, 8, 6);
  assert.ok(middle.includes(true));
  assert.ok(middle.includes(false));
});

test('ibu jari selalu satu blok bersambung', () => {
  for (const start of [0, 3, 6, 9, 12]) {
    const cells = scrollbarCells(20, 8, start);
    const first = cells.indexOf(true);
    const last = cells.lastIndexOf(true);
    assert.ok(first >= 0);
    assert.ok(cells.slice(first, last + 1).every(Boolean), `start ${start}`);
  }
});
