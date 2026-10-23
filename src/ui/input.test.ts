import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSlashCommands, type SlashCommand } from './input';

const COMMANDS: SlashCommand[] = [
  { name: '/model', description: 'pilih model' },
  { name: '/provider', description: 'ganti provider' },
  { name: '/skill', description: 'muat skill' },
  { name: '/exit', description: 'keluar' },
];

test('saran muncul untuk awalan yang cocok', () => {
  assert.deepEqual(filterSlashCommands('/mo', COMMANDS).map(c => c.name), ['/model']);
  assert.deepEqual(filterSlashCommands('/p', COMMANDS).map(c => c.name), ['/provider']);
  assert.deepEqual(filterSlashCommands('  /sk', COMMANDS).map(c => c.name), ['/skill']);
});

test('garis miring saja menampilkan semua perintah', () => {
  assert.equal(filterSlashCommands('/', COMMANDS).length, COMMANDS.length);
});

test('saran berhenti setelah argumen atau teks biasa', () => {
  assert.deepEqual(filterSlashCommands('/model x', COMMANDS), []);
  assert.deepEqual(filterSlashCommands('/model ', COMMANDS), []);
  assert.deepEqual(filterSlashCommands('halo', COMMANDS), []);
});

test('tidak ada saran untuk perintah tak dikenal', () => {
  assert.deepEqual(filterSlashCommands('/zzz', COMMANDS), []);
});
