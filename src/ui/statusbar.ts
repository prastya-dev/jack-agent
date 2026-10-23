import { getState } from '../core/state';
import { getTheme } from './theme';

// ============================================================
// JACK-AGENT — Baris status & pesan pengguna
// ============================================================

export function stateSnapshot(): string {
  const state = getState();
  return `${state.provider} · ${state.model || '(model belum dipilih)'} · ${state.currentDir}`;
}

export function renderStatusBar(): void {
  if (!process.stdout.isTTY) return;   // non-TTY: output polos (PRD F5)
  const t = getTheme();
  const cols = process.stdout.columns || 80;
  const sep = `${t.separator}${'─'.repeat(cols)}${t.reset}`;
  process.stdout.write('\n' + sep + '\n');
  process.stdout.write(`${t.bold}${t.accent}JACK${t.reset}  ${t.dim}${stateSnapshot()}${t.reset}\n`);
  process.stdout.write(sep + '\n');
}

export function printUserMessage(text: string): void {
  const t = getTheme();
  process.stdout.write(`${t.userLabel}Me${t.reset} : ${t.text}${text}${t.reset}\n`);
}
