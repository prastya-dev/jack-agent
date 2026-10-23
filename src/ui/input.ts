import * as readline from 'readline';
import { canRaw } from './confirm';
import { getTheme } from './theme';
import { scrollbarCells, windowStart } from './viewport';

// ============================================================
// JACK-AGENT — Input REPL dengan saran slash command
// Editor baris kecil berbasis raw mode (tanpa dependency baru).
// Non-TTY / tanpa raw mode → fallback readline biasa.
// ============================================================

export interface SlashCommand {
  name: string;
  description: string;
}

export interface ReadLineResult {
  text: string;
  interrupted: boolean;
}

const MAX_SUGGESTIONS = 8;

/** Riwayat perintah REPL (satu proses = satu sesi). */
const history: string[] = [];
let historyIndex = -1;

/** Saran hanya muncul untuk nama perintah (belum ada spasi). */
export function filterSlashCommands(line: string, commands: readonly SlashCommand[]): SlashCommand[] {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('/') || /\s/.test(trimmed)) return [];
  return commands.filter((command) => command.name.startsWith(trimmed.toLowerCase()));
}

function displayWidth(text: string): number {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').length;
}

/** Baris & kolom (1-based) untuk indeks karakter pada baris yang bisa membungkus. */
function positionOf(index: number, cols: number): { row: number; col: number } {
  if (index > 0 && index % cols === 0) return { row: index / cols - 1, col: cols };
  return { row: Math.floor(index / cols), col: (index % cols) + 1 };
}

function fallback(prompt: string): Promise<ReadLineResult | null> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true, historySize: 100 });
  return new Promise((resolve) => {
    let settled = false;
    rl.once('close', () => {
      if (settled) return;
      settled = true;
      resolve(null);
    });
    rl.question(prompt, (answer) => {
      if (settled) return;
      settled = true;
      rl.close();
      resolve({ text: answer, interrupted: false });
    });
  });
}

