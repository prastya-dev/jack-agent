import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { getConfigDir } from '../core/config';
import { SKILL_FILE_NAME, SKILL_MAX_BYTES, MAX_SKILLS } from '../core/constants';

// ============================================================
// JACK-AGENT — Penyimpanan skill (PRD § 3.7)
// Skill = teks markdown. Tidak pernah dieksekusi (I-10).
// ============================================================

export interface Skill {
  name: string;
  description: string;
  body: string;
  path: string;
  size: number;
  /** waktu ubah SKILL.md — dipakai sebagai "terakhir dipakai" untuk urutan index */
  mtime: number;
}

export type SkillRead = { ok: true; skill: Skill } | { ok: false; error: string };

export function skillsDir(): string {
  return path.join(getConfigDir(), 'skills');
}

function parseFrontmatter(text: string): { name: string; description: string; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return null;

  let name = '';
  let description = '';
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^(name|description)\s*:\s*(.+)$/.exec(line.trim());
    if (!kv) continue;
    const value = kv[2].trim().replace(/^["']|["']$/g, '');
    if (kv[1] === 'name') name = value;
    else description = value;
  }
  return { name, description, body: match[2].trim() };
}

const NAME_PATTERN = /^[a-z0-9-]{1,32}$/;

/** Baca + validasi satu folder skill. `expectedDirName` = nama folder (wajib cocok). */
export function readSkillDir(dir: string, expectedDirName?: string): SkillRead {
  const file = path.join(dir, SKILL_FILE_NAME);
  if (!fs.existsSync(file)) return { ok: false, error: `${SKILL_FILE_NAME} tidak ditemukan` };

  const size = fs.statSync(file).size;
  const parsed = parseFrontmatter(fs.readFileSync(file, 'utf-8'));
  if (!parsed) return { ok: false, error: 'frontmatter (---) tidak ada atau rusak' };
  if (!NAME_PATTERN.test(parsed.name)) {
    return { ok: false, error: `name "${parsed.name}" tidak valid (harus ^[a-z0-9-]{1,32}$)` };
  }
  if (expectedDirName && parsed.name !== expectedDirName) {
    return { ok: false, error: `name "${parsed.name}" tidak sama dengan nama folder "${expectedDirName}"` };
  }
  if (!parsed.description) return { ok: false, error: 'description tidak ada' };
  if (parsed.description.length > 200) return { ok: false, error: 'description lebih dari 200 karakter' };

  return {
    ok: true,
    skill: {
      name: parsed.name,
      description: parsed.description,
      body: parsed.body,
      path: file,
      size,
      mtime: fs.statSync(file).mtimeMs,
    },
  };
}

/** Semua skill valid di disk, terbaru dipakai lebih dulu. */
export function listSkills(): Skill[] {
  const dir = skillsDir();
  if (!fs.existsSync(dir)) return [];

  const skills: Skill[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const read = readSkillDir(path.join(dir, entry.name), entry.name);
    if (read.ok) skills.push(read.skill);
  }
  return skills.sort((a, b) => b.mtime - a.mtime);
}

export function findSkill(name: string): Skill | null {
  return listSkills().find(s => s.name === name) ?? null;
}

/** Muat isi skill; null bila tidak ada. */
export function loadSkillBody(name: string): string | null {
  const skill = findSkill(name);
  return skill ? skill.body : null;
}

export interface AddResult {
  ok: boolean;
  name?: string;
  error?: string;
  warning?: string;
}

function isGitUrl(source: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/)/.test(source) || source.endsWith('.git');
}

/**
 * Pasang skill dari git-url atau folder lokal. Skill yang gagal validasi
 * tidak dipasang sama sekali (PRD § 3.7).
 */
export function addSkill(source: string): AddResult {
  const dir = skillsDir();
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
  if (existing >= MAX_SKILLS) {
    return { ok: false, error: `sudah ada ${existing} skill (batas ${MAX_SKILLS}) — hapus dulu` };
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmp = path.join(dir, `.tmp-${process.pid}`);

  try {
    if (isGitUrl(source)) {
      // shortcut: git clone di jalur CLI admin (bukan tool agent) — I-9 menyasar perintah yang diminta model
      try {
        execFileSync('git', ['clone', '--depth', '1', source, tmp], { stdio: 'ignore', timeout: 120000 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `git clone gagal (${msg}) — pastikan "git" terpasang dan URL benar` };
      }
    } else {
      if (!fs.existsSync(source)) return { ok: false, error: `sumber tidak ditemukan: ${source}` };
      if (!fs.existsSync(path.join(source, SKILL_FILE_NAME))) {
        return { ok: false, error: `${SKILL_FILE_NAME} tidak ada di ${source}` };
      }
      fs.cpSync(source, tmp, { recursive: true });
    }

    const read = readSkillDir(tmp);
    if (!read.ok) return { ok: false, error: read.error };

    const target = path.join(dir, read.skill.name);
    if (fs.existsSync(target)) return { ok: false, error: `skill "${read.skill.name}" sudah terpasang` };
    fs.renameSync(tmp, target);

    return {
      ok: true,
      name: read.skill.name,
      warning: read.skill.size > SKILL_MAX_BYTES
        ? `ukuran ${SKILL_FILE_NAME} ${(read.skill.size / 1024).toFixed(1)} KB (disarankan ≤ 8 KB)`
        : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function removeSkill(name: string): boolean {
  const target = path.join(skillsDir(), name);
  if (!fs.existsSync(target)) return false;
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}
