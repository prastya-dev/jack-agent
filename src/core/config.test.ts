import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getConfigPath, readConfig } from './config';

// PRD § 10.4 / T-017: migrasi 1.1.x → 1.2.0, auth/user utuh, backup dibuat, idempoten.

const LEGACY_CONFIG = {
  version: '1.1.9',
  auth: {
    access_token: 'token-lama',
    refresh_token: 'refresh-lama',
    token_type: 'Bearer',
    expiry_date: 123,
    user_email: 'user@example.com',
    user_name: 'User',
    user_picture: '',
  },
  user: { id: 'u1' },
  settings: {
    default_model: 'gemini-3-flash-agent',
    default_mode: 'exec',
    confirm_danger_commands: true,
    max_history_length: 30,
    language: 'en',
  },
  environment: { project_id: 'proyek-1', machine_id: 'machine-1' },
};

function withTempHome(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jack-config-test-'));
  const previous = process.env.HOME;
  process.env.HOME = dir;
  try {
    fs.mkdirSync(path.join(dir, '.config', 'jack'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.config', 'jack', 'config.json'), JSON.stringify(LEGACY_CONFIG, null, 2));
    fn(dir);
  } finally {
    process.env.HOME = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('config v1.1.9 dimigrasikan ke v1.2.0 tanpa membuang auth/user', () => {
  withTempHome(() => {
    const cfg = readConfig();

    assert.equal(cfg.version, '1.2.0');
    assert.equal(cfg.providers[0].name, 'antigravity');
    assert.equal(cfg.providers[0].kind, 'antigravity');
    assert.equal(cfg.providers[0].default_model, 'gemini-3-flash-agent');
    assert.equal(cfg.provider.active, 'antigravity');
    assert.equal(cfg.auth.access_token, 'token-lama');
    assert.equal(cfg.auth.user_email, 'user@example.com');
    assert.deepEqual(cfg.user, { id: 'u1' });
    assert.equal(cfg.settings.language, 'en');
    assert.equal(cfg.settings.max_history_length, 30);
    assert.equal((cfg.settings as Record<string, unknown>).default_mode, undefined);
    assert.equal(cfg.agent.auto_enabled, false);   // confirm_danger_commands: true
    assert.equal(cfg.agent.max_steps, 12);
    assert.equal(cfg.tokens.max_output_lines, 200);
    assert.equal(cfg.environment.antigravity_project_id, undefined);
  });
});

test('backup config lama dibuat dan migrasi tidak berjalan dua kali', () => {
  withTempHome((dir) => {
    readConfig();
    const backup = `${getConfigPath()}.bak-1.1.9`;
    assert.equal(fs.existsSync(backup), true);
    assert.equal(JSON.parse(fs.readFileSync(backup, 'utf-8')).version, '1.1.9');

    const afterFirst = fs.readFileSync(getConfigPath(), 'utf-8');
    readConfig();
    assert.equal(fs.readFileSync(getConfigPath(), 'utf-8'), afterFirst, 'config tidak berubah pada pembacaan kedua');
    assert.equal(fs.existsSync(`${getConfigPath()}.bak-1.2.0`), false);
    void dir;
  });
});

test('config rusak tidak menghapus berkas dan tetap memberi config minimal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jack-config-broken-'));
  const previous = process.env.HOME;
  process.env.HOME = dir;
  try {
    const file = path.join(dir, '.config', 'jack', 'config.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ ini bukan json');

    const cfg = readConfig();
    assert.equal(cfg.version, '1.2.0');
    assert.equal(cfg.providers.length, 1);
    assert.equal(fs.readFileSync(file, 'utf-8'), '{ ini bukan json', 'berkas asli tidak ditimpa');
  } finally {
    process.env.HOME = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
