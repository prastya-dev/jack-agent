// ============================================================
// JACK-AGENT — Theme Manager
// ANSI colour switching: chat = cyan, exec = red, quiz = gold
// ============================================================

export interface ThemeColors {
  accent: string;
  accentDim: string;
  accentBg: string;
  userLabel: string;
  botLabel: string;
  error: string;
  warn: string;
  info: string;
  dim: string;
  text: string;
  separator: string;
  bold: string;
  reset: string;
}

export const A = {
  reset:      '\x1b[0m',
  bold:       '\x1b[1m',
  dim:        '\x1b[2m',
  cyan:       '\x1b[96m',
  blue:       '\x1b[94m',
  green:      '\x1b[92m',
  red:        '\x1b[91m',
  white:      '\x1b[97m',
  gray:       '\x1b[90m',
  saveCursor: '\x1b7',
  restCursor: '\x1b8',
  up: (n: number) => `\x1b[${n}A`,
  col: (c: number) => `\x1b[${c}G`,
  clearLine:  '\x1b[2K',
};

const themes: Record<'chat' | 'exec' | 'quiz', ThemeColors> = {
  chat: {
    accent:    '\x1b[38;2;0;212;255m', // Cyan
    accentDim: '\x1b[38;2;0;106;128m',
    accentBg:  '\x1b[48;2;0;106;128m',
    userLabel: '\x1b[38;2;120;140;160m',
    botLabel:  '\x1b[38;2;0;212;255m',
    error:     '\x1b[38;2;255;70;70m',
    warn:      '\x1b[38;2;255;170;0m',
    info:      '\x1b[38;2;100;255;100m',
    dim:       '\x1b[38;2;120;140;160m',
    text:      '\x1b[38;2;220;230;240m',
    separator: '\x1b[38;2;30;50;70m',
    bold:      '\x1b[1m',
    reset:     '\x1b[0m',
  },
  exec: {
    accent:    '\x1b[38;2;255;70;70m', // Red
    accentDim: '\x1b[38;2;128;35;35m',
    accentBg:  '\x1b[48;2;128;35;35m',
    userLabel: '\x1b[38;2;160;120;120m',
    botLabel:  '\x1b[38;2;255;70;70m',
    error:     '\x1b[38;2;255;70;70m',
    warn:      '\x1b[38;2;255;170;0m',
    info:      '\x1b[38;2;100;255;100m',
    dim:       '\x1b[38;2;160;120;120m',
    text:      '\x1b[97m',
    separator: '\x1b[38;2;70;30;30m',
    bold:      '\x1b[1m',
    reset:     '\x1b[0m',
  },
  quiz: {
    accent:    '\x1b[38;2;100;255;100m', // Green
    accentDim: '\x1b[38;2;50;128;50m',
    accentBg:  '\x1b[48;2;50;128;50m',
    userLabel: '\x1b[38;2;140;180;140m',
    botLabel:  '\x1b[38;2;100;255;100m',
    error:     '\x1b[38;2;255;70;70m',
    warn:      '\x1b[38;2;255;170;0m',
    info:      '\x1b[38;2;100;255;100m',
    dim:       '\x1b[38;2;160;160;120m',
    text:      '\x1b[97m',
    separator: '\x1b[38;2;70;70;30m',
    bold:      '\x1b[1m',
    reset:     '\x1b[0m',
  }
};

let currentTheme = themes.chat;

export function applyTheme(mode: 'chat' | 'exec' | 'quiz'): void {
  currentTheme = themes[mode];
}

export function getTheme(): ThemeColors {
  return currentTheme;
}

export const separator = (length = 80): string => {
  return `${currentTheme.separator}${'─'.repeat(length)}${currentTheme.reset}`;
};
