import { getTheme } from './theme';

// ============================================================
// JACK-AGENT — Confirmation Dialog
// Renders:  [?] Jalankan perintah di atas? > [ Ya ]   Tidak
// Uses raw terminal mode for ← / → key navigation
// ============================================================

export function showConfirmDialog(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const t = getTheme();

    let selected = 0; // 0 = Ya, 1 = Tidak

    function render() {
      const yaLabel  = selected === 0
        ? `${t.accentBg}\x1b[30m [ Ya ] ${t.reset}`
        : `${t.dim} [ Ya ] ${t.reset}`;
      const tidakLabel = selected === 1
        ? `${t.accentBg}\x1b[30m Tidak ${t.reset}`
        : `${t.dim} Tidak ${t.reset}`;

      // Clear line and rewrite
      process.stdout.write('\r\x1b[K');
      process.stdout.write(
        `${t.accent}[?]${t.reset} ${t.text}Jalankan perintah di atas?${t.reset}  >  ${yaLabel}   ${tidakLabel}`
      );
    }

    // Print the detected command block first
    console.log(`\n${t.dim}Perintah terdeteksi:${t.reset}`);
    let displayCommand = command;
    const lines = command.split('\n');
    if (lines.length > 5) {
       displayCommand = lines.slice(0, 4).join('\n') + `\n  ... (terpotong, total ${lines.length} baris)`;
    } else if (displayCommand.length > 300) {
       displayCommand = displayCommand.substring(0, 300) + `\n  ... (terpotong, total ${command.length} karakter)`;
    }
    console.log(`${t.accent}  $ ${t.text}${displayCommand}${t.reset}\n`);

    // Initial render
    render();

    // Enable raw mode
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function onData(key: string) {
      if (key === '\x1b[D' || key === '\x1b[C' || key === 'h' || key === 'l') {
        // Left / Right arrow or h/l vim keys
        selected = selected === 0 ? 1 : 0;
        render();
      } else if (key === '\r' || key === '\n') {
        // Enter — confirm selection
        cleanup();
        process.stdout.write('\n');
        resolve(selected === 0);
      } else if (key === '\x03') {
        // Ctrl+C
        cleanup();
        process.stdout.write('\n');
        resolve(false);
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    }

    process.stdin.on('data', onData);
  });
}
