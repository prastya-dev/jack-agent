import * as fs from 'fs';
import * as readline from 'readline';
import {
  defaultConfig,
  getConfigDir,
  initDefaultConfig,
  isConfigured,
  patchConfig,
  readConfig,
  writeConfig,
  type JackConfig,
  type ProviderConfig,
} from '../core/config';
import { createOAuthSession, openBrowser, fetchUserProjects } from '../auth/oauth';
import { getTheme, A } from './theme';
import { showModelSelector } from './modelselector';
import { isValidProviderName, resolveModel, testProvider } from '../providers';
import { DEFAULT_MODEL } from '../core/constants';

// ============================================================
// JACK-AGENT — Wizard setup + login + uninstall (PRD F13, F1, F12)
// ============================================================

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function isEnglish(cfg: JackConfig): boolean {
  return cfg.settings.language === 'en';
}

function line(text = ''): void {
  process.stdout.write(text + '\n');
}

export function prompt(question: string, def = ''): Promise<string> {
  if (!process.stdin.isTTY) {
    line(`${A.gray}  ${question} → ${def || '(kosong)'} (non-interaktif)${A.reset}`);
    return Promise.resolve(def);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const suffix = def ? ` ${A.gray}[${def}]${A.reset}` : '';
    rl.question(`  ${A.cyan}[?]${A.reset} ${question}${suffix} `, (answer) => {
      rl.close();
      resolve(answer.trim() || def);
    });
  });
}

// ── OAuth "Connect Antigravity" dialog (dipertahankan dari 1.1.9) ──

function vlen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b[78]/g, '').length;
}

interface DialogInfo { lines: string[]; spinnerLine: number; spinnerCol: number }

function buildDialog(authUrl: string, spinnerChar: string): DialogInfo {
  const cols = process.stdout.columns || 80;
  const W = Math.max(50, Math.min(cols - 4, 66));
  const inner = W - 2;

  const top = `${A.blue}┌${'─'.repeat(inner)}┐${A.reset}`;
  const bottom = `${A.blue}└${'─'.repeat(inner)}┘${A.reset}`;
  const mid = `${A.blue}├${'─'.repeat(inner)}┤${A.reset}`;

  const row = (content: string, leftPad = 2): string => {
    const vis = vlen(content);
    const rightSpaces = Math.max(0, inner - leftPad - vis - leftPad);
    return `${A.blue}│${A.reset}${' '.repeat(leftPad)}${content}${' '.repeat(rightSpaces)}${' '.repeat(leftPad)}${A.blue}│${A.reset}`;
  };

  const maxUrl = inner - 4;
  const urlShort = authUrl.length > maxUrl ? authUrl.slice(0, maxUrl - 3) + '...' : authUrl;

  return {
    lines: [
      top,
      row(`${A.bold}${A.white}Connect Antigravity${A.reset}`),
      mid,
      row(`${A.gray}${urlShort}${A.reset}`),
      row(''),
      row(`${A.cyan}${spinnerChar}${A.reset}  ${A.white}Waiting for browser authorization...${A.reset}`),
      row(''),
      bottom,
    ],
    spinnerLine: 5,
    spinnerCol: 4,
  };
}

async function showConnectDialog(authUrl: string, serverCode: Promise<string>, onCancel: () => void): Promise<string> {
  const dialog = buildDialog(authUrl, SPINNER_FRAMES[0]);
  line();
  dialog.lines.forEach(l => line(l));

  const SPINNER_OFFSET = dialog.lines.length - dialog.spinnerLine;
  process.stdout.write('\x1b[?25l');

  let spinnerIdx = 0;
  const spinnerInterval = setInterval(() => {
    spinnerIdx = (spinnerIdx + 1) % SPINNER_FRAMES.length;
    process.stdout.write(
      A.up(SPINNER_OFFSET) + A.col(dialog.spinnerCol) + A.cyan + SPINNER_FRAMES[spinnerIdx] + A.reset +
      `\x1b[${SPINNER_OFFSET}B`,
    );
  }, 80);

  const cleanup = () => {
    clearInterval(spinnerInterval);
    process.stdout.write('\x1b[?25h');
  };

  const cancelPromise = new Promise<never>((_, reject) => {
    if (!process.stdin.isTTY) return;   // non-TTY: andalkan callback server (O-01)
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (b: Buffer) => {
      if (b.toString() === '\x03') {
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        onCancel();
        reject(new Error('Login dibatalkan'));
      }
    };
    process.stdin.on('data', onData);
    serverCode.finally(() => {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
    }).catch(() => { /* sudah ditangani Promise.race */ });
  });

  try {
    const code = await Promise.race([serverCode, cancelPromise]);
    cleanup();
    return code;
  } catch (err) {
    cleanup();
    throw err;
  }
}

