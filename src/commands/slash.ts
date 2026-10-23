import * as fs from 'fs';
import * as path from 'path';
import { activeProviderConfig, patchConfig, readConfig } from '../core/config';
import { clearHistory, getState, updateState } from '../core/state';
import { createProvider, providerLabel, resolveModel, testProvider } from '../providers';
import { allowSummary, READ_ONLY_ALLOWLIST } from '../agent/guard';
import { compactHistory } from '../agent/loop';
import { listSkills, loadSkillBody } from '../skills';
import { renderBanner } from '../ui/banner';
import { renderStatusBar } from '../ui/statusbar';
import { showModelSelector } from '../ui/modelselector';
import { getTheme } from '../ui/theme';

// ============================================================
// JACK-AGENT — Slash commands (PRD F8)
// ============================================================

const REMOVED = ['/mode', '/ask', '/plan', '/exec', '/chat', '/quiz'];

/** Sumber tunggal daftar perintah: dipakai /help dan saran saat mengetik `/`. */
export const SLASH_COMMANDS: ReadonlyArray<{ name: string; description: string }> = [
  { name: '/model',    description: 'pilih model untuk provider aktif' },
  { name: '/provider', description: 'lihat/ganti provider (add, test)' },
  { name: '/skill',    description: 'daftar & muat skill ke konteks' },
  { name: '/allow',    description: 'lihat allowlist; /allow add|rm <program>' },
  { name: '/compact',  description: 'ringkas riwayat sesi' },
  { name: '/clear',    description: 'bersihkan riwayat tanpa meringkas' },
  { name: '/cd',       description: 'ubah direktori kerja: /cd <path>' },
  { name: '/token',    description: 'info kuota token antigravity' },
  { name: '/help',     description: 'bantuan' },
  { name: '/exit',     description: 'keluar' },
];

export async function handleSlashCommand(input: string): Promise<void> {
  const t = getTheme();
  const parts = input.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const rest = parts.slice(1);

  if (REMOVED.includes(command)) {
    process.stdout.write(`\n${t.warn}  ⚠ mode sudah dihapus di 1.2.0 — jack selalu agentik${t.reset}\n\n`);
    return;
  }

  switch (command) {
    case '/help': handleHelp(); break;
    case '/model': await handleModel(rest[0]); break;
    case '/provider': await handleProvider(rest); break;
    case '/skill': await handleSkill(rest[0]); break;
    case '/allow': handleAllow(rest); break;
    case '/compact': await compactHistory(); break;
    case '/clear': handleClear(); break;
    case '/cd': handleCd(rest.join(' ')); break;
    case '/token': handleToken(); break;
    case '/exit':
    case '/quit': handleExit(); break;
    default:
      process.stdout.write(`\n${t.warn}  ⚠ perintah tidak dikenal: ${command}${t.reset}\n${t.dim}  ketik /help${t.reset}\n\n`);
  }
}

// ── /model ─────────────────────────────────────────────────

async function handleModel(explicit?: string): Promise<void> {
  const t = getTheme();
  const cfg = readConfig();
  const provider = activeProviderConfig(cfg);

  const knownModels = [...(provider.models ?? [])];
  let models = provider.models?.length ? provider.models : [];
  if (explicit) {
    models = [...new Set([explicit, ...models])];
  } else if (!models.length) {
    process.stdout.write(`\n${t.dim}  mengambil daftar model dari ${provider.name}...${t.reset}\n`);
    const result = await testProvider(provider);
    if (!result.ok) {
      process.stdout.write(`${t.error}  ✗ ${result.message}${t.reset}\n\n`);
      return;
    }
    models = result.models;
    patchConfig((c) => {
      const p = c.providers.find(x => x.name === provider.name);
      if (p) p.models = models;
    });
  }

  const current = resolveModel(provider, getState().model);
  const chosen = explicit ?? await showModelSelector(models, current);
  if (!chosen) {
    process.stdout.write(`${t.dim}  pemilihan model dibatalkan${t.reset}\n`);
    return;
  }

  patchConfig((c) => {
    const p = c.providers.find(x => x.name === provider.name);
    if (p) p.default_model = chosen;
  });
  updateState({ model: chosen });
  // F7: model di luar daftar tetap dipakai, cukup diberi peringatan.
  if (explicit && knownModels.length && !knownModels.includes(explicit)) {
    process.stdout.write(`${t.dim}  ⚠ model "${explicit}" belum pernah diuji dengan jack — tetap dipakai${t.reset}\n`);
  }
  process.stdout.write(`\n${t.info}  ✓ model untuk ${provider.name}: ${chosen}${t.reset}\n`);
  renderStatusBar();
}

