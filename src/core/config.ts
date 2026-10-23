import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  APP_VERSION,
  DEFAULT_MODEL,
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_OUTPUT_LINES,
  DEFAULT_MAX_OUTPUT_CHARS,
  DEFAULT_COMPACT_AT_PERCENT,
} from './constants';

// ============================================================
// JACK-AGENT — Config Manager (skema v1.2.0 + migrasi v1.1.x)
// TIDAK simpan client_id/client_secret (sudah embed di binary)
// ============================================================

export type ProviderKind = 'antigravity' | 'openai';

export interface ProviderConfig {
  name: string;
  kind: ProviderKind;
  base_url?: string;
  api_key?: string;
  headers?: Record<string, string>;
  models?: string[];
  supports_tools?: boolean;
  default_model?: string;
}

export interface AuthConfig {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  expiry_date:   number;
  user_email:    string;
  user_name:     string;
  user_picture:  string;
}

export interface JackConfig {
  version:     string;
  providers:   ProviderConfig[];
  provider:    { active: string; fallback: string[] };
  auth:        AuthConfig;
  agent:       { max_steps: number; auto_enabled: boolean; auto_allow: string[] };
  tokens:      { max_output_lines: number; max_output_chars: number; compact_at_percent: number };
  settings:    { language: 'id' | 'en'; max_history_length: number };
  environment: { project_id: string; machine_id: string; antigravity_project_id?: string };
  /** kunci lama/asing yang dipertahankan apa adanya saat migrasi */
  user?: unknown;
}

const EMPTY_AUTH: AuthConfig = {
  access_token: '', refresh_token: '', token_type: 'Bearer', expiry_date: 0,
  user_email: '', user_name: '', user_picture: '',
};

export function defaultConfig(): JackConfig {
  return {
    version: APP_VERSION,
    providers: [{ name: 'antigravity', kind: 'antigravity', default_model: DEFAULT_MODEL, models: [], supports_tools: true }],
    provider: { active: 'antigravity', fallback: [] },
    auth: { ...EMPTY_AUTH },
    agent: { max_steps: DEFAULT_MAX_STEPS, auto_enabled: true, auto_allow: [] },
    tokens: {
      max_output_lines: DEFAULT_MAX_OUTPUT_LINES,
      max_output_chars: DEFAULT_MAX_OUTPUT_CHARS,
      compact_at_percent: DEFAULT_COMPACT_AT_PERCENT,
    },
    settings: { language: 'id', max_history_length: 50 },
    environment: { project_id: '', machine_id: crypto.randomUUID() },
  };
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

let legacyDirMigrated = false;

/** Pindahkan folder config lama (…/jckw) ke yang baru sekali saja. */
function migrateLegacyConfigDir(): void {
  if (legacyDirMigrated) return;
  legacyDirMigrated = true;

  const dir = getConfigDir();
  if (fs.existsSync(dir)) return;

  const legacy = path.join(baseConfigDir(), LEGACY_CONFIG_DIRNAME);
  if (!fs.existsSync(legacy)) return;

  try {
    fs.renameSync(legacy, dir);
  } catch {
    // beda device atau izin ditolak — biarkan pengguna login ulang
  }
}

export function getConfigPath(): string {
  migrateLegacyConfigDir();
  return path.join(getConfigDir(), 'config.json');
}

export function configExists(): boolean {
  return fs.existsSync(getConfigPath());
}

// ── Read / Write (atomic, mode 0600) ───────────────────────

export function writeConfig(cfg: JackConfig): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const target = getConfigPath();
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, target);
}

/** Config minimal in-memory; hanya ditulis bila `persist` true. */
export function initDefaultConfig(persist = true): JackConfig {
  const cfg = defaultConfig();
  if (persist) writeConfig(cfg);
  return cfg;
}

function reportConfigError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  // PRD § 3.3: error asli dilaporkan, tidak ditelan diam-diam
  process.stderr.write(`⚠ config tidak dapat dibaca/dimigrasikan: ${msg}\n`);
}