function showSuccessScreen(cfg: JackConfig, name: string, email: string): void {
  const t = getTheme();
  const isEn = isEnglish(cfg);
  line('\x1b[2J\x1b[H');
  line();
  line(`  ${A.green}✓ ${isEn ? 'Login successful!' : 'Login berhasil!'}${A.reset}`);
  if (name) line(`  ${A.gray}${isEn ? 'Hello,' : 'Halo,'}${A.reset} ${A.bold}${A.white}${name}${A.reset}`);
  if (email) line(`  ${A.gray}${isEn ? 'Account:' : 'Akun:'}${A.reset} ${A.white}${email}${A.reset}`);
  line(t.separator + '─'.repeat(40) + t.reset);
}

// ── Login antigravity ──────────────────────────────────────

export async function loginAntigravity(cfg: JackConfig): Promise<boolean> {
  const isEn = isEnglish(cfg);
  line(`\n  ${A.white}${isEn ? 'Sign in with your Google account to continue' : 'Masuk dengan akun Google untuk melanjutkan'}${A.reset}\n`);

  let session;
  try {
    session = await createOAuthSession();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    line(`  ${A.red}✗ ${isEn ? 'Failed to prepare OAuth' : 'Gagal mempersiapkan OAuth'}: ${msg}${A.reset}`);
    return false;
  }

  await openBrowser(session.authUrl);
  if (!process.stdin.isTTY) {
    line(`  ${A.gray}${isEn ? 'Open this URL in a browser:' : 'Buka URL ini di browser:'} ${A.reset}${session.authUrl}`);
  }

  let code: string;
  try {
    code = await showConnectDialog(session.authUrl, session.waitForCode, () => session.cancel());
  } catch (err) {
    session.cancel();
    const msg = err instanceof Error ? err.message : String(err);
    line(`  ${A.red}✗ ${isEn ? 'Login failed' : 'Login gagal'}: ${msg}${A.reset}`);
    return false;
  }

  let tokens;
  try {
    tokens = await session.exchangeCode(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    line(`  ${A.red}✗ ${isEn ? 'Token exchange failed' : 'Token exchange gagal'}: ${msg}${A.reset}`);
    return false;
  }

  const projects = await fetchUserProjects(tokens.access_token);
  if (projects.length > 0) {
    cfg.environment.project_id = projects[0];
    line(`  ${A.green}✓ ${isEn ? 'Using project' : 'Menggunakan project'}: ${A.white}${projects[0]}${A.reset}`);
  } else {
    line(`  ${A.gray}⚠ ${isEn ? 'No Google Cloud project found (usually fine for Antigravity)' : 'Tidak ada Google Cloud project (biasanya tidak masalah untuk Antigravity)'}${A.reset}`);
  }

  cfg.auth = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    expiry_date: tokens.expiry_date,
    user_email: tokens.user_email,
    user_name: tokens.user_name,
    user_picture: tokens.user_picture,
  };
  writeConfig(cfg);

  showSuccessScreen(cfg, tokens.user_name, tokens.user_email);
  return true;
}

// ── Provider openai-compatible ─────────────────────────────

