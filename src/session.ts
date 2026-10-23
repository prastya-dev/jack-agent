import {
  activeProviderConfig,
  configExists,
  findProvider,
  isConfigured,
  readConfig,
  type JackConfig,
} from './core/config';
import { updateState } from './core/state';
import { resolveModel } from './providers';
import { runAgentTask } from './agent/loop';
import { handleSlashCommand, SLASH_COMMANDS } from './commands/slash';
import { printUserMessage, renderStatusBar } from './ui/statusbar';
import { renderBanner } from './ui/banner';
import { getTheme } from './ui/theme';
import { readLine } from './ui/input';

// ============================================================
// JACK-AGENT — Bootstrap sesi: REPL interaktif & jalur one-shot
// (PRD F9, F13; optimize.md O-01/O-14)
// ============================================================

const FLAG_WITH_VALUE = new Set(['-p', '--print', '--provider', '--model']);

function flagValue(args: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1]) return args[index + 1];
  }
  return undefined;
}

/** Argumen posisi pertama yang bukan flag dan bukan nilai flag. */
export function positionalGoal(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (FLAG_WITH_VALUE.has(arg)) { i++; continue; }
    if (arg.startsWith('-')) continue;
    return arg;
  }
  return undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as never));
  return Buffer.concat(chunks).toString('utf-8').trim();
}

/** Siapkan config + provider/model aktif; wizard dijalankan bila perlu. */
export async function ensureSession(): Promise<JackConfig> {
  let cfg = readConfig();

  if (!configExists() || !isConfigured(cfg)) {
    if (!process.stdin.isTTY) {
      throw new Error('belum ada provider yang siap. Jalankan "jack login" (antigravity) atau "jack provider add" (OpenAI-compatible) sekali di terminal.');
    }
    const { runWizard } = await import('./ui/wizard');
    await runWizard();
    cfg = readConfig();
    if (!isConfigured(cfg)) throw new Error('setup belum selesai — tidak ada provider yang siap dipakai.');
  }

  const provider = activeProviderConfig(cfg);
  updateState({
    provider: provider.name,
    model: resolveModel(provider, provider.default_model),
    currentDir: process.cwd(),
  });
  return cfg;
}

/** Terapkan flag sesi (--provider/--model) tanpa mengubah config (PRD F9). */
function applySessionFlags(cfg: JackConfig, args: string[]): void {
  const providerFlag = flagValue(args, '--provider');
  const modelFlag = flagValue(args, '--model');
  const provider = providerFlag ? findProvider(cfg, providerFlag) : undefined;

  if (providerFlag && !provider) {
    throw new Error(`provider "${providerFlag}" tidak ada di config`);
  }

  const effective = provider ?? activeProviderConfig(cfg);
  const list = effective.models ?? [];
  // F7: model yang diminta user tetap dipakai walau tidak ada di daftar.
  const model = modelFlag ?? resolveModel(effective, effective.default_model);
  updateState({ provider: effective.name, model });

  const t = getTheme();
  if (list.length && !list.includes(model)) {
    process.stderr.write(`${t.dim}  ⚠ model "${model}" belum pernah diuji dengan jack — tetap dipakai${t.reset}\n`);
  } else if (!modelFlag && effective.default_model && model !== effective.default_model) {
    // F3: model tersimpan tidak ada di daftar provider → pakai default/pertama + beri tahu.
    process.stderr.write(`${t.dim}  ℹ model "${effective.default_model}" tidak ada di daftar ${effective.name} — memakai "${model}"${t.reset}\n`);
  }
}

function warnAutoWrite(): void {
  // stderr supaya output one-shot (`jack -p ... > hasil.txt`) tetap bersih
  const t = getTheme();
  process.stderr.write(`${t.bold}${t.warn}⚠ mode menulis otomatis aktif — perintah dapat mengubah sistem tanpa konfirmasi${t.reset}\n`);
}

async function runRepl(): Promise<void> {
  const t = getTheme();

  renderBanner();
  renderStatusBar();

  let sigints = 0;
  while (true) {
    const input = await readLine(`${t.accent}› ${t.reset}`, SLASH_COMMANDS);
    if (input === null) break;

    if (input.interrupted) {
      sigints += 1;
      if (sigints > 1) break;
      process.stdout.write(`${t.dim}  Ctrl+C sekali lagi untuk keluar${t.reset}\n`);
      continue;
    }
    sigints = 0;

    const trimmed = input.text.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('/')) {
      try {
        await handleSlashCommand(trimmed);
      } catch (err) {
        process.stdout.write(`${t.error}  ✗ ${err instanceof Error ? err.message : String(err)}${t.reset}\n`);
      }
      continue;
    }

    printUserMessage(trimmed);
    try {
      await runAgentTask(trimmed);
    } catch (err) {
      process.stdout.write(`${t.error}  ✗ ${err instanceof Error ? err.message : String(err)}${t.reset}\n`);
    }
  }
}

/** Jalankan sesi; mengembalikan exit code. */
export async function startSession(args: string[]): Promise<number> {
  const t = getTheme();
  const interactive = Boolean(process.stdin.isTTY);
  const oneShot = args.includes('-p') || args.includes('--print');
  let goal = flagValue(args, '-p', '--print') ?? positionalGoal(args);

  // Jalur one-shot (O-14) juga melayani non-TTY: tidak ada REPL, tidak ada banner.
  if (oneShot || !interactive) {
    if (!goal) goal = await readStdin();
    if (!goal) {
      process.stderr.write('tidak ada tugas. Pakai: jack -p "<tujuan>" atau kirim tugas lewat stdin.\n');
      return 1;
    }

    const cfg = await ensureSession();
    applySessionFlags(cfg, args);
    const allowWrite = args.includes('--allow-write');
    if (allowWrite) warnAutoWrite();
    return (await runAgentTask(goal, { allowWrite })) ? 0 : 1;
  }

  const cfg = await ensureSession();
  applySessionFlags(cfg, args);

  if (args.includes('--allow-write')) {
    process.stdout.write(`${t.warn}  ⚠ --allow-write diabaikan di REPL — dialog konfirmasi tetap dipakai${t.reset}\n`);
  }

  if (goal) {
    printUserMessage(goal);
    await runAgentTask(goal);
  }

  await runRepl();
  return 0;
}