// ── /provider ──────────────────────────────────────────────

const ADD_PROVIDER = '+ tambah provider (base_url + api_key)';

/** Sinkronkan state + status bar setelah config provider berubah dari wizard. */
function syncActiveProvider(): void {
  const cfg = readConfig();
  const provider = activeProviderConfig(cfg);
  updateState({ provider: provider.name, model: resolveModel(provider, '') });
  renderStatusBar();
}

async function addProvider(): Promise<void> {
  const { addProviderWizard } = await import('../ui/wizard');
  const added = await addProviderWizard(readConfig());
  if (added) syncActiveProvider();
}

async function handleProvider(args: string[]): Promise<void> {
  const t = getTheme();
  const cfg = readConfig();
  const sub = (args[0] ?? '').toLowerCase();

  if (sub === 'add') {
    await addProvider();
    return;
  }
  if (sub === 'test') {
    const { runProviderCommand } = await import('./provider');
    await runProviderCommand(['test', args[1]]);
    return;
  }

  process.stdout.write('\n');
  for (const p of cfg.providers) {
    const active = p.name === cfg.provider.active ? ' (aktif)' : '';
    const url = p.base_url ? ` · ${p.base_url}` : '';
    process.stdout.write(`  ${t.dim}${p.name}${active}${url}${t.reset}\n`);
  }
  process.stdout.write(`${t.dim}  pilih "${ADD_PROVIDER}" untuk endpoint OpenAI-compatible${t.reset}\n`);

  const choices = [...cfg.providers.map(p => p.name), ADD_PROVIDER];
  const chosen = await showModelSelector(choices, cfg.provider.active);
  if (!chosen) {
    process.stdout.write(`${t.dim}  provider tidak berubah${t.reset}\n`);
    return;
  }
  if (chosen === ADD_PROVIDER) {
    await addProvider();
    return;
  }
  if (chosen === cfg.provider.active) {
    process.stdout.write(`${t.dim}  provider tidak berubah${t.reset}\n`);
    return;
  }
  switchProvider(chosen);
}

export function switchProvider(name: string): void {
  const t = getTheme();
  patchConfig((c) => { c.provider.active = name; });
  const cfg = readConfig();
  const provider = activeProviderConfig(cfg);
  updateState({ provider: provider.name, model: resolveModel(provider, '') });
  process.stdout.write(`\n${t.info}  ✓ provider aktif: ${provider.name} — ${providerLabel(provider)} · model ${getState().model}${t.reset}\n`);
  process.stdout.write(`${t.dim}  riwayat sesi dipertahankan${t.reset}\n`);
  renderStatusBar();
}

// ── /skill ─────────────────────────────────────────────────

async function handleSkill(explicit?: string): Promise<void> {
  const t = getTheme();
  const skills = listSkills();
  if (!skills.length) {
    process.stdout.write(`\n${t.dim}  belum ada skill. Pasang dengan: jack skill add <url|dir>${t.reset}\n\n`);
    return;
  }

  const name = explicit ?? await showModelSelector(skills.map(s => s.name), '');
  if (!name) {
    process.stdout.write(`${t.dim}  pemilihan skill dibatalkan${t.reset}\n`);
    return;
  }

  const body = loadSkillBody(name);
  if (body === null) {
    process.stdout.write(`\n${t.error}  ✗ skill "${name}" tidak ada${t.reset}\n\n`);
    return;
  }

  // PRD § 3.5: isi skill masuk ke system prompt permintaan berikutnya.
  const loaded = getState().skillLoaded;
  if (!loaded.includes(name)) updateState({ skillLoaded: [...loaded, name] });
  process.stdout.write(`\n${t.info}  ✓ skill "${name}" dimuat ke konteks (${body.length} karakter)${t.reset}\n\n`);
}

// ── /allow ─────────────────────────────────────────────────

