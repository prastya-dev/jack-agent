import { getTheme, separator } from './theme';

// ============================================================
// JACK-AGENT — ASCII Banner Renderer
import { APP_VERSION } from '../core/constants';

const ASCII_BANNER = `
 ┏┓┏━┓┏━╸╻┏    ┏━┓┏━╸┏━╸┏┓╻╺┳╸
  ┃┣━┫┃  ┣┻┓   ┣━┫┃╺┓┣╸ ┃┗┫ ┃ 
┗━┛╹ ╹┗━╸╹ ╹   ╹ ╹┗━┛┗━╸╹ ╹ ╹ 
                  AI CLI [ v${APP_VERSION} ]
                  https://jack-agent.dhyy.cloud
`;

/** Renders the full banner with current mode's accent colour */
export function renderBanner(): void {
  const t = getTheme();
  const out: string[] = [];

  out.push('');
  
  const lines = ASCII_BANNER.split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (line.includes('AI CLI')) {
       out.push(`${t.dim}${line}${t.reset}`);
    } else {
       out.push(`${t.accent}${line}${t.reset}`);
    }
  }

  out.push('');
  out.push(`${t.dim}  Ketik /help untuk memuat informasi${t.reset}`);
  out.push('');
  process.stdout.write(out.join('\n') + '\n');
}

/** Re-renders only the subtitle line (used when mode switches) */
export function renderModeChange(newMode: 'chat' | 'exec' | 'quiz'): void {
  const t = getTheme();
  const cols = process.stdout.columns || 80;
  const bar = `${t.separator}${'─'.repeat(cols)}${t.reset}`;
  let modeLabel = 'CHAT MODE';
  if (newMode === 'exec') modeLabel = 'EXEC MODE';
  if (newMode === 'quiz') modeLabel = 'QUIZ MODE';
  console.log(bar);
  console.log(`${t.accent}  ⟳  Mode switched to: ${t.bold}${modeLabel}${t.reset}`);
  console.log(bar);
}
