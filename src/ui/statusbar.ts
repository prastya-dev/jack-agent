import { stateManager } from '../core/state';
import { getTheme, separator } from './theme';

// ============================================================
// JACK-AGENT — Dynamic Status Bar
// Format: JACK /path/to/dir | model : <model> | mode : <mode>
// ============================================================

export function renderStatusBar(): void {
  const t = getTheme();
  const state = stateManager.get();
  const cols = process.stdout.columns || 80;

  const sep = `${t.separator}${'─'.repeat(cols)}${t.reset}`;

  const dirPart   = `${t.bold}${t.accent}JACK${t.reset} ${t.dim}${state.currentDir}${t.reset}`;
  const modelPart = `${t.dim}model${t.reset} ${t.reset}: ${t.accentDim}${state.selectedModel}${t.reset}`;
  const modePart  = `${t.dim}mode${t.reset}  : ${t.accent}${state.activeMode}${t.reset}`;

  const statusLine = `${dirPart}  ${t.separator}│${t.reset}  ${modelPart}  ${t.separator}│${t.reset}  ${modePart}`;

  process.stdout.write('\n' + sep + '\n');
  process.stdout.write(statusLine + '\n');
  process.stdout.write(sep + '\n');
}

/** Print user input line with "Me : " prefix */
export function printUserMessage(text: string): void {
  const t = getTheme();
  const cols = process.stdout.columns || 80;
  const sep = `${t.separator}${'─'.repeat(cols)}${t.reset}`;
  process.stdout.write(sep + '\n');
  process.stdout.write(`${t.userLabel}Me${t.reset} : ${t.text}${text}${t.reset}\n`);
  process.stdout.write('\n');
}

/** Print the "jack > " bot prefix before streaming */
export function printBotPrefix(): void {
  const t = getTheme();
  process.stdout.write(`${t.botLabel}jack${t.reset} > `);
}
