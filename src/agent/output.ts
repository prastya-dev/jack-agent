// ============================================================
// JACK-AGENT — Pemotongan output perintah (PRD § 3.8, I-11)
// Penghemat token terbesar: tidak ada output mentah tak terbatas
// yang dikirim balik ke model.
// ============================================================

export interface RawOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
  overflowed?: boolean;
}

export interface OutputLimits {
  maxLines: number;
  maxChars: number;
}

const HARD_LINE_LIMIT = 5000;

/** Buang escape ANSI, `\r` (progress bar), NUL; normalisasi CRLF. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x00/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function marker(text: string, lineCount: number): string {
  const kb = (text.length / 1024).toFixed(1);
  return `… [dipotong: ${lineCount} baris, ${kb} KB — persempit dengan grep/head]`;
}

function limitBlock(label: string, text: string, limits: OutputLimits, out: string[]): void {
  if (!text) return;
  const lines = text.split('\n');
  const tooManyLines = lines.length > limits.maxLines;
  const tooManyChars = text.length > limits.maxChars;

  if (!tooManyLines && !tooManyChars) {
    out.push(`${label}:`, text);
    return;
  }

  if (lines.length > HARD_LINE_LIMIT) {
    out.push(label + ':', lines.slice(0, limits.maxLines).join('\n'), marker(text, lines.length));
    return;
  }

  const head = Math.ceil(limits.maxLines / 2);
  const tail = limits.maxLines - head;
  const preview = [lines.slice(0, head).join('\n'), marker(text, lines.length), lines.slice(-tail).join('\n')];

  if (tooManyChars) {
    // Satu baris raksasa: potong juga berdasarkan karakter.
    const joined = preview.join('\n');
    if (joined.length > limits.maxChars) {
      const half = Math.floor(limits.maxChars / 2);
      out.push(label + ':', joined.slice(0, half), marker(text, lines.length), joined.slice(-half));
      return;
    }
  }
  out.push(label + ':', ...preview);
}

/** Format hasil perintah untuk dikirim ke model (selalu ada exit code). */
export function truncateOutput(raw: RawOutput, limits: OutputLimits): string {
  const out: string[] = [];
  const status = [`exit code: ${raw.exitCode}`];
  if (raw.timedOut) status.push('(timeout — perintah dihentikan paksa)');
  out.push(status.join(' '));
  if (raw.overflowed) out.push('catatan: output melebihi buffer 10 MB, sisanya dibuang');

  limitBlock('stdout', cleanText(raw.stdout), limits, out);
  limitBlock('stderr', cleanText(raw.stderr), limits, out);
  if (out.length === 1) out.push('(tidak ada output)');

  const result = out.join('\n');
  return result.length > limits.maxChars * 2 + 200 ? result.slice(0, limits.maxChars * 2 + 200) : result;
}
