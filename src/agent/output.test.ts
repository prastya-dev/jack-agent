import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, truncateOutput } from './output';

const LIMITS = { maxLines: 200, maxChars: 8000 };

test('output pendek diteruskan utuh beserta exit code', () => {
  const text = truncateOutput({ stdout: 'baris satu\nbaris dua', stderr: '', exitCode: 0 }, LIMITS);
  assert.match(text, /exit code: 0/);
  assert.match(text, /baris satu\nbaris dua/);
  assert.doesNotMatch(text, /dipotong/);
});

test('output panjang dipotong head+tail dengan jumlah baris', () => {
  const stdout = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n');
  const text = truncateOutput({ stdout, stderr: '', exitCode: 1 }, LIMITS);
  assert.match(text, /exit code: 1/);
  assert.match(text, /line 0\n/);
  assert.match(text, /line 999/);
  assert.match(text, /dipotong: 1000 baris/);
  assert.ok(text.split('\n').length <= LIMITS.maxLines + 6, 'panjang hasil dibatasi');
});

test('output sangat besar hanya head + total', () => {
  const stdout = Array.from({ length: 6000 }, (_, i) => `l${i}`).join('\n');
  const text = truncateOutput({ stdout, stderr: '', exitCode: 0 }, LIMITS);
  assert.match(text, /dipotong: 6000 baris/);
  assert.doesNotMatch(text, /l5999/);
});

test('ANSI dan carriage return dibuang', () => {
  const raw = '\x1b[31mmerah\x1b[0m\rprogress 50%\rselesai\n\x00';
  const cleaned = cleanText(raw);
  assert.equal(cleaned.includes('\x1b'), false);
  assert.equal(cleaned.includes('\r'), false);
  assert.equal(cleaned.includes('\x00'), false);
  assert.match(cleaned, /progress 50%selesai/);
});

test('stderr ikut dilaporkan', () => {
  const text = truncateOutput({ stdout: '', stderr: 'gagal: x', exitCode: 2 }, LIMITS);
  assert.match(text, /stderr:/);
  assert.match(text, /gagal: x/);
});

test('timeout dan overflow disebutkan', () => {
  const text = truncateOutput({ stdout: '', stderr: '', exitCode: 124, timedOut: true, overflowed: true }, LIMITS);
  assert.match(text, /timeout/);
  assert.match(text, /10 MB/);
});
