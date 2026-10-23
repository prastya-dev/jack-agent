import { readConfig, providerChain, type JackConfig } from '../core/config';
import { getState, updateState, addMessage, replaceHistory } from '../core/state';
import { loadSkillBody } from '../skills';
import { createProvider, resolveModel } from '../providers';
import { ProviderError } from '../providers/types';
import type { ChatRequest, ChatResult, Message, Provider } from '../providers/types';
import { buildSystemPrompt, collectContext } from './prompt';
import { ToolRegistry } from './tool';
import { showConfirmDialog, askUser } from '../ui/confirm';
import { createStreamPrinter, startSpinner } from '../ui/stream';
import { renderStatusBar } from '../ui/statusbar';
import { getTheme } from '../ui/theme';
import { DEFAULT_CONTEXT_TOKENS } from '../core/constants';

// ============================================================
// JACK-AGENT — Siklus agentik (PRD § 3.2, § 3.6, § 6)
// ============================================================

export interface RunOptions {
  /** hanya dari flag one-shot `--allow-write` (PRD § 7.2.1) */
  allowWrite?: boolean;
}

/** Estimasi kasar karakter/4 (tanpa tokenizer, I-1). */
export function estimateTokens(input: string | Message[]): number {
  const chars = typeof input === 'string'
    ? input.length
    : input.reduce((sum, m) => sum + m.content.length + 8, 0);
  return Math.round(chars / 4);
}

function toMessages(history: readonly Message[]): Message[] {
  return history.map(m => ({
    role: m.role,
    content: m.content,
    ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
    ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}),
  }));
}

/** Kirim satu permintaan dengan fallback antar-provider (PRD F6 tingkat 2). */
async function send(cfg: JackConfig, req: ChatRequest): Promise<ChatResult> {
  const chain = providerChain(cfg);
  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const providerConfig = chain[i];
    const model = resolveModel(providerConfig, getState().model);
    try {
      const provider: Provider = createProvider(providerConfig);
      const result = await provider.chat({ ...req, model });
      if (i > 0) {
        const reason = lastError instanceof Error ? lastError.message : String(lastError);
        process.stdout.write(`${getTheme().warn}  ↪ beralih ke provider ${providerConfig.name} karena ${reason}${getTheme().reset}\n`);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (!(err instanceof ProviderError) || !err.retryable) throw err;
    }
  }
  throw lastError;
}

/** Ringkas riwayat bila mendekati batas konteks (PRD § 3.8 butir 2). */
async function maybeCompact(cfg: JackConfig): Promise<void> {
  const history = getState().history;
  if (history.length < 4) return;

  const limit = DEFAULT_CONTEXT_TOKENS * (cfg.tokens.compact_at_percent / 100);
  if (estimateTokens(toMessages(history)) < limit) return;

  process.stdout.write(`${getTheme().dim}  ↻ riwayat mendekati batas konteks — meringkas...${getTheme().reset}\n`);
  await compactHistory();
}

/** `/compact`: ringkasan ≤ 20 baris menggantikan riwayat. Gagal → riwayat utuh (I-12). */
export async function compactHistory(): Promise<boolean> {
  const t = getTheme();
  const cfg = readConfig();
  const history = getState().history;
  if (history.length === 0) {
    process.stdout.write(`${t.dim}  riwayat kosong — tidak ada yang diringkas${t.reset}\n`);
    return false;
  }

  const transcript = history
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')
    .slice(-24000);

  const instruction = 'Ringkas riwayat kerja berikut menjadi maksimal 20 baris berisi: tujuan, keputusan yang diambil, berkas yang diubah, status saat ini, dan langkah berikutnya. Jangan memanggil tool.';

  let summary = '';
  try {
    const result = await send(cfg, {
      system: 'Kamu perangkum riwayat kerja sebuah agent CLI. Balas hanya ringkasannya.',
      messages: [
        { role: 'user', content: `${instruction}\n\n--- RIWAYAT ---\n${transcript}` },
      ],
      tools: [],
      stream: false,
    });
    summary = (result.text || '').trim();
    if (!summary) throw new Error('ringkasan kosong');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`${t.warn}  ⚠ ringkasan gagal (${msg}) — riwayat dipertahankan utuh${t.reset}\n`);
    return false;
  }

  const before = history.length;
  replaceHistory([{ role: 'assistant', content: `[RINGKASAN RIWAYAT]\n${summary}` }]);
  process.stdout.write(`${t.info}  ✓ riwayat diringkas: ${before} pesan → 1 ringkasan (±${estimateTokens(summary)} token)${t.reset}\n`);
  return true;
}

