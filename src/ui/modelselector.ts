import * as readline from 'readline';
import { canRaw } from './confirm';
import { getTheme } from './theme';
import { scrollbarCells, windowStart } from './viewport';

// ============================================================
// JACK-AGENT — Pemilih model / daftar
// Non-TTY: cetak daftar sebagai teks dan pilih yang aktif (O-01).
// TTY: viewport tetap (maks 10 baris) + scrollbar untuk daftar panjang.
// ============================================================

const MAX_VISIBLE = 10;

export function showModelSelector(models: string[], currentModel: string): Promise<string | null> {
  if (models.length === 0) return Promise.resolve(null);

  const initial = Math.max(0, models.indexOf(currentModel));

  if (!canRaw()) {
    const t = getTheme();
    process.stdout.write(`${t.dim}  model tersedia: ${models.join(', ')}${t.reset}\n`);
    process.stdout.write(`${t.info}  ✓ model dipakai: ${models[initial]} (tidak ada TTY untuk memilih)${t.reset}\n`);
    return Promise.resolve(models[initial]);
  }

  return new Promise((resolve) => {
    const t = getTheme();
    const total = models.length;
    let selectedIdx = initial;
    let lastLines = 0;

    function visible(): number {
      const rows = process.stdout.rows || 24;
      return Math.max(3, Math.min(MAX_VISIBLE, total, rows - 8));
    }

    function renderList(): void {
      const cols = process.stdout.columns || 80;
      const size = visible();
      const start = windowStart(selectedIdx, total, size);
      const cells = scrollbarCells(total, size, start);
      const sep = `${t.separator}${'─'.repeat(cols)}${t.reset}`;
      const range = total > size ? `  ${start + 1}–${start + size} dari ${total}` : '';

      if (lastLines > 0) {
        readline.moveCursor(process.stdout, 0, -lastLines);
        readline.clearScreenDown(process.stdout);
      }

      const out: string[] = [];
      out.push(sep);
      out.push(`${t.accent}  Pilih${t.reset}  ${t.dim}(↑/↓ pilih, Enter konfirmasi, Esc batalkan)${range}${t.reset}`);
      out.push(sep);

      for (let i = 0; i < size; i++) {
        const idx = start + i;
        const selected = idx === selectedIdx;
        const width = Math.max(1, cols - 2);
        let plain = `${selected ? '▶' : ' '} ${models[idx] ?? ''}`;
        plain = plain.length > width ? `${plain.slice(0, width - 1)}…` : plain.padEnd(width);
        const styled = selected ? `${t.accentBg}\x1b[30m${plain}${t.reset}` : `${t.dim}${plain}${t.reset}`;
        const bar = cells[i] ? `${t.accent}█${t.reset}` : `${t.separator}│${t.reset}`;
        out.push(styled + bar);
      }

      out.push(sep);
      process.stdout.write(`${out.join('\n')}\n`);
      lastLines = out.length;
    }

    function cleanup(): void {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    function finish(value: string | null): void {
      cleanup();
      resolve(value);
    }

    function onData(chunk: string): void {
      let i = 0;
      while (i < chunk.length) {
        const rest = chunk.slice(i);
        const seq = /^\x1b(\[[0-9;]*[A-Za-z~]|[A-Za-z])/.exec(rest);
        const key = seq ? seq[0] : String.fromCodePoint(rest.codePointAt(0) as number);
        i += key.length;

        if (key === '\x1b[A' || key === 'k') {
          selectedIdx = (selectedIdx - 1 + total) % total;
          renderList();
        } else if (key === '\x1b[B' || key === 'j') {
          selectedIdx = (selectedIdx + 1) % total;
          renderList();
        } else if (key === '\r' || key === '\n') {
          finish(models[selectedIdx]);
          return;
        } else if (key === '\x1b' || key === 'q' || key === '\x03') {
          finish(null);
          return;
        }
      }
    }

    renderList();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  });
}
