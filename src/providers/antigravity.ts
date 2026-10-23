import * as https from 'https';
import * as crypto from 'crypto';
import { readConfig, updateConfig, type ProviderConfig } from '../core/config';
import { ensureValidToken, getAccessToken, forceRefreshAccessToken } from '../auth/token';
import { parseToolBlock } from '../exec/parser';
import { parseSseChunk, isDone } from './sse';
import { ProviderError } from './types';
import type { ChatRequest, ChatResult, Message, Provider, ToolCall } from './types';
import {
  API_BASE,
  API_STREAM_ENDPOINT,
  API_MODELS_ENDPOINT,
  API_LOAD_PROJECT,
  API_ONBOARD,
  API_TIMEOUT_MS,
  STREAM_TIMEOUT_MS,
  CLIENT_METADATA,
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  GENERATION_CONFIG,
  USER_AGENT,
  X_GOOG_API_CLIENT,
} from '../core/constants';

// ============================================================
// JACK-AGENT — Adapter Antigravity (SSE + protokol json_exec)
// ============================================================

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface JsonResponse { status: number; data: any }

function requestJson(urlStr: string, method: 'GET' | 'POST', payload?: unknown): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const apiUrl = new URL(urlStr);
    const body = payload ? JSON.stringify(payload) : undefined;
    const options: https.RequestOptions = {
      hostname: apiUrl.hostname,
      path: `${apiUrl.pathname}${apiUrl.search}`,
      method,
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Goog-Api-Client': X_GOOG_API_CLIENT,
        'Client-Metadata': CLIENT_METADATA,
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode || 0, data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(API_TIMEOUT_MS, () => { req.destroy(); reject(new ProviderError('timeout saat menghubungi antigravity')); });
    if (body) req.write(body);
    req.end();
  });
}

function normalizeId(value: unknown): string {
  let id: any = value;
  if (id && typeof id === 'object') id = id.id || id.name;
  if (id && typeof id === 'object') id = undefined;
  return id ? String(id) : '';
}

/** Provisioning project id Gemini Code Assist (pernah jadi sumber error). */
async function onboardProject(): Promise<string> {
  const cfg = readConfig();
  const existing = normalizeId(cfg.environment.antigravity_project_id);
  if (existing) return existing;

  try {
    const metadata = JSON.parse(CLIENT_METADATA);
    const load = await requestJson(API_LOAD_PROJECT, 'POST', { metadata });
    const tierId = load.data?.allowedTiers?.find((t: any) => t.isDefault)?.id || 'legacy-tier';

    let projectId = normalizeId(load.data?.cloudaicompanionProject);
    for (let i = 0; i < 5 && !projectId; i++) {
      const onboard = await requestJson(API_ONBOARD, 'POST', { tierId, metadata });
      projectId = normalizeId(onboard.data?.response?.cloudaicompanionProject);
      if (!projectId) await sleep(2000);
    }

    projectId = projectId || 'jack-agent-12345';
    updateConfig({ environment: { antigravity_project_id: projectId } as never });
    return projectId;
  } catch {
    // jangan hentikan sesi karena provisioning gagal
    return 'jack-agent-12345';
  }
}

/** Prompt sistem disuntikkan ke pesan user pertama (API menolak role system). */
function buildContents(system: string, messages: Message[]): Array<{ role: string; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  let injected = false;

  for (const message of messages) {
    if (message.role === 'assistant') {
      const text = message.toolCalls?.length ? renderJsonExec(message) : message.content;
      contents.push({ role: 'model', parts: [{ text }] });
      continue;
    }
    if (message.role === 'tool') {
      contents.push({ role: 'user', parts: [{ text: `[HASIL TOOL]\n${message.content}` }] });
      continue;
    }
    const text = !injected ? `${system}\n\n${message.content}` : message.content;
    injected = true;
    contents.push({ role: 'user', parts: [{ text }] });
  }

  if (!injected) contents.unshift({ role: 'user', parts: [{ text: system }] });
  return contents;
}

/** Render ulang tool call yang sudah dijalankan sebagai blok json_exec. */
function renderJsonExec(message: Message): string {
  const blocks = (message.toolCalls ?? []).map(call => {
    const payload = JSON.stringify({ tool: call.name, ...call.args });
    return '```json_exec\n' + payload + '\n```';
  });
  return [message.content, ...blocks].filter(Boolean).join('\n\n');
}