export function readLine(prompt: string, commands: readonly SlashCommand[] = []): Promise<ReadLineResult | null> {
  if (!canRaw()) return fallback(prompt);

  const t = getTheme();
  return new Promise((resolve) => {
    let buffer = '';
    let caret = 0;
    let selected = 0;
    let suggestions: SlashCommand[] = [];
    let lastQuery = '';
    let stateRow = 0;
    let pending = '';
    let done = false;
    historyIndex = -1;

    function visibleCount(): number {
      const rows = process.stdout.rows || 24;
      return Math.max(3, Math.min(MAX_SUGGESTIONS, rows - 8));
    }

    function suggestionLines(): string[] {
      if (!suggestions.length) return [];
      const cols = process.stdout.columns || 80;
      const size = visibleCount();
      const total = suggestions.length;
      const shown = Math.min(size, total);
      const start = windowStart(selected, total, shown);
      const cells = scrollbarCells(total, shown, start);
      const width = Math.max(10, cols - 3);
      const lines: string[] = [];

      for (let i = 0; i < shown; i++) {
        const item = suggestions[start + i];
        const plain = ` ${item.name.padEnd(11)} ${item.description}`;
        const body = plain.length > width - 1 ? `${plain.slice(0, width - 2)}…` : plain.padEnd(width - 1);
        const styled = start + i === selected
          ? `${t.accentBg}\x1b[30m${body}${t.reset}`
          : `${t.dim}${body}${t.reset}`;
        const bar = cells[i] ? `${t.accent}█${t.reset}` : `${t.separator}│${t.reset}`;
        lines.push(styled + bar);
      }

      const more: string[] = [];
      if (start > 0) more.push(`↑ ${start} lagi`);
      if (start + shown < total) more.push(`↓ ${total - start - shown} lagi`);
      const hint = 'Tab isi · Enter jalankan';
      lines.push(`${t.separator}  ${more.length ? `${more.join(' · ')} · ` : ''}${hint}${t.reset}`);
      return lines;
    }

    function refresh(): void {
      const query = buffer.trimStart().toLowerCase();
      suggestions = filterSlashCommands(buffer, commands);
      if (query !== lastQuery) {
        selected = 0;
        lastQuery = query;
      }
      if (selected >= suggestions.length) selected = Math.max(0, suggestions.length - 1);
    }

    function render(): void {
      const cols = process.stdout.columns || 80;
      const promptLen = displayWidth(prompt);
      const end = positionOf(promptLen + buffer.length, cols);
      const caretAt = positionOf(promptLen + caret, cols);
      const extra = suggestionLines();

      let out = '\r';
      if (stateRow > 0) out += `\x1b[${stateRow}A`;
      out += '\x1b[J';
      out += prompt + t.text + buffer + t.reset;
      for (const line of extra) out += `\n${line}`;

      out += '\r';
      if (extra.length) out += `\x1b[${extra.length}A`;
      if (end.row > caretAt.row) out += `\x1b[${end.row - caretAt.row}A`;
      else if (caretAt.row > end.row) out += `\x1b[${caretAt.row - end.row}B`;
      out += `\x1b[${caretAt.col}G`;

      process.stdout.write(out);
      stateRow = caretAt.row;
    }

    function cleanup(): void {
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', eof);
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    function eof(): void {
      if (done) return;
      done = true;
      cleanup();
      process.stdout.write('\n');
      resolve(null);
    }

    function finish(interrupted: boolean): void {
      if (done) return;
      done = true;
      cleanup();
      process.stdout.write('\n');
      resolve({ text: buffer, interrupted });
    }

    function submit(): void {
      const text = buffer;
      if (text.trim() && history[history.length - 1] !== text) history.push(text);
      finish(false);
    }

    function insert(text: string): void {
      buffer = buffer.slice(0, caret) + text + buffer.slice(caret);
      caret += text.length;
    }

    function setLine(text: string): void {
      buffer = text;
      caret = text.length;
    }

    function complete(): void {
      if (!suggestions.length) return;
      setLine(`${suggestions[selected].name} `);
      suggestions = [];
      selected = 0;
      lastQuery = buffer;
    }

    function historyPrev(): void {
      if (!history.length) return;
      historyIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setLine(history[historyIndex]);
    }

    function historyNext(): void {
      if (historyIndex === -1) return;
      if (historyIndex >= history.length - 1) {
        historyIndex = -1;
        setLine('');
        return;
      }
      historyIndex += 1;
      setLine(history[historyIndex]);
    }

    function handle(key: string): void {
      const rows = visibleCount();

      switch (key) {
        case '\r':
        case '\n':
          if (suggestions.length && suggestions[selected].name !== buffer.trimEnd()) {
            complete();
            return;
          }
          submit();
          return;
        case '\x03':
          finish(true);
          return;
        case '\x04':
          if (!buffer) eof();
          else if (caret < buffer.length) buffer = buffer.slice(0, caret) + buffer.slice(caret + 1);
          return;
        case '\x1b':
          suggestions = [];
          return;
        case '\x1b[A':
          if (suggestions.length) selected = Math.max(0, selected - 1);
          else historyPrev();
          return;
        case '\x1b[B':
          if (suggestions.length) selected = Math.min(suggestions.length - 1, selected + 1);
          else historyNext();
          return;
        case '\x1b[C':
          caret = Math.min(buffer.length, caret + 1);
          return;
        case '\x1b[D':
          caret = Math.max(0, caret - 1);
          return;
        case '\x1b[H':
        case '\x1b[1~':
          caret = 0;
          return;
        case '\x1b[F':
        case '\x1b[4~':
          caret = buffer.length;
          return;
        case '\x1b[3~':
          if (caret < buffer.length) buffer = buffer.slice(0, caret) + buffer.slice(caret + 1);
          return;
        case '\x1b[5~':
        case '\x1b[6~':
          if (suggestions.length) {
            const step = key === '\x1b[5~' ? -rows : rows;
            selected = Math.max(0, Math.min(suggestions.length - 1, selected + step));
          }
          return;
        case '\t':
          complete();
          return;
        case '\x7f':
        case '\x08':
          if (caret > 0) {
            buffer = buffer.slice(0, caret - 1) + buffer.slice(caret);
            caret -= 1;
          }
          return;
        case '\x15': // Ctrl+U
          buffer = buffer.slice(caret);
          caret = 0;
          return;
        case '\x17': { // Ctrl+W
          const left = buffer.slice(0, caret);
          const word = /(\s+|\S+)$/.exec(left);
          if (word) {
            buffer = left.slice(0, left.length - word[0].length) + buffer.slice(caret);
            caret -= word[0].length;
          }
          return;
        }
        default:
          if (key >= ' ' && key !== '\x7f') insert(key);
      }
    }

    function feed(chunk: string): void {
      const text = pending + chunk;
      pending = '';
      let i = 0;
      while (i < text.length && !done) {
        if (text[i] === '\x1b') {
          const rest = text.slice(i);
          const seq = /^\x1b(\[[0-9;]*[A-Za-z~]|[A-Za-z])/.exec(rest);
          if (!seq) {
            pending = rest;
            break;
          }
          if (seq[0].length > 1 && seq[0][1] !== '[') {
            // ESC diikuti karakter biasa: Perlakukan ESC saja, jangan telan karakternya.
            handle('\x1b');
            i += 1;
            continue;
          }
          handle(seq[0]);
          i += seq[0].length;
          continue;
        }
        // Satu code point (aman untuk aksara non-ASCII).
        const cp = text.codePointAt(i) as number;
        const char = String.fromCodePoint(cp);
        handle(char);
        i += char.length;
      }

      if (done) return;
      refresh();
      render();
    }

    function onData(chunk: string): void {
      feed(chunk);
    }

    process.stdout.write(prompt);
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
    process.stdin.once('end', eof);
  });
}
