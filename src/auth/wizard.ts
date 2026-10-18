import { initDefaultConfig, writeConfig, readConfig, getConfigDir } from '../core/config';
import { createOAuthSession, openBrowser, fetchUserProjects } from './oauth';
import { getTheme, A } from '../ui/theme';
import { showModelSelector } from '../ui/modelselector';
import { fetchModels } from '../api/client';
import { DEFAULT_MODEL } from '../core/constants';

// ============================================================
// JACK-AGENT — "Connect Antigravity" Dialog
//
// Meniru persis UI seperti di foto:
//  ┌──────────────────────────────────────────┐
//  │  Connect Antigravity                     │
//  ├──────────────────────────────────────────┤
//  │  ⠋  Waiting for popup authorization...  │  ← spinner animasi
//  ├──────── OR PASTE CALLBACK URL ───────────┤
//  │  Step 1: Open this URL in your browser   │
//  │  https://accounts.google.com/...         │
//  │  Step 2: Paste the callback URL here     │
//  │  http://localhost:8085/callback?... > _  │  ← input
//  └──────────────────────────────────────────┘
// ============================================================

const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

/** Strip ANSI escape codes to get visible length */
function vlen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b[78]/g, '').length;
}

// ── Dialog renderer ────────────────────────────────────────

interface DialogInfo {
  lines:       string[];
  spinnerLine: number;  // 0-indexed line containing spinner
  spinnerCol:  number;  // 1-indexed terminal column of spinner char
}

function buildDialog(authUrl: string, spinnerChar: string): DialogInfo {
  const cols  = process.stdout.columns || 80;
  const W     = Math.max(50, Math.min(cols - 4, 66)); // box total width
  const inner = W - 2;                                // inside │ │

  const t = getTheme();

  // ── Border / box helpers ─────────────────────────────────
  const top    = `${A.blue}┌${'─'.repeat(inner)}┐${A.reset}`;
  const bottom = `${A.blue}└${'─'.repeat(inner)}┘${A.reset}`;
  const mid    = `${A.blue}├${'─'.repeat(inner)}┤${A.reset}`;

  function centeredDiv(label: string): string {
    const vis  = vlen(label);
    const pad  = inner - vis;
    const lp   = Math.floor(pad / 2);
    const rp   = pad - lp;
    return `${A.blue}├${'─'.repeat(lp)}${A.gray}${label}${'─'.repeat(rp)}${A.blue}┤${A.reset}`;
  }

  function row(content: string, leftPad = 2): string {
    const pad = ' '.repeat(leftPad);
    const vis = vlen(content);
    const rightSpaces = Math.max(0, inner - leftPad - vis - leftPad);
    return `${A.blue}│${A.reset}${pad}${content}${' '.repeat(rightSpaces)}${' '.repeat(leftPad)}${A.blue}│${A.reset}`;
  }

  // ── Truncate URL to fit ──────────────────────────────────
  const maxUrl = inner - 4;
  const urlShort = authUrl.length > maxUrl
    ? authUrl.slice(0, maxUrl - 3) + '...'
    : authUrl;

  const spinnerContent = `${A.cyan}${spinnerChar}${A.reset}  ${A.white}Waiting for browser authorization...${A.reset}`;
  const spinnerCol = 4;

  const lines: string[] = [];
  lines.push(top);                                                    // 0
  lines.push(row(`${A.bold}${A.white}Connect Antigravity${A.reset}`)); // 1
  lines.push(mid);                                                    // 2
  lines.push(row(''));                                                // 3
  lines.push(row(spinnerContent));                                    // 4 ← SPINNER
  lines.push(row(''));                                                // 5
  lines.push(bottom);                                                 // 6

  return { lines, spinnerLine: 4, spinnerCol };
}

// ── Connect Antigravity Dialog ─────────────────────────────

/**
 * Render "Connect Antigravity" dialog and handle the auth flow.
 * Race between:
 *  - Automatic callback (browser → Google → localhost callback)
 *  - Manual paste (user pastes the full callback URL)
 */