function extractText(data: any): string {
  const candidates = data?.response?.candidates ?? data?.candidates ?? (Array.isArray(data) ? data[0]?.candidates : undefined);
  const parts = candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) return parts.map((p: any) => p?.text ?? '').join('');
  return typeof data?.text === 'string' ? data.text : '';
}

function extractFinish(data: any): string | undefined {
  const candidates = data?.response?.candidates ?? data?.candidates;
  return candidates?.[0]?.finishReason;
}

function extractUsage(data: any): { prompt: number; completion: number } | undefined {
  const usage = data?.response?.usageMetadata ?? data?.usageMetadata;
  if (!usage) return undefined;
  return { prompt: Number(usage.promptTokenCount ?? 0), completion: Number(usage.candidatesTokenCount ?? 0) };
}

interface Attempt {
  result: ChatResult;
  /** alasan blok json_exec rusak; undefined bila panggilan tool valid/tidak ada */
  invalid?: string;
}

function executeRequest(model: string, req: ChatRequest, projectId: string): Promise<Attempt> {
  const cfg = readConfig();
  const payload = JSON.stringify({
    project: projectId,
    model,
    userAgent: 'antigravity',
    requestType: 'agent',
    requestId: `agent/${crypto.randomUUID()}/${Date.now()}/${crypto.randomUUID()}/1`,
    request: {
      model,
      contents: buildContents(req.system, req.messages),
      generationConfig: GENERATION_CONFIG,
      sessionId: cfg.environment.machine_id,
    },
  });

  const apiUrl = new URL(API_STREAM_ENDPOINT);
  // Teks yang sudah tampil disimpan supaya error bisa membawanya (PRD F5).
  let partial = '';

  return new Promise<Attempt>((resolve, reject) => {
    const request = https.request({
      hostname: apiUrl.hostname,
      path: `${apiUrl.pathname}${apiUrl.search}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': USER_AGENT,
        'X-Goog-Api-Client': X_GOOG_API_CLIENT,
        'Client-Metadata': CLIENT_METADATA,
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => reject(errorFromBody(res.statusCode as number, body)));
        return;
      }

      let buffer = '';
      let text = '';
      let usage: ChatResult['usage'];
      let finish: string | undefined;

      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer = parseSseChunk(buffer, chunk, (data) => {
          let json: any;
          try { json = JSON.parse(data); } catch { return; }
          const piece = extractText(json);
          if (piece) { text += piece; partial = text; req.onText?.(piece); }
          usage = extractUsage(json) ?? usage;
          finish = extractFinish(json) ?? finish;
        });
      });

      const finishResult = () => {
        const parsed = parseToolBlock(text);
        const toolCalls: ToolCall[] = parsed && 'call' in parsed
          ? [{ id: crypto.randomUUID(), ...parsed.call }]
          : [];
        resolve({
          result: {
            text: parsed ? parsed.text : text,
            toolCalls,
            usage,
            stopReason: toolCalls.length ? 'tool' : (finish === 'MAX_TOKENS' ? 'length' : 'done'),
            model,
          },
          invalid: parsed && 'error' in parsed ? parsed.error : undefined,
        });
      };

      res.on('end', () => {
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer.trim());
            const piece = extractText(json);
            if (piece) { text += piece; partial = text; req.onText?.(piece); }
          } catch { /* sisa buffer bukan JSON */ }
        }
        finishResult();
      });
      res.on('error', (err) => {
        const error = new ProviderError(`stream error: ${err.message}`);
        error.partialText = partial || undefined;
        reject(error);
      });
    });

    request.on('error', (err) => {
      const error = new ProviderError(`gagal menghubungi ${API_BASE}: ${err.message}`);
      error.partialText = partial || undefined;
      reject(error);
    });
    request.setTimeout(STREAM_TIMEOUT_MS, () => {
      request.destroy();
      const error = new ProviderError('timeout 180s saat menunggu respons antigravity');
      error.partialText = partial || undefined;
      reject(error);
    });
    request.write(payload);
    request.end();
  });
}

function errorFromBody(status: number, body: string): ProviderError {
  try {
    const parsed = JSON.parse(body);
    const json = Array.isArray(parsed) ? parsed[0] : parsed;
    const detail = json?.error?.details?.find((d: any) => d?.metadata?.validation_url);
    if (detail?.metadata?.validation_url) {
      // status 400 = tidak layak dicoba ulang: 6 percobaan model hanya membuang waktu
      return new ProviderError(
        `Akun Google-mu perlu diverifikasi oleh Gemini Code Assist.\n👉 Buka tautan ini: ${detail.metadata.validation_url}\nSetelah sukses, coba lagi.`,
        400,
      );
    }
    return new ProviderError(json?.error?.message || json?.error?.status || body.slice(0, 300), status);
  } catch {
    return new ProviderError(body.slice(0, 300) || `HTTP ${status}`, status);
  }
}

/**
 * PRD F2: bila server menolak token (401) padahal belum kedaluwarsa,
 * refresh paksa lalu ulang SEKALI dari awal. Kalau sebagian teks sudah
 * tampil, jangan ulangi — dua aliran tidak boleh digabung (F5, § 8 butir 1).
 */
async function executeWithAuthRetry(model: string, req: ChatRequest, projectId: string): Promise<Attempt> {
  let emitted = false;
  const wrapped: ChatRequest = { ...req, onText: (text) => { emitted = true; req.onText?.(text); } };
  try {
    return await executeRequest(model, wrapped, projectId);
  } catch (err) {
    if (!(err instanceof ProviderError) || err.status !== 401 || emitted) throw err;
    await forceRefreshAccessToken();
    return executeRequest(model, req, projectId);
  }
}

export function createAntigravityProvider(config: ProviderConfig): Provider {
  async function chat(req: ChatRequest): Promise<ChatResult> {
    const preferred = req.model || config.default_model || DEFAULT_MODEL;
    const available = config.models?.length ? config.models : FALLBACK_MODELS;
    const candidates = [preferred, ...available.filter(m => m !== preferred)];

    let lastError: unknown;
    for (const model of candidates) {
      try {
        await ensureValidToken();               // I-2: auth disiapkan tiap percobaan
        const projectId = await onboardProject();
        const first = await executeWithAuthRetry(model, req, projectId);
        if (!first.invalid) return first.result;

        // PRD § 3.5: JSON rusak → kirim koreksi satu kali, jangan hentikan sesi.
        const retry = await executeWithAuthRetry(model, {
          ...req,
          messages: [
            ...req.messages,
            { role: 'assistant', content: first.result.text },
            {
              role: 'user',
              content: `blok json_exec tidak valid: ${first.invalid}. Balas ulang dengan tepat satu blok json_exec yang valid (field "tool" + argumennya), tanpa teks lain.`,
            },
          ],
        }, projectId);
        if (!retry.invalid) return retry.result;
        return {
          ...retry.result,
          text: `${retry.result.text}\n\n(blok json_exec masih tidak valid: ${retry.invalid} — minta pengguna menjalankan langkahnya manual.)`.trim(),
        };
      } catch (err) {
        lastError = err;
        const status = err instanceof ProviderError ? err.status : undefined;
        // 400/401/403 tidak akan berubah dengan model lain (pola yang sama untuk verifikasi akun)
        if (status === 400 || status === 401 || status === 403) break;
      }
    }
    throw lastError instanceof Error ? lastError : new ProviderError(String(lastError));
  }

  async function listModels(): Promise<string[]> {
    await ensureValidToken();
    const projectId = await onboardProject();
    const res = await requestJson(API_MODELS_ENDPOINT, 'POST', { project: projectId });
    const json: any = res.data;
    const models: string[] = [];
    if (json?.models && typeof json.models === 'object' && !Array.isArray(json.models)) {
      models.push(...Object.keys(json.models));
    } else if (Array.isArray(json?.models)) {
      models.push(...json.models.map((m: any) => m?.name || m?.id || m?.displayName).filter(Boolean));
    } else if (Array.isArray(json)) {
      models.push(...json.map((m: any) => m?.name || m?.id).filter(Boolean));
    }
    return models.length ? models : FALLBACK_MODELS;
  }

  return { id: config.name, kind: 'antigravity', chat, listModels };
}