/**
 * Baca config; migrasi sekali jalan bila masih skema v1.1.x.
 * Gagal baca/migrasi → config minimal (tanpa menimpa berkas, supaya data
 * pengguna tidak hilang) + error aslinya dilaporkan ke stderr.
 */
export function readConfig(): JackConfig {
  let raw: Record<string, unknown>;
  const p = getConfigPath();
  if (!fs.existsSync(p)) return defaultConfig();

  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch (err) {
    reportConfigError(err);
    return defaultConfig();
  }

  try {
    const cfg = normalize(raw);
    if (JSON.stringify(cfg) !== JSON.stringify(raw)) writeConfig(cfg);
    return cfg;
  } catch (err) {
    reportConfigError(err);
    return defaultConfig();
  }
}

// ── Normalisasi & migrasi ──────────────────────────────────

type Raw = Record<string, any>;

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Migrasi v1.1.x → v1.2.0 (PRD § 3.3). Backup dibuat sebelum menulis. */
function migrateFromLegacy(raw: Raw): JackConfig {
  const legacyVersion = typeof raw.version === 'string' ? raw.version : 'unknown';
  const backup = `${getConfigPath()}.bak-${legacyVersion}`;
  try {
    if (!fs.existsSync(backup)) fs.copyFileSync(getConfigPath(), backup);
  } catch {
    // backup gagal bukan alasan untuk membatalkan migrasi
  }

  const s: Raw = raw.settings ?? {};
  const cfg = defaultConfig();
  cfg.auth = { ...EMPTY_AUTH, ...(raw.auth ?? {}) };
  cfg.environment = {
    project_id: String(raw.environment?.project_id ?? ''),
    machine_id: String(raw.environment?.machine_id || crypto.randomUUID()),
    ...(raw.environment?.antigravity_project_id
      ? { antigravity_project_id: String(raw.environment.antigravity_project_id) }
      : {}),
  };
  cfg.settings.language = s.language === 'en' ? 'en' : 'id';
  cfg.settings.max_history_length = num(s.max_history_length, 50);
  // confirm_danger_commands: true → jangan auto (perilaku 1.1.9)
  cfg.agent.auto_enabled = s.confirm_danger_commands === true ? false : true;
  cfg.providers = [{
    name: 'antigravity',
    kind: 'antigravity',
    models: [],
    supports_tools: true,
    default_model: String(s.default_model || s.selectedModel || DEFAULT_MODEL),
  }];
  if (raw.user) cfg.user = raw.user;
  return cfg;
}

/** Pastikan config skema baru lengkap tanpa membuang nilai yang sudah ada. */
function fillDefaults(raw: Raw): JackConfig {
  const base = defaultConfig();
  const providers: ProviderConfig[] = Array.isArray(raw.providers)
    ? raw.providers.filter((p: Raw) => p && typeof p.name === 'string').map((p: Raw): ProviderConfig => ({
        name: String(p.name),
        kind: p.kind === 'openai' ? 'openai' : 'antigravity',
        base_url: p.base_url ? String(p.base_url) : undefined,
        api_key: p.api_key === undefined ? undefined : String(p.api_key),
        headers: p.headers && typeof p.headers === 'object' ? p.headers as Record<string, string> : undefined,
        models: Array.isArray(p.models) ? p.models.map((m: unknown) => String(m)) : [],
        supports_tools: p.supports_tools !== false,
        default_model: p.default_model ? String(p.default_model) : '',
      }))
    : [];
  if (!providers.some(p => p.kind === 'antigravity')) providers.unshift(base.providers[0]);

  const cfg: JackConfig = {
    version: APP_VERSION,
    providers,
    provider: {
      active: String(raw.provider?.active ?? providers[0].name),
      fallback: Array.isArray(raw.provider?.fallback) ? raw.provider.fallback.map((v: unknown) => String(v)) : [],
    },
    auth: { ...EMPTY_AUTH, ...(raw.auth ?? {}) },
    agent: {
      max_steps: num(raw.agent?.max_steps, base.agent.max_steps),
      auto_enabled: raw.agent?.auto_enabled !== false,
      auto_allow: Array.isArray(raw.agent?.auto_allow) ? raw.agent.auto_allow.map((v: unknown) => String(v)) : [],
    },
    tokens: {
      max_output_lines: num(raw.tokens?.max_output_lines, base.tokens.max_output_lines),
      max_output_chars: num(raw.tokens?.max_output_chars, base.tokens.max_output_chars),
      compact_at_percent: num(raw.tokens?.compact_at_percent, base.tokens.compact_at_percent),
    },
    settings: {
      language: raw.settings?.language === 'en' ? 'en' : 'id',
      max_history_length: num(raw.settings?.max_history_length, base.settings.max_history_length),
    },
    environment: {
      project_id: String(raw.environment?.project_id ?? ''),
      machine_id: String(raw.environment?.machine_id || crypto.randomUUID()),
      ...(raw.environment?.antigravity_project_id
        ? { antigravity_project_id: String(raw.environment.antigravity_project_id) }
        : {}),
    },
  };
  if (raw.user) cfg.user = raw.user;
  return cfg;
}

