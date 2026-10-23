import type { ProviderConfig } from '../core/config';
import { parseSseChunk, isDone } from './sse';
import { ProviderError } from './types';
import type { ChatRequest, ChatResult, Message, Provider, ToolCall } from './types';
import { API_TIMEOUT_MS, STREAM_TIMEOUT_MS } from '../core/constants';

// ============================================================
// JACK-AGENT — Adapter OpenAI-compatible (PRD § 3.4, F3, § 3.5)
// Tanpa SDK vendor: fetch bawaan Node (I-1).
// ============================================================

export interface ProviderTest {
  ok: boolean;
  message: string;
  models: string[];
}

interface PartialToolCall { id: string; name: string; args: string }

/** Parser SSE openai: teks + `tool_calls` yang datang bertahap. */
export class OpenAiStreamParser {
  text = '';
  finish?: string;
  usage?: { prompt: number; completion: number };
  private readonly calls = new Map<number, PartialToolCall>();

  push(payload: string, onText?: (text: string) => void): void {
    let json: any;
    try { json = JSON.parse(payload); } catch { return; }

    const choice = json?.choices?.[0];
    const delta = choice?.delta ?? {};
    const piece = typeof delta.content === 'string' ? delta.content : '';
    if (piece) {
      this.text += piece;
      onText?.(piece);
    }

    for (const raw of delta.tool_calls ?? []) {
      const index = Number(raw?.index ?? 0);
      const current = this.calls.get(index) ?? { id: '', name: '', args: '' };
      if (raw?.id) current.id = String(raw.id);
      if (raw?.function?.name) current.name = String(raw.function.name);
      if (raw?.function?.arguments) current.args += String(raw.function.arguments);
      this.calls.set(index, current);
    }

    const message = choice?.message;
    if (message && typeof message.content === 'string' && message.content) {
      this.text += message.content;
      onText?.(message.content);
    }
    for (const raw of message?.tool_calls ?? []) {
      const index = Number(raw?.index ?? 0);
      this.calls.set(index, {
        id: String(raw?.id ?? ''),
        name: String(raw?.function?.name ?? ''),
        args: typeof raw?.function?.arguments === 'string'
          ? raw.function.arguments
          : JSON.stringify(raw?.function?.arguments ?? {}),
      });
    }

    if (choice?.finish_reason) this.finish = String(choice.finish_reason);
    if (json?.usage) {
      this.usage = { prompt: Number(json.usage.prompt_tokens ?? 0), completion: Number(json.usage.completion_tokens ?? 0) };
    }
  }

  result(): ChatResult {
    const toolCalls: ToolCall[] = [...this.calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, call]) => call.name)
      .map(([index, call]) => {
        let args: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(call.args || '{}');
          if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>;
        } catch {
          // argumen rusak → tool akan melaporkan sendiri bahwa argumennya kurang
        }
        return { id: call.id || `call_${index}`, name: call.name, args };
      });

    return {
      text: this.text,
      toolCalls,
      usage: this.usage,
      stopReason: this.finish === 'tool_calls' || toolCalls.length
        ? 'tool'
        : (this.finish === 'length' ? 'length' : 'done'),
    };
  }
}

function baseUrlOf(config: ProviderConfig): string {
  const base = (config.base_url || '').trim().replace(/\/+$/, '');
  if (!base) throw new ProviderError(`provider "${config.name}" belum punya base_url`, 400);
  return base;
}

function headersOf(config: ProviderConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
    ...(config.headers ?? {}),
  };
}

/** Terjemahkan error jaringan menjadi pesan yang bisa ditindaklanjuti (PRD F3). */
export function describeFetchError(err: unknown): string {
  // Node 22 membungkus gagal koneksi ganda (IPv4+IPv6) dalam AggregateError.
  const cause = (err as { cause?: { code?: string; errors?: Array<{ code?: string }> } })?.cause;
  const code = cause?.code ?? cause?.errors?.map(e => e.code).find(Boolean) ?? '';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return `DNS gagal (${code}) — periksa base_url`;
  if (code.startsWith('CERT') || code.includes('TLS') || code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return `TLS gagal (${code}) — sertifikat endpoint tidak dipercaya`;
  }
  if (code === 'ECONNREFUSED') return 'koneksi ditolak — apakah endpoint lokal sudah jalan?';
  if (code === 'ETIMEDOUT' || (err as Error)?.name === 'AbortError') return 'timeout — endpoint tidak menjawab';
  const detail = (cause as { message?: string } | undefined)?.message;
  const message = err instanceof Error ? err.message : String(err);
  return detail && detail !== message ? `${message} (${detail})` : message;
}

