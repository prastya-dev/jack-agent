import { getTheme } from './theme';
import { APP_VERSION } from '../core/constants';
import { stateSnapshot } from './statusbar';

// ============================================================
// JACK-AGENT — Banner & status
// ============================================================

const ASCII_BANNER = `
 ┏┓┏━┓┏━╸╻┏    ┏━┓┏━╸┏━╸┏┓╻╺┳╸
  ┃┣━┫┃  ┣┻┓   ┣━┫┃╺┓┣╸ ┃┗┫ ┃ 
┗━┛╹ ╹┗━╸╹ ╹   ╹ ╹┗━┛┗━╸╹ ╹ ╹ 
                  AI CLI [ v${APP_VERSION} ]
`;

export function renderBanner(): void {
  const t = getTheme();
  const out = [''];
  for (const line of ASCII_BANNER.split('\n')) {
    if (line.trim() === '') continue;
    out.push(line.includes('AI CLI') ? `${t.dim}${line}${t.reset}` : `${t.accent}${line}${t.reset}`);
  }
  out.push(`${t.dim}  ${stateSnapshot()}${t.reset}`);
  out.push(`${t.dim}  Ketik /help untuk daftar perintah.${t.reset}`);
  out.push('');
  process.stdout.write(out.join('\n') + '\n');
}