function printSummary(cfg: JackConfig): void {
  const t = getTheme();
  const st = getState();
  process.stdout.write(`${t.dim}  ${st.steps} langkah · riwayat ${st.history.length} pesan (±${estimateTokens(toMessages(st.history))} token)${t.reset}\n`);
}

/** Jalankan satu tugas sampai selesai; `false` bila tugas gagal total. */
export async function runAgentTask(goal: string, opts: RunOptions = {}): Promise<boolean> {
  const t = getTheme();
  const cfg = readConfig();
  updateState({ steps: 0 });
  addMessage({ role: 'user', content: goal }, cfg.settings.max_history_length);

  const tools = new ToolRegistry({
    cfg,
    allowWrite: Boolean(opts.allowWrite),
    confirm: command => showConfirmDialog(command),
  });

  let step = 0;
  let failed = 0;
  let ok = true;

  while (true) {
    if (step >= cfg.agent.max_steps) {
      const lanjut = await askUser(`batas ${cfg.agent.max_steps} langkah tercapai, tugas belum selesai — lanjutkan? (y/n)`);
      if (!lanjut) break;
      step = 0;
    }

    await maybeCompact(cfg);

    // PRD § 3.5: isi skill yang sudah dimuat ikut sebagai pesan sistem tambahan.
    const loadedSkills = getState().skillLoaded
      .map((name) => {
        const body = loadSkillBody(name);
        return body ? `### ${name}\n${body}` : '';
      })
      .filter(Boolean)
      .join('\n\n');

    const system = buildSystemPrompt(collectContext(getState().currentDir, cfg.agent.auto_allow, loadedSkills));
    const printer = createStreamPrinter();
    const stopSpinner = startSpinner();

    let result: ChatResult;
    try {
      result = await send(cfg, {
        system,
        messages: toMessages(getState().history),
        tools: tools.specs(),
        stream: true,
        onText: (chunk) => {
          stopSpinner();
          printer.write(chunk);
        },
      });
    } catch (err) {
      stopSpinner();
      printer.end();
      const msg = err instanceof Error ? err.message : String(err);
      // PRD F5: teks yang sudah tampil dipertahankan (tidak diulang, tidak hilang).
      if (err instanceof ProviderError && err.partialText) {
        addMessage({ role: 'assistant', content: err.partialText }, cfg.settings.max_history_length);
      }
      process.stdout.write(`\n${t.error}  ✗ ${msg}${t.reset}\n`);
      ok = false;
      break;
    }

    stopSpinner();
    printer.end();

    const st = getState();
    if (result.model && result.model !== st.model) {
      process.stdout.write(`${t.dim}  (model ${result.model} dipakai)${t.reset}\n`);
    }
    if (result.text || result.toolCalls.length) {
      addMessage(
        { role: 'assistant', content: result.text, ...(result.toolCalls.length ? { toolCalls: result.toolCalls } : {}) },
        cfg.settings.max_history_length,
      );
    }

    if (result.toolCalls.length === 0) break;

    for (const call of result.toolCalls) {
      step += 1;
      updateState({ steps: step });
      const outcome = await tools.run(call);
      addMessage({ role: 'tool', content: outcome.text, toolCallId: call.id }, cfg.settings.max_history_length);
      failed = outcome.ok ? 0 : failed + 1;
    }

    if (failed >= 2) {
      const lanjut = await askUser('dua langkah gagal berturut-turut — lanjutkan mencoba? (y/n)');
      if (!lanjut) break;
      failed = 0;
    }
  }

  printSummary(cfg);
  renderStatusBar();
  return ok;
}