export async function testOpenAi(config: ProviderConfig): Promise<ProviderTest> {
  let base: string;
  try {
    base = baseUrlOf(config);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), models: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/models`, { headers: headersOf(config), signal: controller.signal });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `api_key ditolak (HTTP ${res.status})`, models: [] };
    }
    if (res.status === 404) {
      return { ok: false, message: 'HTTP 404 — base_url salah (endpoint /models tidak ada)', models: [] };
    }
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status} dari ${base}/models`, models: [] };
    }

    const json = await res.json() as { data?: Array<{ id?: string }> };
    const models = Array.isArray(json?.data) ? json.data.map(m => String(m?.id ?? '')).filter(Boolean) : [];
    if (!Array.isArray(json?.data)) {
      return { ok: false, message: 'respons tidak berbentuk OpenAI-compatible (tidak ada array "data")', models: [] };
    }
    return {
      ok: true,
      message: models.length ? `terhubung — ${models.length} model tersedia` : 'terhubung, tetapi endpoint tidak mengembalikan model',
      models,
    };
  } catch (err) {
    return { ok: false, message: describeFetchError(err), models: [] };
  } finally {
    clearTimeout(timer);
  }
}

function renderJsonExec(message: Message): string {
  const blocks = (message.toolCalls ?? []).map(call => '```json_exec\n' + JSON.stringify({ tool: call.name, ...call.args }) + '\n```');
  return [message.content, ...blocks].filter(Boolean).join('\n\n');
}

export function buildMessages(system: string, messages: Message[], supportsTools: boolean): unknown[] {
  const out: unknown[] = [{ role: 'system', content: system }];

  for (const message of messages) {
    if (message.role === 'tool') {
      out.push(supportsTools
        ? { role: 'tool', tool_call_id: message.toolCallId ?? 'call_0', content: message.content }
        : { role: 'user', content: `[HASIL TOOL]\n${message.content}` });
      continue;
    }
    if (message.role === 'assistant') {
      if (supportsTools && message.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.toolCalls.map(call => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        });
        continue;
      }
      out.push({ role: 'assistant', content: message.toolCalls?.length ? renderJsonExec(message) : message.content });
      continue;
    }
    out.push({ role: 'user', content: message.content });
  }
  return out;
}

async function post(url: string, config: ProviderConfig, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: headersOf(config),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function createOpenAiProvider(config: ProviderConfig): Provider {
  const supportsTools = config.supports_tools !== false;

  async function chat(req: ChatRequest): Promise<ChatResult> {
    const base = baseUrlOf(config);
    const model = req.model || config.default_model || config.models?.[0] || '';
    if (!model) throw new ProviderError(`provider "${config.name}" belum punya model — jalankan "jack provider test"`, 400);

    const body: Record<string, unknown> = {
      model,
      messages: buildMessages(req.system, req.messages, supportsTools),
      stream: req.stream,
    };
    if (req.stream) body.stream_options = { include_usage: true };
    if (supportsTools && req.tools.length) {
      body.tools = req.tools.map(tool => ({ type: 'function', function: tool }));
      body.tool_choice = 'auto';
    }

    let res: Response;
    try {
      res = await post(`${base}/chat/completions`, config, body);
    } catch (err) {
      throw new ProviderError(describeFetchError(err));
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ProviderError(`HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
    }

    const parser = new OpenAiStreamParser();

    if (!req.stream) {
      parser.push(await res.text(), req.onText);
      return { ...parser.result(), model };
    }

    const stream = res.body as unknown as AsyncIterable<Uint8Array> | null;
    if (!stream) {
      parser.push(await res.text(), req.onText);
      return { ...parser.result(), model };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of stream) {
      buffer = parseSseChunk(buffer, decoder.decode(chunk, { stream: true }), (payload) => {
        if (!isDone(payload)) parser.push(payload, req.onText);
      });
    }
    if (buffer.trim() && !isDone(buffer.trim())) parser.push(buffer.trim(), req.onText);

    return { ...parser.result(), model };
  }

  async function listModels(): Promise<string[]> {
    const base = baseUrlOf(config);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/models`, { headers: headersOf(config), signal: controller.signal });
      if (!res.ok) throw new ProviderError(`HTTP ${res.status} dari ${base}/models`, res.status);
      const json = await res.json() as { data?: Array<{ id?: string }> };
      const models = Array.isArray(json?.data) ? json.data.map(m => String(m?.id ?? '')).filter(Boolean) : [];
      if (models.length) return models;
      if (config.models?.length) return config.models;
      throw new ProviderError('endpoint tidak mengembalikan daftar model — isi "models" di config');
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (config.models?.length) return config.models;
      throw new ProviderError(describeFetchError(err));
    } finally {
      clearTimeout(timer);
    }
  }

  return { id: config.name, kind: 'openai', chat, listModels };
}