async function showConnectDialog(
  authUrl:     string,
  serverCode:  Promise<string>,
  onCancel:    () => void,
): Promise<string> {
  // ── Initial render ─────────────────────────────────────
  let spinnerIdx = 0;
  const dialog = buildDialog(authUrl, SPINNER_FRAMES[0]);

  process.stdout.write('\n');
  dialog.lines.forEach(l => process.stdout.write(l + '\n'));

  // Lines printed above cursor: dialog.lines.length (each with \n)
  // spinnerLine offset from current cursor position:
  const DIALOG_HEIGHT = dialog.lines.length; // 7
  const SPINNER_OFFSET = DIALOG_HEIGHT - dialog.spinnerLine; // 7 - 4 = 3

  // Hide cursor during spinner
  process.stdout.write('\x1b[?25l');

  const spinnerInterval = setInterval(() => {
    spinnerIdx = (spinnerIdx + 1) % SPINNER_FRAMES.length;
    const c = SPINNER_FRAMES[spinnerIdx];

    process.stdout.write(
      A.up(SPINNER_OFFSET) +
      A.col(dialog.spinnerCol) +
      A.cyan + c + A.reset +
      '\x1b[' + (SPINNER_OFFSET) + 'B' // move down back
    );
  }, 80);

  // Allow Ctrl+C to cancel
  const cancelPromise = new Promise<never>((_, reject) => {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (b: Buffer) => {
      if (b.toString() === '\x03') { // Ctrl+C
        cleanup();
        onCancel();
        reject(new Error('Login dibatalkan'));
      }
    };
    function cleanup() {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.stdin.on('data', onData);
    
    // Also cleanup if serverCode resolves/rejects
    serverCode.finally(cleanup).catch(()=>{});
  });

  try {
    const code = await Promise.race([serverCode, cancelPromise]);
    clearInterval(spinnerInterval);
    process.stdout.write(
      A.up(SPINNER_OFFSET) + A.col(dialog.spinnerCol) +
      A.green + '✓' + A.reset +
      '\x1b[' + (SPINNER_OFFSET) + 'B'
    );
    process.stdout.write('\x1b[?25h\n'); // show cursor, newline
    return code;
  } catch (err) {
    clearInterval(spinnerInterval);
    process.stdout.write('\x1b[?25h\n'); // show cursor
    throw err;
  }
}


// ── Success Screen ─────────────────────────────────────────

function showSuccessScreen(name: string, email: string): void {
  const t   = getTheme();
  const col = process.stdout.columns || 80;
  const sep = `${t.separator}${'─'.repeat(col)}${t.reset}`;

  let isEn = false;
  try {
    const { readConfig } = require('../core/config');
    isEn = readConfig().settings.language === 'en';
  } catch {}

  process.stdout.write('\x1b[2J\x1b[H'); // clear screen

 const logo = [
  `  ${A.cyan}╭──────────────────────────────────────────╮${A.reset}`,
  `  ${A.cyan}│${A.reset}  ${A.bold}${A.blue}J A C K${A.reset} ${A.gray}•${A.reset} ${A.bold}${A.white}A G E N T${A.reset}                     ${A.cyan}│${A.reset}`,
  `  ${A.cyan}│${A.reset}  ${A.gray}▸ Next-Gen CLI AI Assistant${A.reset}             ${A.cyan}│${A.reset}`,
  `  ${A.cyan}╰──────────────────────────────────────────╯${A.reset}`,
];
  console.log('');
  logo.forEach(l => console.log(l));
  console.log('');
  console.log(sep);
  console.log(`  ${A.green}✓ ${isEn ? 'Login successful!' : 'Login berhasil!'}${A.reset}`);
  if (name)  console.log(`  ${A.gray}${isEn ? 'Hello,' : 'Halo,'}${A.reset} ${A.bold}${A.white}${name}${A.reset}`);
  if (email) console.log(`  ${A.gray}${isEn ? 'Account :' : 'Akun :'}${A.reset} ${A.white}${email}${A.reset}`);
 
  console.log(sep + '\n');
}

// ── runWizard ──────────────────────────────────────────────

export async function runWizard(): Promise<void> {
  const t   = getTheme();
  const col = process.stdout.columns || 80;
  const sep = `${t.separator}${'─'.repeat(col)}${t.reset}`;

  // Pastikan config dasar ada
  let cfg;
  try { cfg = readConfig(); } catch { cfg = initDefaultConfig(); }

  // 1. Language Selection
  process.stdout.write('\x1b[2J\x1b[H');
  const langChosen = await showModelSelector(['English', 'Bahasa Indonesia'], cfg.settings.language === 'en' ? 'English' : 'Bahasa Indonesia');
  cfg.settings.language = langChosen === 'English' ? 'en' : 'id';
  writeConfig(cfg);
  
  const isEn = cfg.settings.language === 'en';

  // Splash
  process.stdout.write('\x1b[2J\x1b[H');
  const logo = [
  `  ${A.cyan}╭──────────────────────────────────────────╮${A.reset}`,
  `  ${A.cyan}│${A.reset}  ${A.bold}${A.blue}J A C K${A.reset} ${A.gray}•${A.reset} ${A.bold}${A.white}A G E N T${A.reset}                     ${A.cyan}│${A.reset}`,
  `  ${A.cyan}│${A.reset}  ${A.gray}▸ Next-Gen CLI AI Assistant${A.reset}             ${A.cyan}│${A.reset}`,
  `  ${A.cyan}╰──────────────────────────────────────────╯${A.reset}`,
];
  console.log('');
  logo.forEach(l => console.log(l));
  console.log('');
  console.log(sep);
  console.log(`  ${A.white}${isEn ? 'Sign in with your Google account to continue' : 'Masuk dengan akun Google untuk melanjutkan'}${A.reset}`);
  console.log(sep);
  console.log(`
  ${A.gray}${isEn ? 'Continue to Google → Browser opens automatically' : 'Lanjutkan ke Google → Browser terbuka otomatis'}
  ${A.gray}${isEn ? 'Select your Google account → Click "Allow"' : 'Pilih akun Google Anda → Klik "Izinkan"'}${A.reset}

`);

  // Buat OAuth session (server + URL sudah siap)
  let session;
  try {
    session = await createOAuthSession();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  ${A.red}✗ ${isEn ? 'Failed to prepare OAuth' : 'Gagal mempersiapkan OAuth'}: ${msg}${A.reset}\n`);
    process.exit(1);
  }

  // Buka browser
  await openBrowser(session.authUrl);

  // 1.5 Auto-Install Windows Context Menu (Bagi pengguna NPM / Binary)
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const regBg = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\JACK';
      const regDir = 'HKCU\\Software\\Classes\\Directory\\shell\\JACK';
      
      // Tambahkan registry minimalis sebagai fallback
      execSync(`reg add "${regBg}" /ve /d "Run JACK Here" /f > nul 2>&1`, { stdio: 'ignore' });
      execSync(`reg add "${regBg}\\command" /ve /d "cmd.exe /c start /d \\"%V\\" jack" /f > nul 2>&1`, { stdio: 'ignore' });
      execSync(`reg add "${regDir}" /ve /d "Run JACK Here" /f > nul 2>&1`, { stdio: 'ignore' });
      execSync(`reg add "${regDir}\\command" /ve /d "cmd.exe /c start /d \\"%1\\" jack" /f > nul 2>&1`, { stdio: 'ignore' });
    } catch (e) {
      // Abaikan jika gagal
    }
  }

  // Tampilkan dialog "Connect Antigravity" + tunggu code
  let code: string;
  try {
    code = await showConnectDialog(
      session.authUrl,
      session.waitForCode,
      () => session.cancel(),
    );
  } catch (err: unknown) {
    session.cancel();
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  ${A.red}✗ ${isEn ? 'Login failed' : 'Login gagal'}: ${msg}${A.reset}\n`);
    process.exit(1);
  }

  // Tukar code → tokens
  process.stdout.write(`\n  ${A.gray}${isEn ? 'Fetching tokens...' : 'Mengambil token...'}${A.reset}\n`);
  let tokens;
  try {
    tokens = await session.exchangeCode(code);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  ${A.red}✗ ${isEn ? 'Token exchange failed' : 'Token exchange gagal'}: ${msg}${A.reset}\n`);
    process.exit(1);
  }

  // Ambil project otomatis
  process.stdout.write(`  ${A.gray}${isEn ? 'Searching for active Google Cloud Project...' : 'Mencari Google Cloud Project aktif...'}${A.reset}\n`);
  const projects = await fetchUserProjects(tokens.access_token);
  
  if (projects.length > 0) {
    cfg.environment.project_id = projects[0];
    process.stdout.write(`  ${A.green}✓ ${isEn ? 'Using Project' : 'Menggunakan Project'}: ${A.white}${projects[0]}${A.reset}\n`);
    if (projects.length > 1) {
      process.stdout.write(`    ${A.gray}(${isEn ? `You have ${projects.length} projects. Edit ~/.config/jack/config.json to change it` : `Anda memiliki ${projects.length} project. Edit ~/.config/jack/config.json untuk mengubahnya`})${A.reset}\n`);
    }
  } else {
    process.stdout.write(`  ${A.red}⚠ ${isEn ? 'Warning: No Google Cloud Project found!' : 'Peringatan: Tidak ada Google Cloud Project ditemukan!'}${A.reset}\n`);
    process.stdout.write(`    ${A.gray}${isEn ? 'Create a project at console.cloud.google.com to call the AI.' : 'Buat project di console.cloud.google.com agar bisa memanggil AI.'}${A.reset}\n`);
  }

  // Simpan tokens
  cfg.auth.access_token  = tokens.access_token;
  cfg.auth.refresh_token = tokens.refresh_token;
  cfg.auth.token_type    = tokens.token_type;
  cfg.auth.expiry_date   = tokens.expiry_date;
  cfg.auth.user_email    = tokens.user_email;
  cfg.auth.user_name     = tokens.user_name;
  cfg.auth.user_picture  = tokens.user_picture;
  writeConfig(cfg);

  // Sukses
  showSuccessScreen(tokens.user_name, tokens.user_email);

  // Model Selection
  process.stdout.write(`\n  ${A.gray}${isEn ? 'Fetching AI models list...' : 'Mengambil daftar model AI...'}${A.reset}\n`);
  let models = [DEFAULT_MODEL]; // fallback
  try {
    models = await fetchModels();
  } catch (err) {
    // ignore
  }

  const chosen = await showModelSelector(models, DEFAULT_MODEL);
  if (chosen) {
    cfg.settings.default_model = chosen;
    writeConfig(cfg);
    process.stdout.write(`\n  ${A.green}✓ ${isEn ? 'Default model saved' : 'Model default disimpan'}: ${A.white}${chosen}${A.reset}\n\n`);
  } else {
    process.stdout.write(`\n  ${A.gray}${isEn ? 'Using default model' : 'Menggunakan model bawaan'}: ${A.white}${DEFAULT_MODEL}${A.reset}\n\n`);
  }

  // OS Integration Setup Prompt
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question(`  ${A.cyan}[?]${A.reset} ${A.white}${isEn ? 'Add JACK to Right-Click Menu & App Launcher? (Y/n)' : 'Tambahkan JACK ke menu Klik-Kanan & Shortcut Aplikasi? (Y/n)'}${A.reset} `, resolve);
  });
  rl.close();

  if (answer.trim().toLowerCase() !== 'n') {
    const { setupOSIntegrations } = require('../core/setup');
    await setupOSIntegrations();
  }
}

// ── Re-login ────────────────────────────────────────────────

export async function runRelogin(): Promise<void> {
  try {
    const cfg = readConfig();
    cfg.auth.access_token = ''; cfg.auth.refresh_token = ''; cfg.auth.expiry_date = 0;
    writeConfig(cfg);
  } catch { /* config belum ada */ }
  await runWizard();
}

// ── Uninstall ────────────────────────────────────────────────

export async function runUninstall(): Promise<void> {
  const t   = getTheme();
  const col = process.stdout.columns || 80;
  const sep = `${t.separator}${'─'.repeat(col)}${t.reset}`;
  const { deleteConfig, getConfigDir: gcd } = await import('../core/config');
  const fs = await import('fs');
  const { execSync } = await import('child_process');

  let isEn = false;
  try {
    const { readConfig } = await import('../core/config');
    isEn = readConfig().settings.language === 'en';
  } catch {}

  console.log('\n' + sep);
  console.log(`  ${A.cyan}JACK-AGENT - Uninstall${A.reset}`);
  console.log(sep);
  
  // 1. Delete Config
  try {
    deleteConfig();
    console.log(`\n  ${A.green}✓ ${isEn ? 'Session deleted:' : 'Sesi dihapus:'} ${gcd()}${A.reset}`);
  } catch {
    console.log(`\n  ${A.gray}⚠ ${isEn ? 'No config found at:' : 'Tidak ada data konfigurasi di:'} ${gcd()}${A.reset}`);
  }

  // 2. Uninstall logic
  // @ts-ignore
  const isNpm = process.execPath.includes('node') || !process.pkg;
  
  if (isNpm) {
    console.log(`\n  ${A.gray}${isEn ? 'Removing NPM package...' : 'Menghapus dari NPM...'}${A.reset}`);
    try {
      execSync('npm uninstall -g @prastya-dev/jack-agent', { stdio: 'ignore' });
      console.log(`  ${A.green}✓ ${isEn ? 'NPM package removed.' : 'Paket NPM berhasil dihapus.'}${A.reset}`);
    } catch (err) {
      console.log(`  ${A.red}✗ ${isEn ? 'Failed to remove NPM package automatically.' : 'Gagal menghapus paket NPM otomatis.'}${A.reset}`);
      console.log(`  ${isEn ? 'Please run:' : 'Silakan jalankan:'} ${A.cyan}npm uninstall -g @prastya-dev/jack-agent${A.reset}`);
    }
    
    if (process.platform === 'win32') {
      try {
        const regBg = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\JACK';
        const regDir = 'HKCU\\Software\\Classes\\Directory\\shell\\JACK';
        execSync(`reg delete "${regBg}" /f > nul 2>&1`, { stdio: 'ignore' });
        execSync(`reg delete "${regDir}" /f > nul 2>&1`, { stdio: 'ignore' });
      } catch {}
    }
  } else {
    // Compiled binary
    const destPath = process.execPath;
    console.log(`\n  ${A.gray}${isEn ? 'Removing standalone binary...' : 'Menghapus binary mandiri...'}${A.reset}`);
    try {
      if (process.platform === 'win32') {
        // Windows cannot delete running executable directly. We write a small cmd to delete it after exit.
        const cmdPath = destPath + '.del.cmd';
        const regBg = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\JACK';
        const regDir = 'HKCU\\Software\\Classes\\Directory\\shell\\JACK';
        fs.writeFileSync(cmdPath, `ping 127.0.0.1 -n 3 > nul\nreg delete "${regBg}" /f > nul 2>&1\nreg delete "${regDir}" /f > nul 2>&1\ndel "${destPath}"\ndel "%~f0"`);
        const { spawn } = await import('child_process');
        spawn('cmd.exe', ['/c', cmdPath], { detached: true, stdio: 'ignore' }).unref();
        console.log(`  ${A.green}✓ ${isEn ? 'Binary and Context Menu will be deleted on exit.' : 'Binary dan Context Menu akan dihapus otomatis setelah aplikasi tertutup.'}${A.reset}`);
      } else {
        fs.unlinkSync(destPath);
        console.log(`  ${A.green}✓ ${isEn ? 'Binary removed from:' : 'Binary berhasil dihapus dari:'} ${destPath}${A.reset}`);
      }
    } catch (err) {
      console.log(`  ${A.red}✗ ${isEn ? 'Failed to remove binary (may need sudo/Admin).' : 'Gagal menghapus binary (mungkin butuh akses sudo/Admin).'}${A.reset}`);
      console.log(`  ${isEn ? 'Please delete manually:' : 'Silakan hapus manual file:'} ${A.cyan}${destPath}${A.reset}`);
    }
  }

  console.log(sep + '\n');
}
