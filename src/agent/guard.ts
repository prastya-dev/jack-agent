import * as path from 'path';

// ============================================================
// JACK-AGENT — Klasifikasi izin perintah (PRD § 7.2, I-3)
// Satu-satunya jalur di mana jack bertindak tanpa bertanya,
// jadi setiap aturan di sini wajib punya test (PRD § 2.4.8).
// ============================================================

export type Verdict =
  | { action: 'auto' }
  | { action: 'confirm'; reason: string }
  | { action: 'block'; reason: string };

// ── Pola destruktif: ada di kode, bukan di config (PRD § 7.1) ──

const DANGEROUS: RegExp[] = [
  /\brm\s+(-[a-z]+\s+)*-?[a-z]*[rf][a-z]*\s+(\/|~)(\s|\*|$)/i,   // rm -rf / | rm -rf ~
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+[^|;]*\bif=/i,
  />\s*\/dev\/(sd|hd|nvme|mmcblk|disk|vd)/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/[sqf]/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /:\s*\(\s*\)\s*\{[\s\S]*\};\s*:/,                                // fork bomb
  /:\s*\(\s*\)\s*\{/,                                              // fork bomb varian bebas
];

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS.some(pattern => pattern.test(command));
}

// ── Allowlist read-only ────────────────────────────────────

/** Entri dengan spasi = program + argumen wajib (persis di awal segmen). */
export const READ_ONLY_ALLOWLIST: string[] = [
  'ls', 'dir', 'pwd', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'fd',
  'file', 'stat', 'tree', 'du', 'df', 'which', 'whereis', 'type', 'echo', 'printf',
  'date', 'uname', 'whoami', 'id', 'ps', 'node -v', 'python --version',
  'python3 --version', 'go version', 'git status', 'git diff', 'git log', 'git show',
  'git branch', 'git rev-parse', 'git ls-files', 'git blame', 'git shortlog',
  'git describe', 'git remote -v', 'git stash list',
];

/** Program yang tidak pernah auto, sekalipun ditambahkan lewat /allow. */
const NEVER_AUTO = new Set([
  'jack', 'sudo', 'doas', 'xargs', 'tee', 'env', 'eval', 'exec', 'source',
  'curl', 'wget', 'nc', 'netcat', 'ssh', 'scp', 'rsync', 'sh', 'bash', 'zsh',
  'fish', 'powershell', 'pwsh', 'cmd', 'npm', 'npx', 'pnpm', 'yarn', 'pip',
  'pip3', 'gem', 'cargo', 'make', 'docker', 'kubectl', 'systemctl', 'service',
  'mount', 'umount', 'kill', 'pkill', 'killall', 'chmod', 'chown', 'mv', 'rm',
  'cp', 'dd', 'truncate', 'ln', 'touch', 'mkdir', 'rmdir', 'sed', 'awk', 'perl',
]);

/** Redirection dan substitusi: apa pun bisa terjadi di baliknya. */
const UNSAFE_SYNTAX = /(^|[^0-9&])>{1,2}|&>|\$\(|`/;

const DESTRUCTIVE_OPTIONS = new Set(['-delete', '-exec', '-i', '--in-place', '--output']);

/** Pisahkan perintah pada ; && || | dan baris baru (PRD § 7.2 butir 1). */
export function splitSegments(command: string): string[] {
  return command.split(/\|\||&&|;|\||\n/).map(s => s.trim()).filter(Boolean);
}

function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(segment)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function programOf(token: string): string {
  return path.basename(token).replace(/\.exe$/i, '').toLowerCase();
}

function hasDestructiveOption(tokens: string[]): boolean {
  return tokens.some(t => DESTRUCTIVE_OPTIONS.has(t.toLowerCase()) || t.toLowerCase().startsWith('-exec'));
}

function startsWithTokens(tokens: string[], prefix: string[]): boolean {
  return prefix.length <= tokens.length && prefix.every((part, i) => tokens[i] === part);
}

function entryTokens(entry: string): string[] {
  return entry.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function segmentIsReadOnly(segment: string, entries: string[][], explicit: string[][]): boolean {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return true;
  if (hasDestructiveOption(tokens)) return false;

  const lower = tokens.map(t => t.toLowerCase());

  // Entri multi-kata dari user ("docker ps") dihormati lebih dulu.
  if (explicit.some(prefix => startsWithTokens(lower, prefix))) return true;

  const program = programOf(tokens[0]);
  if (NEVER_AUTO.has(program)) return false;

  return entries.some(prefix => prefix.length === 1
    ? prefix[0] === program
    : startsWithTokens(lower, prefix));
}

export interface ClassifyOptions {
  /** agent.auto_enabled; false = semuanya konfirmasi */
  autoEnabled?: boolean;
  /** agent.auto_allow (tambahan user) */
  allow?: string[];
}

export function classify(command: string, opts: ClassifyOptions = {}): Verdict {
  const { autoEnabled = true, allow = [] } = opts;
  const trimmed = command.trim();

  if (!trimmed) return { action: 'confirm', reason: 'perintah kosong' };

  if (isDangerousCommand(trimmed)) {
    return {
      action: 'block',
      reason: 'perintah destruktif — jalankan sendiri di luar jack bila memang perlu',
    };
  }

  if (!autoEnabled) {
    return { action: 'confirm', reason: 'auto-allow dimatikan (agent.auto_enabled=false)' };
  }

  if (UNSAFE_SYNTAX.test(trimmed)) {
    return { action: 'confirm', reason: 'memakai redirection/substitusi' };
  }

  const explicit = allow.map(entryTokens).filter(parts => parts.length > 1);
  const entries = [...READ_ONLY_ALLOWLIST, ...allow].map(entryTokens).filter(parts => parts.length > 0);

  for (const segment of splitSegments(trimmed)) {
    if (!segmentIsReadOnly(segment, entries, explicit)) {
      return { action: 'confirm', reason: `"${segment}" tidak ada di allowlist read-only` };
    }
  }
  return { action: 'auto' };
}

/** Ringkasan allowlist aktif untuk prompt (nama program saja, PRD § 5). */
export function allowSummary(allow: string[]): string {
  const names = new Set<string>();
  for (const entry of READ_ONLY_ALLOWLIST) names.add(entry);
  for (const entry of allow) if (entry.trim()) names.add(entry.trim());
  return [...names].join(', ');
}