export async function addProviderWizard(cfg: JackConfig): Promise<boolean> {
  const isEn = isEnglish(cfg);
  line(`\n  ${A.white}${isEn ? 'Add an OpenAI-compatible provider' : 'Tambah provider OpenAI-compatible'}${A.reset}`);
  line(`  ${A.gray}${isEn ? 'Examples: OpenAI, OpenRouter, Groq, Ollama (http://127.0.0.1:11434/v1)' : 'Contoh: OpenAI, OpenRouter, Groq, Ollama (http://127.0.0.1:11434/v1)'}${A.reset}\n`);

  const name = (await prompt(isEn ? 'Provider name (a-z, 0-9, -)' : 'Nama provider (a-z, 0-9, -)')).toLowerCase();
  if (!isValidProviderName(name)) {
    line(`  ${A.red}✗ ${isEn ? 'Invalid name' : 'Nama tidak valid'}${A.reset}`);
    return false;
  }
  if (cfg.providers.some(p => p.name === name)) {
    line(`  ${A.red}✗ provider "${name}" ${isEn ? 'already exists' : 'sudah ada'}${A.reset}`);
    return false;
  }

  const base_url = await prompt(isEn ? 'Base URL (…/v1)' : 'Base URL (…/v1)', 'http://127.0.0.1:11434/v1');
  // shortcut: api_key diinput dengan echo normal; sembunyikan input bila diminta pemilik
  const api_key = await prompt(isEn ? 'API key (kosongkan untuk endpoint lokal)' : 'API key (kosongkan untuk endpoint lokal)');

  const provider: ProviderConfig = { name, kind: 'openai', base_url, api_key, models: [], default_model: '' };

  line(`  ${A.gray}${isEn ? 'Testing connection...' : 'Menguji koneksi...'}${A.reset}`);
  const result = await testProvider(provider);
  if (!result.ok) {
    line(`  ${A.red}✗ ${result.message}${A.reset}`);
    const lanjut = (await prompt(isEn ? 'Save anyway? (y/n)' : 'Simpan tetap? (y/n)', 'n')).toLowerCase();
    if (lanjut !== 'y') return false;
  } else {
    line(`  ${A.green}✓ ${result.message}${A.reset}`);
    provider.models = result.models;
  }

  if (provider.models?.length) {
    const chosen = await showModelSelector(provider.models, result.models[0]);
    provider.default_model = chosen ?? result.models[0];
  } else {
    provider.default_model = await prompt(isEn ? 'Default model' : 'Model default', DEFAULT_MODEL);
  }

  patchConfig((c) => {
    c.providers.push(provider);
    c.provider.active = provider.name;
  });
  line(`  ${A.green}✓ provider "${provider.name}" ${isEn ? 'saved and set active' : 'disimpan dan dijadikan aktif'}${A.reset}\n`);
  return true;
}

// ── Wizard utama ───────────────────────────────────────────

export async function runWizard(): Promise<void> {
  const cfg = fs.existsSync(getConfigDir()) ? readConfig() : initDefaultConfig(true);
  const isEn = isEnglish(cfg);

  // 1. Bahasa
  const lang = await showModelSelector(['Bahasa Indonesia', 'English'], isEn ? 'English' : 'Bahasa Indonesia');
  if (lang) cfg.settings.language = lang === 'English' ? 'en' : 'id';
  writeConfig(cfg);

  // 2. Splash + pilih provider
  process.stdout.write('\x1b[2J\x1b[H');
  line();
  line(`  ${A.cyan}╭──────────────────────────────────────────╮${A.reset}`);
  line(`  ${A.cyan}│${A.reset}  ${A.bold}${A.blue}J A C K${A.reset} ${A.gray}•${A.reset} ${A.bold}${A.white}A G E N T${A.reset}                     ${A.cyan}│${A.reset}`);
  line(`  ${A.cyan}╰──────────────────────────────────────────╯${A.reset}`);
  line();

  const kinds = ['antigravity (login Google)', 'openai-compatible (base_url + api_key)'];
  const chosenKind = await showModelSelector(kinds, kinds[0]);

  let ok = true;
  if (chosenKind === kinds[1]) {
    ok = await addProviderWizard(cfg);
  } else {
    ok = await loginAntigravity(cfg);
  }
  if (!ok) return;

  // 3. Model untuk provider aktif
  const fresh = readConfig();
  const active = fresh.providers.find(p => p.name === fresh.provider.active) ?? fresh.providers[0];
  let models: string[] = active.models?.length ? active.models : [];
  if (!models.length) {
    const test = await testProvider(active);
    if (test.ok && test.models.length) models = test.models;
  }
  if (models.length) {
    const chosen = await showModelSelector(models, resolveModel(active, active.default_model));
    if (chosen) {
      patchConfig((c) => {
        const p = c.providers.find(x => x.name === active.name);
        if (p) p.default_model = chosen;
      });
      line(`  ${A.green}✓ ${isEn ? 'Default model saved' : 'Model default disimpan'}: ${A.white}${chosen}${A.reset}`);
    }
  }

  // 4. Ringkasan
  const finalCfg = readConfig();
  line(`\n  ${A.green}✓ ${isEn ? 'Setup complete' : 'Setup selesai'}${A.reset}`);
  line(`  ${A.gray}${isEn ? 'Active provider' : 'Provider aktif'}: ${A.white}${finalCfg.provider.active}${A.reset}`);
  line(`  ${A.gray}${isEn ? 'Try' : 'Coba'}: ${A.white}jack "sebutkan isi direktori ini"${A.reset}\n`);

  // 5. Integrasi OS (opsional)
  const answer = (await prompt(isEn ? 'Add JACK to right-click menu & app launcher? (Y/n)' : 'Tambahkan JACK ke menu klik-kanan & launcher aplikasi? (Y/n)', 'y')).toLowerCase();
  if (answer !== 'n') {
    const { setupOSIntegrations } = await import('../core/setup');
    await setupOSIntegrations();
  }
}