export function normalize(raw: Raw): JackConfig {
  return Array.isArray(raw.providers) ? fillDefaults(raw) : migrateFromLegacy(raw);
}

// ── Update ─────────────────────────────────────────────────

type DeepPartial<T> = T extends Array<infer U>
  ? U[]
  : { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };

export function updateConfig(partial: DeepPartial<JackConfig>): JackConfig {
  const cfg = readConfig();
  const updated: JackConfig = {
    ...cfg,
    ...partial,
    auth:        { ...cfg.auth,        ...(partial.auth        ?? {}) },
    agent:       { ...cfg.agent,       ...(partial.agent       ?? {}) },
    tokens:      { ...cfg.tokens,      ...(partial.tokens      ?? {}) },
    settings:    { ...cfg.settings,    ...(partial.settings    ?? {}) },
    environment: { ...cfg.environment, ...(partial.environment ?? {}) },
    provider:    { ...cfg.provider,    ...(partial.provider    ?? {}) },
  };
  writeConfig(updated);
  return updated;
}

/** Baca → ubah → tulis, untuk perubahan pada daftar provider dan sejenisnya. */
export function patchConfig(mutate: (cfg: JackConfig) => void): JackConfig {
  const cfg = readConfig();
  mutate(cfg);
  writeConfig(cfg);
  return cfg;
}

// ── Provider helpers ───────────────────────────────────────

export function findProvider(cfg: JackConfig, name: string): ProviderConfig | undefined {
  return cfg.providers.find(p => p.name === name);
}

export function activeProviderConfig(cfg: JackConfig): ProviderConfig {
  return findProvider(cfg, cfg.provider.active) ?? cfg.providers[0];
}

/**
 * Rantai percobaan provider: aktif → fallback[0] (maksimal 1 cadangan, PRD § 8.4).
 */
export function providerChain(cfg: JackConfig): ProviderConfig[] {
  const chain = [activeProviderConfig(cfg)];
  for (const name of cfg.provider.fallback) {
    const p = findProvider(cfg, name);
    if (p && !chain.includes(p)) { chain.push(p); break; }
  }
  return chain;
}

/** Provider siap dipakai: antigravity butuh token, openai butuh base_url. */
export function isProviderReady(provider: ProviderConfig, cfg: JackConfig): boolean {
  if (provider.kind === 'openai') return Boolean(provider.base_url);
  return Boolean(cfg.auth.access_token);
}

export function isConfigured(cfg: JackConfig = readConfig()): boolean {
  return cfg.providers.some(p => isProviderReady(p, cfg));
}

export function deleteConfig(): void {
  const dir = getConfigDir();
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
