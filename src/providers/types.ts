// ============================================================
// JACK-AGENT — Satu interface provider (PRD § 3.4)
// Tidak ada pemanggil di luar src/providers/ yang boleh tahu
// provider mana yang aktif.
// ============================================================

export type ProviderKind = 'antigravity' | 'openai';

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** hanya untuk pesan tool pada adapter yang butuh `tool_call_id` */
  toolCallId?: string;
  /** tool call yang diminta pesan asisten ini (dipakai fungsi calling OpenAI) */
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  /** prompt sistem, terpisah dari riwayat */
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  stream: boolean;
  /** model yang diminta pemanggil; adapter memakai default provider bila kosong */
  model?: string;
  /** dipanggil per potongan teks supaya bisa tampil sambil diterima */
  onText?: (text: string) => void;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  usage?: { prompt: number; completion: number };
  stopReason: 'done' | 'tool' | 'length' | 'error';
  /** model yang benar-benar menjawab (bisa berbeda karena fallback internal) */
  model?: string;
}

export interface Provider {
  readonly id: string;
  readonly kind: ProviderKind;
  listModels(): Promise<string[]>;
  chat(req: ChatRequest): Promise<ChatResult>;
}

/** Error provider dengan info apakah layak dicoba ulang (PRD F6). */
export class ProviderError extends Error {
  status?: number;
  /** teks yang sudah tampil sebelum streaming gagal (PRD F5: jangan diulang) */
  partialText?: string;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }

  /** 401/403/408/429/5xx dan error jaringan layak dicoba ulang; 400 tidak. */
  get retryable(): boolean {
    if (this.status === undefined) return true;
    if (this.status >= 500) return true;
    return [401, 403, 408, 429].includes(this.status);
  }
}
