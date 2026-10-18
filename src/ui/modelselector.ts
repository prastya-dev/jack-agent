import { getTheme } from './theme';

// ============================================================
// JACK-AGENT — Model Selector Modal
// Arrow key (↑/↓) navigation + Enter to select, Esc to cancel
// ============================================================

export function showModelSelector(models: string[], currentModel: string): Promise<string | null> {
  return new Promise((resolve) => {
    const t = getTheme();
    const cols = process.stdout.columns || 80;
    const sep = `${t.separator}${'─'.repeat(cols)}${t.reset}`;

    let selectedIdx = Math.max(0, models.indexOf(currentModel));
    const listLen = models.length;

    function renderList() {
      const readline = require('readline');
      
      // Move cursor up and clear down to prevent flickering/leftover text
      if (rendered) {
        readline.moveCursor(process.stdout, 0, -(listLen + 4));
        readline.clearScreenDown(process.stdout);
      }

      process.stdout.write(sep + '\n');
      process.stdout.write(
        `${t.accent}  Model Selector${t.reset}  ${t.dim}(↑/↓ pilih, Enter konfirmasi, Esc batalkan)${t.reset}\n`
      );
      process.stdout.write(sep + '\n');

      models.forEach((m, i) => {
        const isSelected = i === selectedIdx;
        const cursor = isSelected ? `${t.accent}▶${t.reset}` : ' ';
        const label  = isSelected
          ? `${t.accentBg}\x1b[30m ${m} ${t.reset}`
          : `  ${t.dim}${m}${t.reset}`;
        process.stdout.write(`  ${cursor} ${label}\n`);
      });

      process.stdout.write(sep + '\n');
    }

    let rendered = false;
    renderList();
    rendered = true;

    // Raw mode for keyboard capture
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function onData(key: string) {
      if (key === '\x1b[A' || key === 'k') {
        // Up arrow / vim k
        selectedIdx = (selectedIdx - 1 + listLen) % listLen;
        renderList();
      } else if (key === '\x1b[B' || key === 'j') {
        // Down arrow / vim j
        selectedIdx = (selectedIdx + 1) % listLen;
        renderList();
      } else if (key === '\r' || key === '\n') {
        // Enter
        cleanup();
        resolve(models[selectedIdx]);
      } else if (key === '\x1b' || key === 'q') {
        // Esc / q — cancel
        cleanup();
        resolve(null);
      } else if (key === '\x03') {
        // Ctrl+C
        cleanup();
        resolve(null);
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
