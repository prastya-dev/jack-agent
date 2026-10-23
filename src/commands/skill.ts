import { addSkill, listSkills, removeSkill, skillsDir } from '../skills';
import { getTheme } from '../ui/theme';
import { prompt } from '../ui/wizard';

// ============================================================
// JACK-AGENT — CLI skill (PRD § 3.7, F14)
// ============================================================

function usage(): void {
  const t = getTheme();
  process.stdout.write(
    `\n${t.accent}jack skill${t.reset}\n` +
    `${t.dim}  list          daftar skill terpasang\n` +
    `  add <url|dir>  pasang skill dari git atau folder lokal\n` +
    `  rm <nama>     hapus satu skill${t.reset}\n\n`,
  );
}

function list(): void {
  const t = getTheme();
  const skills = listSkills();
  process.stdout.write('\n');
  if (!skills.length) {
    process.stdout.write(`  ${t.dim}belum ada skill. Pasang dengan: jack skill add <url|dir>${t.reset}\n\n`);
    return;
  }
  for (const skill of skills) {
    const description = skill.description.length > 60 ? `${skill.description.slice(0, 59)}…` : skill.description;
    process.stdout.write(`  ${t.bold}${skill.name}${t.reset} ${t.dim}${(skill.size / 1024).toFixed(1)} KB · ${description}${t.reset}\n`);
  }
  process.stdout.write(`  ${t.dim}lokasi: ${skillsDir()}${t.reset}\n\n`);
}

async function add(source?: string): Promise<void> {
  const t = getTheme();
  if (!source) { usage(); return; }

  const result = addSkill(source);
  if (!result.ok) {
    process.stdout.write(`\n${t.error}  ✗ ${result.error}${t.reset}\n\n`);
    return;
  }
  process.stdout.write(`\n${t.info}  ✓ skill "${result.name}" terpasang${t.reset}\n`);
  if (result.warning) process.stdout.write(`${t.warn}  ⚠ ${result.warning}${t.reset}\n`);
  process.stdout.write(`${t.dim}  pakai lewat /skill ${result.name} di sesi, atau biarkan model memanggil use_skill${t.reset}\n\n`);
}

async function remove(name?: string): Promise<void> {
  const t = getTheme();
  if (!name) { usage(); return; }
  if (process.stdin.isTTY) {
    const answer = await prompt(`Hapus skill "${name}"? (y/n)`, 'n');
    if (answer.toLowerCase() !== 'y') {
      process.stdout.write(`${t.dim}  dibatalkan${t.reset}\n\n`);
      return;
    }
  }
  if (!removeSkill(name)) {
    process.stdout.write(`\n${t.error}  ✗ skill "${name}" tidak ada${t.reset}\n\n`);
    return;
  }
  process.stdout.write(`\n${t.info}  ✓ skill "${name}" dihapus${t.reset}\n\n`);
}

export async function runSkillCommand(args: string[]): Promise<void> {
  const sub = (args[0] ?? 'list').toLowerCase();
  switch (sub) {
    case 'list': list(); break;
    case 'add': await add(args[1]); break;
    case 'rm':
    case 'remove': await remove(args[1]); break;
    default: usage();
  }
}
