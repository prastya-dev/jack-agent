import { runCommand } from '../exec/runner';
import { classify } from './guard';
import { truncateOutput } from './output';
import { loadSkillBody } from '../skills';
import { getState, updateState } from '../core/state';
import type { JackConfig } from '../core/config';
import type { ToolCall, ToolSpec } from '../providers/types';
import { getTheme } from '../ui/theme';

// ============================================================
// JACK-AGENT — ToolRegistry: SATU-SATUNYA pintu eksekusi (I-9)
// ============================================================

export interface ToolRegistryDeps {
  cfg: JackConfig;
  /** izin tulis otomatis hanya di jalur one-shot (PRD § 7.2.1) */
  allowWrite: boolean;
  confirm: (command: string) => Promise<boolean>;
}

export interface ToolOutcome {
  text: string;
  ok: boolean;
}

const DISPLAY_LINES = 60;

export class ToolRegistry {
  private previous: { command: string; text: string } | null = null;

  constructor(private readonly deps: ToolRegistryDeps) {}

  specs(): ToolSpec[] {
    return [
      {
        name: 'run_command',
        description: 'Jalankan satu perintah shell di direktori kerja, kembalikan stdout/stderr dan exit code.',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string', description: 'satu perintah shell' } },
          required: ['command'],
        },
      },
      {
        name: 'use_skill',
        description: 'Muat isi satu skill (berkas markdown) ke konteks supaya instruksinya bisa dipakai.',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string', description: 'nama skill' } },
          required: ['name'],
        },
      },
    ];
  }

  async run(call: ToolCall): Promise<ToolOutcome> {
    if (call.name === 'run_command') return this.runCommand(call);
    if (call.name === 'use_skill') return this.useSkill(call);
    return { text: `tool "${call.name}" tidak dikenal. Tool yang tersedia: run_command, use_skill.`, ok: false };
  }

  private async runCommand(call: ToolCall): Promise<ToolOutcome> {
    const t = getTheme();
    const command = typeof call.args.command === 'string' ? call.args.command.trim() : '';
    if (!command) return { text: 'run_command butuh argumen "command".', ok: false };

    // Anti-boros: perintah identik tidak dijalankan dua kali (PRD § 3.6)
    if (this.previous && this.previous.command === command) {
      process.stdout.write(`${t.dim}  ↺ perintah sama seperti sebelumnya — hasil lama dipakai${t.reset}\n`);
      return { text: this.previous.text, ok: false };
    }

    const verdict = classify(command, { autoEnabled: this.deps.cfg.agent.auto_enabled, allow: this.deps.cfg.agent.auto_allow });

    if (verdict.action === 'block') {
      process.stdout.write(`${t.error}  ✗ diblok: ${command}${t.reset}\n`);
      return {
        text: `DIBLOK: ${verdict.reason}. Jangan ulangi perintah ini; minta pengguna menjalankannya sendiri.`,
        ok: false,
      };
    }

    if (verdict.action === 'confirm') {
      if (this.deps.allowWrite) {
        process.stdout.write(`${t.warn}  ⚠ --allow-write: dijalankan tanpa konfirmasi (${verdict.reason})${t.reset}\n`);
      } else {
        const approved = await this.deps.confirm(command);
        if (!approved) {
          return {
            text: 'DIBATALKAN: pengguna tidak menyetujui (atau sesi non-interaktif sehingga konfirmasi tidak tersedia). Minta pengguna menjalankannya manual, atau pakai perintah read-only yang ada di allowlist.',
            ok: false,
          };
        }
      }
    }

    process.stdout.write(`${t.accent}  $ ${t.text}${command}${t.reset}\n`);

    const st = getState();
    const raw = await runCommand(command, st.currentDir);
    const text = truncateOutput(raw, {
      maxLines: this.deps.cfg.tokens.max_output_lines,
      maxChars: this.deps.cfg.tokens.max_output_chars,
    });

    this.previous = { command, text };
    this.printPreview(text);
    return { text, ok: raw.exitCode === 0 };
  }

  private useSkill(call: ToolCall): ToolOutcome {
    const t = getTheme();
    const name = typeof call.args.name === 'string' ? call.args.name.trim() : '';
    if (!name) return { text: 'use_skill butuh argumen "name".', ok: false };

    const body = loadSkillBody(name);
    if (body === null) {
      return { text: `skill "${name}" tidak ditemukan. Lihat daftar di blok SKILL prompt.`, ok: false };
    }

    const st = getState();
    if (st.skillLoaded.includes(name)) {
      return { text: `isi skill "${name}" sudah dimuat sebelumnya di sesi ini — pakai yang sudah ada di konteks.`, ok: true };
    }
    updateState({ skillLoaded: [...st.skillLoaded, name] });
    process.stdout.write(`${t.info}  ⤓ skill dimuat: ${name}${t.reset}\n`);
    // PRD § 3.5: isi skill menjadi pesan sistem tambahan pada permintaan berikutnya.
    return { text: `isi skill "${name}" dimuat ke blok SKILL DIMUAT pada system prompt.`, ok: true };
  }

  private printPreview(text: string): void {
    const t = getTheme();
    const lines = text.split('\n');
    const body = lines.length > DISPLAY_LINES
      ? [...lines.slice(0, DISPLAY_LINES), `${t.dim}  … (${lines.length - DISPLAY_LINES} baris lagi dipotong dari tampilan)${t.reset}`]
      : lines;
    process.stdout.write(body.map(l => `  ${l}`).join('\n') + '\n');
  }
}
