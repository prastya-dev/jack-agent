import { getTheme } from './theme';

// ============================================================
// JACK-AGENT — Tampilan streaming
// Teks model tampil saat diterima; blok tool (json_exec)
// tidak pernah tercetak sebagai teks mentah (PRD F5).
// ============================================================

export interface StreamPrinter {
  write(text: string): void;
  end(): void;
}

const FENCE = '```';
/** Info string yang menandakan blok itu tool call, bukan contoh kode. */
const TOOL_INFO = new Set(['json_exec', 'json']);

export function createStreamPrinter(): StreamPrinter {
  let hold = '';
  let hiding = false;
  let printed = false;

  const flush = (text: string) => {
    if (!text) return;
    printed = true;
    process.stdout.write(text);
  };

  function consume(): void {
    for (;;) {
      if (hiding) {
        const end = hold.indexOf(FENCE);
        if (end === -1) return;                 // tunggu penutup blok
        hold = hold.slice(end + FENCE.length);
        hiding = false;
        continue;
      }

      const start = hold.indexOf(FENCE);
      if (start === -1) {
        // sisakan 3 karakter terakhir: mungkin awal ``` yang terpotong
        if (hold.length > 3) { flush(hold.slice(0, -3)); hold = hold.slice(-3); }
        return;
      }

      flush(hold.slice(0, start));
      const rest = hold.slice(start);
      const header = /^```([a-z_]*)[ \t]*\r?\n/i.exec(rest);
      if (!header) {
        if (rest.length < 16 && !rest.includes('\n')) { hold = rest; return; }  // fence belum lengkap
        flush(rest.slice(0, 3));
        hold = rest.slice(3);
        continue;
      }

      const info = header[1].toLowerCase();
      hold = rest.slice(header[0].length);
      if (TOOL_INFO.has(info)) hiding = true;
      else flush(header[0]);
    }
  }

  return {
    write(text: string): void {
      hold += text;
      consume();
    },
    end(): void {
      if (hiding) { hold = ''; }
      consume();
      flush(hold);
      hold = '';
      if (printed) process.stdout.write('\n');
    },
  };
}

/** Spinner hanya di TTY; non-TTY tidak boleh punya animasi (PRD F5/F11). */
export function startSpinner(label = 'berpikir'): () => void {
  if (!process.stdout.isTTY) return () => { /* tanpa spinner di non-TTY */ };

  const t = getTheme();
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let index = 0;
  let stopped = false;

  const timer = setInterval(() => {
    process.stdout.write(`\r\x1b[K${t.accent}${frames[index]}${t.reset} ${t.dim}${label}…${t.reset}`);
    index = (index + 1) % frames.length;
  }, 100);

  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    process.stdout.write('\r\x1b[K');
  };
}
