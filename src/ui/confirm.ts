import * as readline from 'readline';
import { getTheme } from './theme';

// ============================================================
// JACK-AGENT — Dialog konfirmasi perintah
// Non-TTY selalu MENOLAK (O-01, I-3) — tidak pernah menggantung.
// ============================================================

/** True kalau terminal bisa masuk raw mode. */
export function canRaw(): boolean {
  return Boolean(process.stdin.isTTY) && typeof process.stdin.setRawMode === 'function';
}

function printCommand(command: string): void {
  const t = getTheme();
  const lines = command.split('\n');
  let display = command;
  if (lines.length > 5) {
    display = lines.slice(0, 4).join('\n') + `\n  ... (terpotong, total ${lines.length} baris)`;
  } else if (display.length > 300) {
    display = display.slice(0, 300) + `\n  ... (terpotong, total ${command.length} karakter)`;
  }
  process.stdout.write(`\n${t.dim}Perintah dari model:${t.reset}\n${t.accent}  $ ${t.text}${display}${t.reset}\n`);
}

export function showConfirmDialog(command: string): Promise<boolean> {
  printCommand(command);

  if (!canRaw()) {
    process.stdout.write(`${getTheme().warn}  ⚠ konfirmasi tidak tersedia di sesi non-interaktif — perintah TIDAK dijalankan${getTheme().reset}\n`);
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const t = getTheme();
    let selected = 0;

    function render(): void {
      const yes = selected === 0 ? `${t.accentBg}\x1b[30m [ Ya ] ${t.reset}` : `${t.dim} [ Ya ] ${t.reset}`;
      const no = selected === 1 ? `${t.accentBg}\x1b[30m Tidak ${t.reset}` : `${t.dim} Tidak ${t.reset}`;
      process.stdout.write(`\r\x1b[K${t.accent}[?]${t.reset} ${t.text}Jalankan perintah di atas?${t.reset}  >  ${yes}   ${no}`);
    }

    function cleanup(): void {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    function onData(chunk: string): void {
      // Terminal mengirim satu potongan per keypress, tetapi paste/tombol panah
      // bisa datang sekaligus beberapa karakter — proses berurutan, bukan seluruh chunk.
      for (let i = 0; i < chunk.length; i++) {
        if (chunk.startsWith('\x1b[D', i) || chunk.startsWith('\x1b[C', i) || chunk[i] === 'h' || chunk[i] === 'l') {
          selected = selected === 0 ? 1 : 0;
          render();
          if (chunk[i] === '\x1b') i += 2;
        } else if (chunk[i] === '\r' || chunk[i] === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(selected === 0);
          return;
        } else if (chunk[i] === '\x03') {
          cleanup();
          process.stdout.write('\n');
          resolve(false);
          return;
        }
      }
    }

    render();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  });
}

/** Pertanyaan ya/tidak; non-TTY menjawab "tidak" (tidak pernah menebak "ya"). */
export function askUser(question: string): Promise<boolean> {
  const t = getTheme();
  if (!process.stdin.isTTY) {
    process.stdout.write(`${t.dim}  [?] ${question} → tidak (sesi non-interaktif)${t.reset}\n`);
    return Promise.resolve(false);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${t.accent}[?]${t.reset} ${question} `, (answer) => {
      rl.close();
      resolve(/^y/i.test(answer.trim()));
    });
  });
}
