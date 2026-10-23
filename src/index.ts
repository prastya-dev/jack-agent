#!/usr/bin/env node
// ============================================================
// JACK-AGENT — Entry point (parsing argumen; sesi ada di session.ts)
// Satu mode: agentik. Lihat PRD.md § F9.
// ============================================================

import { APP_VERSION } from './core/constants';

function printHelp(): void {
  process.stdout.write(
`JACK-AGENT v${APP_VERSION} — agent CLI

Pemakaian:
  jack                          REPL agentik
  jack "<tujuan>"               REPL dengan tugas pertama langsung dikirim
  jack -p "<tujuan>"            sekali jalan, cetak hasil, keluar
  jack -p "<tujuan>" --allow-write
                                izin menjalankan perintah tulis tanpa dialog (one-shot)
  jack --provider <nama>        pakai provider ini untuk sesi ini
  jack --model <nama>           pakai model ini untuk sesi ini
  jack login | logout
  jack model | provider | skill
  jack update | uninstall [--purge]
  jack --version | --help

Tanpa argumen di non-TTY: stdin dibaca sampai EOF dan diperlakukan sebagai tugas.

Slash commands: /help /model /provider /skill /allow /compact /clear /cd /token /exit
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Flag cepat sebelum modul berat dimuat (optimize.md O-07)
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`JACK-AGENT v${APP_VERSION}\n`);
    return;
  }
  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    printHelp();
    return;
  }

  const { setColorMode } = await import('./ui/theme');
  setColorMode(Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);

  const sub = args[0];

  if (sub === 'login') {
    const { runRelogin } = await import('./ui/wizard');
    await runRelogin();
    return;
  }
  if (sub === 'logout') {
    const { runLogout } = await import('./ui/wizard');
    runLogout();
    return;
  }
  if (sub === 'provider') {
    const { runProviderCommand } = await import('./commands/provider');
    await runProviderCommand(args.slice(1));
    return;
  }
  if (sub === 'skill') {
    const { runSkillCommand } = await import('./commands/skill');
    await runSkillCommand(args.slice(1));
    return;
  }
  if (sub === 'model') {
    const { handleSlashCommand } = await import('./commands/slash');
    const { ensureSession } = await import('./session');
    await ensureSession();
    await handleSlashCommand(`/model ${args.slice(1).join(' ')}`.trim());
    return;
  }
  if (sub === 'update' || args.includes('--update')) {
    const { runUpdate } = await import('./core/updater');
    await runUpdate(APP_VERSION);
    return;
  }
  if (sub === 'uninstall' || args.includes('--uninstall')) {
    const { runUninstall } = await import('./ui/wizard');
    await runUninstall(args.includes('--purge'));
    return;
  }
  if (args.includes('--setup')) {
    const { setupOSIntegrations } = await import('./core/setup');
    await setupOSIntegrations();
    return;
  }

  const { startSession } = await import('./session');
  process.exitCode = await startSession(args);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${msg}\n`);
  process.exitCode = 1;
});
