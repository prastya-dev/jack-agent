import * as path from 'path';
import * as fs from 'fs';
import { stateManager } from '../core/state';
import { applyTheme, getTheme, separator } from '../ui/theme';
import { renderBanner, renderModeChange } from '../ui/banner';
import { renderStatusBar } from '../ui/statusbar';
import { showModelSelector } from '../ui/modelselector';
import { updateConfig } from '../core/config';
import { fetchModels } from '../api/client';
import { FALLBACK_MODELS } from '../core/constants';

// ============================================================
// JACK-AGENT — Slash Command Handler
// Handles: /exec, /model, /clear, /exit, /cd, /help
// ============================================================

export async function handleSlashCommand(input: string): Promise<void> {
  const t = getTheme();
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/exec':
      await handleModeChange('exec');
      break;

    case '/chat':
      await handleModeChange('chat');
      break;

    case '/quiz':
      await handleModeChange('quiz');
      break;

    case '/model':
      await handleModelSelect();
      break;

    case '/clear':
      handleClear();
      break;

    case '/token':
      handleToken();
      break;

    case '/exit':
    case '/quit':
      handleExit();
      break;

    case '/cd':
      handleCd(parts.slice(1).join(' '));
      break;

    case '/help':
      handleHelp();
      break;

    default:
      process.stdout.write(
        `\n${t.warn}  ⚠ Unknown command: ${t.text}${cmd}${t.reset}\n` +
        `${t.dim}  Type /help to see available commands.${t.reset}\n\n`,
      );
  }
}

// ── Mode Switch ──────────────────────────────────────────────

async function handleModeChange(newMode: 'chat' | 'exec' | 'quiz'): Promise<void> {
  const state = stateManager.get();
  if (state.activeMode === newMode) return;

  stateManager.update({ activeMode: newMode });
  applyTheme(newMode);

  // Clear screen, history, and print new banner
  stateManager.clearHistory();
  handleClear();

  // Persist mode preference
  try {
    updateConfig({ settings: { default_mode: newMode } as never });
  } catch {
    // non-fatal
  }
}

// ── /model ─────────────────────────────────────────────────

async function handleModelSelect(): Promise<void> {
  const t = getTheme();
  const state = stateManager.get();

  process.stdout.write(`\n${t.dim}  Fetching available models...${t.reset}\n`);

  let models: string[] = FALLBACK_MODELS;
  try {
    models = await fetchModels();
  } catch {
    process.stdout.write(`${t.warn}  ⚠ Could not fetch models from API — using defaults.${t.reset}\n`);
  }

  const selected = await showModelSelector(models, state.selectedModel);

  if (selected && selected !== state.selectedModel) {
    stateManager.update({ selectedModel: selected });
    updateConfig({ settings: { default_model: selected } as never });
    process.stdout.write(
      `\n${t.info}  ✓ Model changed to: ${t.accent}${selected}${t.reset}\n\n`,
    );
  } else if (!selected) {
    process.stdout.write(`\n${t.dim}  Model selection cancelled.${t.reset}\n\n`);
  }

  renderStatusBar();
}

// ── /clear ─────────────────────────────────────────────────

function handleClear(): void {
  // Clear screen, history, and reset scroll position
  stateManager.clearHistory();
  process.stdout.write('\x1b[2J\x1b[H');
  // Re-render banner and status bar
  renderBanner();
  renderStatusBar();
}

// ── /token ─────────────────────────────────────────────────

function handleToken(): void {
  const t = getTheme();
  const cols = process.stdout.columns || 80;
  const sep = `${t.separator}${'─'.repeat(cols)}${t.reset}`;

  process.stdout.write('\n' + sep + '\n');
  process.stdout.write(`${t.accent}  ℹ Informasi Kuota Token (Google Antigravity)${t.reset}\n`);
  process.stdout.write(sep + '\n\n');
  process.stdout.write(`  Google Cloud Code Assist tidak menyediakan API publik untuk mengecek\n`);
  process.stdout.write(`  sisa kuota token secara real-time. Namun, berikut adalah limitasi umumnya:\n\n`);
  process.stdout.write(`  ${t.bold}• Batas Pemakaian (Standard Tier):${t.reset}\n`);
  process.stdout.write(`    - Kuota di-reset setiap ${t.accent}5 jam${t.reset}.\n`);
  process.stdout.write(`    - Terdapat juga batasan penggunaan ${t.accent}mingguan${t.reset} yang dinamis.\n\n`);
  process.stdout.write(`  ${t.bold}• Jika Kuota Habis (Rate Limited):${t.reset}\n`);
  process.stdout.write(`    - Anda akan melihat error 429 atau "RESOURCE_EXHAUSTED".\n`);
  process.stdout.write(`    - Solusi: Menunggu sekitar 5 jam agar kuota terisi kembali.\n`);
  process.stdout.write('\n' + sep + '\n\n');
}