/** `jack login` (provider antigravity) */
export async function runRelogin(): Promise<void> {
  const cfg = fs.existsSync(getConfigDir()) ? readConfig() : initDefaultConfig(true);
  cfg.auth = { ...defaultConfig().auth };
  writeConfig(cfg);
  await loginAntigravity(cfg);
}

/** `jack logout` */
export function runLogout(): void {
  const cfg = readConfig();
  cfg.auth = { ...defaultConfig().auth };
  writeConfig(cfg);
  line(`\n  ${A.green}✓ ${isEnglish(cfg) ? 'Logged out (token removed)' : 'Logout (token dihapus)'}${A.reset}\n`);
}

// ── Uninstall ──────────────────────────────────────────────

export async function runUninstall(purge = false): Promise<void> {
  const t = getTheme();
  const { deleteConfig } = await import('../core/config');
  const { execSync } = await import('child_process');

  let isEn = false;
  try { isEn = isEnglish(readConfig()); } catch { /* config belum ada */ }

  line();
  line(`${A.cyan}JACK-AGENT — Uninstall${A.reset}`);
  line();

  if (purge) {
    try {
      deleteConfig();
      line(`  ${A.green}✓ ${isEn ? 'Config, credentials, and skills deleted:' : 'Config, kredensial, dan skill dihapus:'} ${getConfigDir()}${A.reset}`);
    } catch {
      line(`  ${A.gray}⚠ ${isEn ? 'No config at' : 'Tidak ada config di'} ${getConfigDir()}${A.reset}`);
    }
  } else {
    line(`  ${A.gray}${isEn ? 'Config and skills kept at' : 'Config dan skill dipertahankan di'} ${getConfigDir()}${A.reset}`);
    line(`  ${A.gray}${isEn ? 'Use `jack uninstall --purge` to delete them too.' : 'Pakai `jack uninstall --purge` untuk menghapusnya juga.'}${A.reset}`);
  }

  // @ts-ignore process.pkg hanya ada di binary
  const isNpm = !process.pkg;
  if (isNpm) {
    line(`\n  ${A.gray}${isEn ? 'Removing NPM package...' : 'Menghapus dari NPM...'}${A.reset}`);
    try {
      execSync('npm uninstall -g @prastya-dev/jack-agent', { stdio: 'ignore' });
      line(`  ${A.green}✓ ${isEn ? 'NPM package removed.' : 'Paket NPM dihapus.'}${A.reset}`);
    } catch {
      line(`  ${A.red}✗ ${isEn ? 'Failed to remove NPM package. Run manually:' : 'Gagal menghapus paket NPM. Jalankan manual:'}${A.reset}`);
      line(`    npm uninstall -g @prastya-dev/jack-agent`);
    }
  } else {
    const destPath = process.execPath;
    line(`\n  ${A.gray}${isEn ? 'Removing standalone binary...' : 'Menghapus binary mandiri...'}${A.reset}`);
    try {
      if (process.platform === 'win32') {
        const cmdPath = destPath + '.del.cmd';
        fs.writeFileSync(cmdPath, `ping 127.0.0.1 -n 3 > nul\ndel "${destPath}"\ndel "%~f0"`);
        const { spawn } = await import('child_process');
        spawn('cmd.exe', ['/c', cmdPath], { detached: true, stdio: 'ignore' }).unref();
        line(`  ${A.green}✓ ${isEn ? 'Binary will be deleted on exit.' : 'Binary akan dihapus setelah keluar.'}${A.reset}`);
      } else {
        fs.unlinkSync(destPath);
        line(`  ${A.green}✓ ${isEn ? 'Binary removed:' : 'Binary dihapus:'} ${destPath}${A.reset}`);
      }
    } catch {
      line(`  ${A.red}✗ ${isEn ? 'Failed to remove binary (may need sudo/Admin).' : 'Gagal menghapus binary (mungkin butuh sudo/Admin).'}${A.reset}`);
      line(`    ${destPath}`);
    }
  }

  if (process.platform === 'win32') {
    try {
      execSync('reg delete "HKCU\\Software\\Classes\\Directory\\Background\\shell\\JACK" /f > nul 2>&1', { stdio: 'ignore' });
      execSync('reg delete "HKCU\\Software\\Classes\\Directory\\shell\\JACK" /f > nul 2>&1', { stdio: 'ignore' });
    } catch { /* tidak ada entri */ }
  }

  line('');
}

export { isConfigured };
