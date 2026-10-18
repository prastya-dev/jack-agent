import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { DEFAULT_SETTINGS } from './constants';

// ============================================================
// JACK-AGENT — Config Manager
// Simpan: tokens, settings, environment
// TIDAK simpan client_id/client_secret (sudah embed di binary)
// ============================================================

export interface AuthConfig {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  expiry_date:   number;
  user_email:    string;
  user_name:     string;   // display name dari Google profile
  user_picture:  string;   // avatar URL
}

export interface SettingsConfig {
  default_model:           string;
  default_mode:            'chat' | 'exec' | 'quiz';
  confirm_danger_commands: boolean;
  max_history_length:      number;
  language:                'id' | 'en';
}

export interface EnvironmentConfig {
  project_id: string;
  machine_id: string;
  antigravity_project_id?: string;
}

export interface JackConfig {
  version:     string;
  auth:        AuthConfig;
  settings:    SettingsConfig;
  environment: EnvironmentConfig;
}

// ── Path Resolution ────────────────────────────────────────

/** Folder config versi <= 1.1.8 (sebelum rename ke "jack") */
const LEGACY_CONFIG_DIRNAME = 'jckw';

function baseConfigDir(): string {
  if (process.platform === 'win32') {
    return process.env.APPDATA || os.homedir();
  }
  return path.join(os.homedir(), '.config');
}

export function getConfigDir(): string {
  return path.join(baseConfigDir(), 'jack');
}

let legacyMigrated = false;

/**
 * Pindahkan folder config lama (…/jckw) ke yang baru (…/jack) sekali saja,
 * supaya pengguna versi sebelumnya tidak perlu login ulang.
 */
function migrateLegacyConfigDir(): void {
  if (legacyMigrated) return;
  legacyMigrated = true;

  const dir = getConfigDir();
  if (fs.existsSync(dir)) return;

  const legacy = path.join(baseConfigDir(), LEGACY_CONFIG_DIRNAME);
  if (!fs.existsSync(legacy)) return;

  try {
    fs.renameSync(legacy, dir);
  } catch {
    // Beda device atau izin ditolak — biarkan pengguna login ulang.
  }
}

export function getConfigPath(): string {
  migrateLegacyConfigDir();
  return path.join(getConfigDir(), 'config.json');
}

// ── State Checks ───────────────────────────────────────────

export function configExists(): boolean {
  return fs.existsSync(getConfigPath());
}

/** Config dianggap "siap" kalau ada access_token tersimpan */
export function isConfigured(): boolean {
  if (!configExists()) return false;
  try {
    const cfg = readConfig();
    return Boolean(cfg.auth.access_token);
  } catch {
    return false;
  }
}

export function hasValidToken(): boolean {
  if (!configExists()) return false;
  try {
    const cfg = readConfig();
    return Boolean(cfg.auth.access_token) && cfg.auth.expiry_date > Date.now();
  } catch {
    return false;
  }
}

// ── Read / Write ───────────────────────────────────────────

export function readConfig(): JackConfig {
  const p = getConfigPath();
  if (!fs.existsSync(p)) {
    throw new Error(`Config tidak ditemukan. Jalankan "jack" untuk login.`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as JackConfig;
}

export function writeConfig(cfg: JackConfig): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

// ── Init ───────────────────────────────────────────────────

export function initDefaultConfig(): JackConfig {
  const cfg: JackConfig = {
    version: '1.0.0',
    auth: {
      access_token:  '',
      refresh_token: '',
      token_type:    'Bearer',
      expiry_date:   0,
      user_email:    '',
      user_name:     '',
      user_picture:  '',
    },
    settings:    { ...DEFAULT_SETTINGS },
    environment: {
      project_id: '',
      machine_id: crypto.randomUUID(),
    },
  };
  writeConfig(cfg);
  return cfg;
}

// ── Update ─────────────────────────────────────────────────

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };

export function updateConfig(partial: DeepPartial<JackConfig>): JackConfig {
  const cfg = readConfig();
  const updated: JackConfig = {
    ...cfg,
    ...partial,
    auth:        { ...cfg.auth,        ...(partial.auth        ?? {}) },
    settings:    { ...cfg.settings,    ...(partial.settings    ?? {}) },
    environment: { ...cfg.environment, ...(partial.environment ?? {}) },
  };
  writeConfig(updated);
  return updated;
}

// ── Delete ─────────────────────────────────────────────────

export function deleteConfig(): void {
  const dir = getConfigDir();
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
