import { patchConfig, readConfig } from '../core/config';
import { providerLabel, testProvider } from '../providers';
import { getTheme } from '../ui/theme';
import { addProviderWizard, prompt } from '../ui/wizard';

// ============================================================
// JACK-AGENT — CLI provider (PRD F3)
// ============================================================

function usage(): void {
  const t = getTheme();
  process.stdout.write(
    `\n${t.accent}jack provider${t.reset}\n` +
    `${t.dim}  list            daftar provider (aktif ditandai)\n` +
    `  use <nama>      jadikan provider aktif\n` +
    `  add             tambah provider (panduan)\n` +
    `  test [nama]     uji koneksi + daftar model\n` +
    `  rm <nama>       hapus provider${t.reset}\n\n`,
  );
}

function list(): void {
  const t = getTheme();
  const cfg = readConfig();
  process.stdout.write('\n');
  for (const provider of cfg.providers) {
    const active = provider.name === cfg.provider.active ? `${t.info}●${t.reset}` : ' ';
    const model = provider.default_model || '(model belum dipilih)';
    process.stdout.write(`  ${active} ${t.bold}${provider.name}${t.reset} ${t.dim}${providerLabel(provider)} · ${model}${t.reset}\n`);
  }
  if (cfg.provider.fallback.length) {
    process.stdout.write(`  ${t.dim}fallback: ${cfg.provider.fallback.join(' → ')}${t.reset}\n`);
  }
  process.stdout.write('\n');
}

function use(name?: string): void {
  const t = getTheme();
  if (!name) { usage(); return; }
  const cfg = readConfig();
  if (!cfg.providers.some(p => p.name === name)) {
    process.stdout.write(`\n${t.error}  ✗ provider "${name}" tidak ada${t.reset}\n\n`);
    return;
  }
  patchConfig((c) => { c.provider.active = name; });
  process.stdout.write(`\n${t.info}  ✓ provider aktif: ${name}${t.reset}\n\n`);
}

async function remove(name?: string): Promise<void> {
  const t = getTheme();
  if (!name) { usage(); return; }
  const cfg = readConfig();
  if (!cfg.providers.some(p => p.name === name)) {
    process.stdout.write(`\n${t.error}  ✗ provider "${name}" tidak ada${t.reset}\n\n`);
    return;
  }
  if (cfg.providers.length === 1) {
    process.stdout.write(`\n${t.warn}  ⚠ provider terakhir tidak bisa dihapus${t.reset}\n\n`);
    return;
  }
  if (process.stdin.isTTY) {
    const answer = await prompt(`Hapus provider "${name}"? (y/n)`, 'n');
    if (answer.toLowerCase() !== 'y') {
      process.stdout.write(`${t.dim}  dibatalkan${t.reset}\n\n`);
      return;
    }
  }
  patchConfig((c) => {
    c.providers = c.providers.filter(p => p.name !== name);
    c.provider.fallback = c.provider.fallback.filter(f => f !== name);
    if (c.provider.active === name) c.provider.active = c.providers[0].name;
  });
  process.stdout.write(`\n${t.info}  ✓ provider "${name}" dihapus${t.reset}\n\n`);
}

async function test(name?: string): Promise<void> {
  const t = getTheme();
  const cfg = readConfig();
  const provider = name ? cfg.providers.find(p => p.name === name) : cfg.providers.find(p => p.name === cfg.provider.active);
  if (!provider) {
    process.stdout.write(`\n${t.error}  ✗ provider "${name ?? cfg.provider.active}" tidak ada${t.reset}\n\n`);
    return;
  }

  process.stdout.write(`\n${t.dim}  menguji ${provider.name} (${providerLabel(provider)})...${t.reset}\n`);
  const result = await testProvider(provider);
  if (result.ok) {
    process.stdout.write(`${t.info}  ✓ ${result.message}${t.reset}\n`);
    if (result.models.length) {
      process.stdout.write(`${t.dim}  model: ${result.models.slice(0, 12).join(', ')}${result.models.length > 12 ? ` … (+${result.models.length - 12})` : ''}${t.reset}\n`);
    }
  } else {
    process.stdout.write(`${t.error}  ✗ ${result.message}${t.reset}\n`);
  }
  process.stdout.write('\n');
}

export async function runProviderCommand(args: string[]): Promise<void> {
  const sub = (args[0] ?? 'list').toLowerCase();
  switch (sub) {
    case 'list': list(); break;
    case 'use': use(args[1]); break;
    case 'rm':
    case 'remove': await remove(args[1]); break;
    case 'add': await addProviderWizard(readConfig()); break;
    case 'test': await test(args[1]); break;
    default: usage();
  }
}