// ── /exit ──────────────────────────────────────────────────

function handleExit(): void {
  const t = getTheme();
  process.stdout.write(`\n${t.accent}  Goodbye! ${t.dim}— JACK-AGENT${t.reset}\n\n`);
  process.exit(0);
}

// ── /cd ────────────────────────────────────────────────────

function handleCd(dir: string): void {
  const t = getTheme();
  if (!dir) {
    const home = process.env.HOME || process.env.USERPROFILE || '/';
    dir = home;
  }

  const resolved = path.resolve(stateManager.get().currentDir, dir);

  if (!fs.existsSync(resolved)) {
    process.stdout.write(`\n${t.error}  ✗ Directory not found: ${resolved}${t.reset}\n\n`);
    return;
  }

  stateManager.update({ currentDir: resolved });
  try {
    process.chdir(resolved);
  } catch {
    // chdir may fail in pkg binary context — state update is enough
  }

  process.stdout.write(`\n${t.info}  ✓ Changed directory to: ${t.text}${resolved}${t.reset}\n`);
  renderStatusBar();
}

// ── /help ──────────────────────────────────────────────────

function handleHelp(): void {
  const t = getTheme();
  const cols = process.stdout.columns || 80;
  const sep = `${t.separator}${'─'.repeat(cols)}${t.reset}`;

  const commands = [
    ['/chat',        'Pindah ke mode chat biasa'],
    ['/exec',        'Pindah ke mode exec (tanya jawab terminal)'],
    ['/quiz',        'Pindah ke mode quiz (jawaban super singkat)'],
    ['/model',       'Buka selector model interaktif'],
    ['/clear',       'Bersihkan layar dan reset tampilan'],
    ['/token',       'Lihat info kuota pemakaian token'],
    ['/cd <path>',   'Ubah direktori kerja aktif'],
    ['/help',        'Tampilkan bantuan ini'],
    ['/exit',        'Keluar dari JACK-AGENT'],
  ];

  process.stdout.write('\n' + sep + '\n');
  process.stdout.write(`${t.accent}  ℹ Informasi Mode & Slash Commands${t.reset}\n`);
  process.stdout.write(sep + '\n\n');

  process.stdout.write(`${t.bold}  • Mode Tersedia:${t.reset}\n`);
  process.stdout.write(`    - ${t.accent}CHAT${t.reset}  : Jawab pertanyaan, coding, penjelasan umum.\n`);
  process.stdout.write(`    - ${t.accent}EXEC${t.reset}  : Menyarankan dan mengeksekusi perintah terminal otomatis.\n`);
  process.stdout.write(`    - ${t.accent}QUIZ${t.reset}  : Menjawab sangat singkat (to the point, tanpa penjelasan).\n\n`);

  process.stdout.write(`${t.bold}  • Slash Commands:${t.reset}\n`);
  for (const [cmd, desc] of commands) {
    const padded = cmd.padEnd(20);
    process.stdout.write(`    ${t.accent}${padded}${t.reset} ${t.dim}${desc}${t.reset}\n`);
  }

  process.stdout.write(`\n${t.bold}  • Contoh Perintah:${t.reset}\n`);
  process.stdout.write(`    - "buatkan script bash untuk membackup db"\n`);
  process.stdout.write(`    - "tolong periksa port 8080 apakah sedang dipakai"\n`);
  process.stdout.write(`    - "jelaskan apa itu docker"\n`);

  process.stdout.write('\n' + sep + '\n\n');
}
