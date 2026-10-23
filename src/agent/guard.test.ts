import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, isDangerousCommand, splitSegments } from './guard';

// PRD § 10.4: auto read-only, konfirmasi untuk tulis, blok untuk destruktif,
// perintah bersegmen tidak lolos auto, `jack` tidak pernah auto.

test('perintah read-only dijalankan otomatis', () => {
  for (const command of ['ls -la', 'cat package.json', 'git status', 'git diff HEAD', 'grep -rn foo src', 'node -v', 'echo halo']) {
    assert.equal(classify(command).action, 'auto', command);
  }
});

test('perintah tulis butuh konfirmasi', () => {
  for (const command of ['git commit -m x', 'rm -rf build', 'mv a b', 'npm install', 'tee out.txt']) {
    assert.equal(classify(command).action, 'confirm', command);
  }
});

test('pola destruktif selalu diblok', () => {
  const blocked = [
    'rm -rf /',
    'rm -rf ~',
    'mkfs.ext4 /dev/sda1',
    'dd if=/dev/zero of=/dev/sda',
    'shutdown -h now',
    'reboot',
    'format c:',
    'del /s /q C:\\',
    'chmod -R 777 /',
    ':(){ :|:& };:',
  ];
  for (const command of blocked) {
    assert.equal(classify(command).action, 'block', command);
    assert.equal(isDangerousCommand(command), true, command);
  }
});

test('perintah bersegmen tidak lolos auto', () => {
  assert.equal(classify('ls && rm -rf x').action, 'confirm');
  assert.equal(classify('ls; rm -rf x').action, 'confirm');
  assert.equal(classify('cat f | tee out.txt').action, 'confirm');
  assert.equal(classify('ls && ls -la').action, 'auto');
  assert.deepEqual(splitSegments('ls && cat a | grep b'), ['ls', 'cat a', 'grep b']);
});

test('redirection dan substitusi tidak pernah auto', () => {
  assert.equal(classify('cat file > out.txt').action, 'confirm');
  assert.equal(classify('echo $(whoami)').action, 'confirm');
  assert.equal(classify('echo `id`').action, 'confirm');
});

test('program terlarang tidak pernah auto', () => {
  for (const command of ['jack -p "x"', 'sudo ls', 'curl http://x', 'xargs rm', 'bash -c ls']) {
    assert.equal(classify(command).action, 'confirm', command);
  }
});

test('opsi destruktif memaksa konfirmasi', () => {
  assert.equal(classify('find . -delete').action, 'confirm');
  assert.equal(classify('sed -i s/a/b/ file').action, 'confirm');
});

test('auto_enabled=false membuat semuanya konfirmasi', () => {
  assert.equal(classify('ls -la', { autoEnabled: false }).action, 'confirm');
});

test('allowlist tambahan dari user dihormati', () => {
  assert.equal(classify('docker ps', { allow: ['docker ps'] }).action, 'auto');
  assert.equal(classify('docker rm x', { allow: ['docker ps'] }).action, 'confirm');
});
