// ============================================================
// JACK-AGENT — Theme (satu warna aksen; mati otomatis di non-TTY)
// Jangan hardcode ANSI di modul UI baru — pakai getTheme() (PRD § 10.2)
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

const COLORS: ThemeColors = {
  accent:    '\x1b[38;2;0;212;255m',
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
};

const PLAIN: ThemeColors = Object.fromEntries(
  Object.keys(COLORS).map(key => [key, '']),
) as unknown as ThemeColors;

let enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

export function setColorMode(value: boolean): void {
  enabled = value;
}

export function colorsEnabled(): boolean {
  return enabled;
}

export function getTheme(): ThemeColors {
  return enabled ? COLORS : PLAIN;
}

/** Escape ANSI yang tidak lewat tema (dipakai wizard). */
export const A = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  cyan:  '\x1b[96m',
  blue:  '\x1b[94m',
  green: '\x1b[92m',
  red:   '\x1b[91m',
  white: '\x1b[97m',
  gray:  '\x1b[90m',
  up:    (n: number) => `\x1b[${n}A`,
  col:   (c: number) => `\x1b[${c}G`,
};
