import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, type PromptContext } from './prompt';

const CTX: PromptContext = {
  os: 'Linux 6.9.0',
  shell: '/bin/bash',
  cwd: '/home/user/proyek',
  gitState: 'branch main',
  projectHints: 'Node/JS',
  skillIndex: 'deploy-vps — langkah deploy ke VPS',
  autoAllow: 'ls, cat, git status',
};

test('prompt di bawah 1.200 token (estimasi karakter/4)', () => {
  const prompt = buildSystemPrompt(CTX);
  assert.ok(prompt.length / 4 < 1200, `prompt ${prompt.length} karakter`);
});

test('semua placeholder terisi', () => {
  const prompt = buildSystemPrompt(CTX);
  assert.doesNotMatch(prompt, /\{[A-Z_]+\}/);
  for (const value of ['Linux 6.9.0', '/bin/bash', '/home/user/proyek', 'branch main', 'Node/JS', 'ls, cat, git status']) {
    assert.match(prompt, new RegExp(value.replace(/[/.]/g, '\\$&')));
  }
});

test('skill index hanya berisi nama + deskripsi', () => {
  const prompt = buildSystemPrompt(CTX);
  assert.match(prompt, /deploy-vps — langkah deploy ke VPS/);

  // Isi skill tidak pernah ikut: template hanya menambah teks index apa adanya.
  const placeholder = '(belum ada skill)';
  const withoutSkills = buildSystemPrompt({ ...CTX, skillIndex: placeholder });
  assert.equal(prompt.length - withoutSkills.length, CTX.skillIndex.length - placeholder.length);
});

test('tidak ada sisa aturan mode lama', () => {
  const prompt = buildSystemPrompt(CTX);
  for (const mode of ['CURRENT_MODE', 'quiz', 'chat', 'exec mode']) {
    assert.equal(prompt.toLowerCase().includes(mode.toLowerCase()), false, mode);
  }
});
