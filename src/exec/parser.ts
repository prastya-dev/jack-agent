// ============================================================
// JACK-AGENT — Parser blok tool `json_exec` (PRD § 3.5)
// Dipakai provider yang tidak punya function calling.
// ============================================================

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ParseSuccess { call: ParsedToolCall; text: string }
export interface ParseFailure { error: string; text: string }

/** Blok berpagar pertama dengan info string `json_exec`, `json`, atau kosong. */
const FENCE = /```[ \t]*(json_exec|json)?[ \t]*\r?\n([\s\S]*?)(?:\r?\n?```|$)/i;

/**
 * Ambil tool call dari blok berpagar pertama.
 * - tidak ada blok → null
 * - JSON tidak valid → ParseFailure (loop mengirim pesan koreksi sekali)
 */
export function parseToolBlock(responseText: string): ParseSuccess | ParseFailure | null {
  const match = FENCE.exec(responseText);
  if (!match) return null;

  const raw = match[2].trim();
  const text = responseText.replace(match[0], '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { error: `blok json_exec tidak valid: ${reason}`, text };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { error: 'blok json_exec tidak valid: isi harus objek JSON', text };
  }

  const obj = parsed as Record<string, unknown>;
  // Bentuk lama (1.1.9): {"command": "..."} tanpa field tool.
  const name = typeof obj.tool === 'string' ? obj.tool : (typeof obj.command === 'string' ? 'run_command' : '');
  if (!name) {
    return { error: 'blok json_exec tidak valid: field "tool" tidak ada', text };
  }

  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key !== 'tool') args[key] = value;
  }
  if (name === 'run_command' && typeof args.command !== 'string') {
    return { error: 'blok json_exec tidak valid: run_command butuh field "command"', text };
  }
  if (name === 'use_skill' && typeof args.name !== 'string') {
    return { error: 'blok json_exec tidak valid: use_skill butuh field "name"', text };
  }

  return { call: { name, args }, text };
}
