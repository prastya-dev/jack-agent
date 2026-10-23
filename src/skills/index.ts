import { listSkills } from './store';
import { MAX_SKILLS } from '../core/constants';

// ============================================================
// JACK-AGENT — Skill index untuk prompt (PRD § 3.7)
// Hanya name + description yang selalu ikut ke prompt.
// ============================================================

const MAX_DESCRIPTION = 120;

/** Daftar "name — description"; dipotong pada MAX_SKILLS (yang terbaru dulu). */
export function skillIndexLines(): string[] {
  const skills = listSkills();
  return skills.slice(0, MAX_SKILLS).map((s) => {
    const description = s.description.length > MAX_DESCRIPTION
      ? `${s.description.slice(0, MAX_DESCRIPTION - 1)}…`
      : s.description;
    return `${s.name} — ${description}`;
  });
}

export function skillIndexText(): string {
  const lines = skillIndexLines();
  if (lines.length === 0) return '(belum ada skill terpasang)';
  const total = listSkills().length;
  if (total > MAX_SKILLS) {
    return `${lines.join('\n')}\n(menampilkan ${MAX_SKILLS} dari ${total} skill — rapikan dengan "jack skill rm <nama>")`;
  }
  return lines.join('\n');
}

export { loadSkillBody, findSkill, listSkills, addSkill, removeSkill, skillsDir } from './store';
export type { Skill } from './store';