function handleAllow(args: string[]): void {
  const t = getTheme();
  const cfg = readConfig();
  const sub = (args[0] ?? '').toLowerCase();
  const value = args[1];

  if (sub === 'add' || sub === 'rm') {
    if (!value) {
      process.stdout.write(`\n${t.warn}  ⚠ pakai: /allow ${sub} <program>${t.reset}\n\n`);
      return;
    }
    patchConfig((c) => {
      c.agent.auto_allow = sub === 'add'
        ? [...new Set([...c.agent.auto_allow, value.trim()])]
        : c.agent.auto_allow.filter(a => a !== value.trim());
    });
    process.stdout.write(`\n${t.info}  ✓ allowlist diperbarui${t.reset}\n\n`);
    return;
  }

  process.stdout.write(`\n${t.bold}  Allowlist aktif${t.reset} ${t.dim}(auto tanpa konfirmasi: ${cfg.agent.auto_enabled ? 'aktif' : 'MATI'})${t.reset}\n`);
  process.stdout.write(`  ${t.dim}${allowSummary(cfg.agent.auto_allow)}${t.reset}\n`);
  if (cfg.agent.auto_allow.length) {
    process.stdout.write(`  ${t.dim}tambahan user: ${cfg.agent.auto_allow.join(', ')}${t.reset}\n`);
  }
  process.stdout.write(`  ${t.dim}bawaan: ${READ_ONLY_ALLOWLIST.length} entri · ubah: /allow add <program> | /allow rm <program>${t.reset}\n\n`);
}

// ── /clear, /cd, /token, /exit ─────────────────────────────

function handleClear(): void {
  clearHistory();
  process.stdout.write('\x1b[2J\x1b[H');
  renderBanner();
  renderStatusBar();
}

function handleCd(dir: string): void {
  const t = getTheme();
  const state = getState();
  const target = dir || process.env.HOME || process.env.USERPROFILE || '/';
  const resolved = path.resolve(state.currentDir, target);

  if (!fs.existsSync(resolved)) {
    process.stdout.write(`\n${t.error}  ✗ direktori tidak ada: ${resolved}${t.reset}\n\n`);
    return;
  }
  updateState({ currentDir: resolved });
  try { process.chdir(resolved); } catch { /* binary pkg: cukup state */ }
  process.stdout.write(`\n${t.info}  ✓ direktori kerja: ${resolved}${t.reset}\n`);
  renderStatusBar();
}

function handleToken(): void {
  const t = getTheme();
  const cols = process.stdout.columns || 80;
  const sep = `${t.separator}${'─'.repeat(cols)}${t.reset}`;
  process.stdout.write('\n' + sep + '\n');
  process.stdout.write(`${t.accent}  ℹ Kuota token (provider antigravity)${t.reset}\n`);
  process.stdout.write(sep + '\n\n');
  process.stdout.write(`  Kuota umumnya di-reset tiap ${t.accent}5 jam${t.reset} plus batas mingguan dinamis.\n`);
  process.stdout.write(`  Kalau habis, muncul error 429 / RESOURCE_EXHAUSTED → tunggu kuota terisi.\n`);
  process.stdout.write(`  Estimasi token riwayat sesi ini ditampilkan setelah setiap tugas (status bar / ringkasan).\n`);
  process.stdout.write('\n' + sep + '\n\n');
}

function handleExit(): void {
  const t = getTheme();
  process.stdout.write(`\n${t.accent}  Sampai jumpa!${t.reset} ${t.dim}— JACK-AGENT${t.reset}\n\n`);
  process.exit(0);
}

// ── /help ──────────────────────────────────────────────────

function handleHelp(): void {
  const t = getTheme();
  const cols = process.stdout.columns || 80;
  const sep = `${t.separator}${'─'.repeat(cols)}${t.reset}`;

  const commands = SLASH_COMMANDS;

  process.stdout.write('\n' + sep + '\n');
  process.stdout.write(`${t.accent}  ℹ jack selalu agentik — tidak ada lagi mode chat/exec/quiz${t.reset}\n`);
  process.stdout.write(sep + '\n\n');
  for (const { name, description } of commands) {
    process.stdout.write(`    ${t.accent}${name.padEnd(12)}${t.reset} ${t.dim}${description}${t.reset}\n`);
  }
  process.stdout.write(`\n${t.bold}  Contoh${t.reset}\n`);
  process.stdout.write(`    - "sebutkan isi direktori ini"\n`);
  process.stdout.write(`    - "jalankan test dan perbaiki yang gagal"\n`);
  process.stdout.write(`    - "cari kenapa build gagal di CI"\n`);
  process.stdout.write('\n' + sep + '\n\n');
}
