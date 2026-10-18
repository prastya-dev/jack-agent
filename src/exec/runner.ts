import { exec } from 'child_process';
import { stateManager } from '../core/state';

// ============================================================
// JACK-AGENT — Subprocess Execution Engine
// Runs shell commands and captures stdout/stderr
// ============================================================

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const EXEC_TIMEOUT_MS = 30_000; // 30 seconds max

/**
 * Execute a shell command in the current working directory.
 * Returns stdout, stderr, and exit code.
 */
export function runCommand(command: string): Promise<ExecResult> {
  const state = stateManager.get();
  const cwd = state.currentDir;

  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd,
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10 MB buffer
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      },
      (error, stdout, stderr) => {
        const exitCode = error?.code ?? 0;
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: typeof exitCode === 'number' ? exitCode : 0,
        });
      },
    );
  });
}

/** List of patterns that are considered dangerous */
const DANGER_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+[/~]/i,     // rm -rf /... or ~/...
  /mkfs/i,                  // format disk
  /dd\s+if=/i,              // disk dump
  />\s*\/dev\/sd/i,         // write to raw disk
  /shutdown/i,
  /reboot/i,
  /format\s+c:/i,           // Windows format C:
  /del\s+\/[sq]/i,          // Windows recursive delete
];

/** Returns true if the command matches a known dangerous pattern */
export function isDangerousCommand(command: string): boolean {
  return DANGER_PATTERNS.some((pattern) => pattern.test(command));
}
