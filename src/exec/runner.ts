import { spawn } from 'child_process';
import { COMMAND_TIMEOUT_MS, COMMAND_KILL_GRACE_MS, COMMAND_MAX_BUFFER } from '../core/constants';

// ============================================================
// JACK-AGENT — Eksekutor perintah (implementasi di balik
// pintu tunggal ToolRegistry.run(), PRD § 3.5 / I-9)
// ============================================================

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  overflowed: boolean;
}

function defaultShell(): { shell: string; flag: string } {
  if (process.platform === 'win32') {
    return { shell: process.env.COMSPEC || 'cmd.exe', flag: '/c' };
  }
  return { shell: process.env.SHELL || '/bin/sh', flag: '-c' };
}

/**
 * Jalankan satu perintah shell di cwd. stdin selalu kosong (perintah
 * interaktif tidak didukung, PRD F4) dan perintah yang mengabaikan
 * SIGTERM dipaksa mati setelah 3 s.
 */
export function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number = COMMAND_TIMEOUT_MS,
): Promise<ExecResult> {
  const { shell, flag } = defaultShell();

  return new Promise((resolve) => {
    const child = spawn(shell, [flag, command], { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let timedOut = false;
    let overflowed = false;
    let settled = false;

    const cap = (target: 'out' | 'err', chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > COMMAND_MAX_BUFFER) { overflowed = true; return; }
      if (target === 'out') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };

    child.stdout?.on('data', (c: Buffer) => cap('out', c));
    child.stderr?.on('data', (c: Buffer) => cap('err', c));

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), COMMAND_KILL_GRACE_MS).unref();
    }, timeoutMs);
    killTimer.unref();

    const done = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve({ stdout, stderr, exitCode, timedOut, overflowed });
    };

    child.on('error', (err) => {
      stderr += `${err.message}\n`;
      done(127);
    });
    child.on('close', (code, signal) => {
      if (timedOut) done(124);
      else if (code === null) done(signal === 'SIGKILL' ? 137 : 1);
      else done(code);
    });

    child.stdin?.end();
  });
}
