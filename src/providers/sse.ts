// ============================================================
// JACK-AGENT — Pembaca baris Server-Sent Events
// Dipakai adapter antigravity dan openai.
// ============================================================

export function parseSseChunk(buffer: string, chunk: string, onData: (payload: string) => void): string {
  const combined = buffer + chunk;
  const lines = combined.split('\n');
  const rest = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('data:')) {
      onData(trimmed.slice(5).trim());
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      onData(trimmed);
    }
  }
  return rest;
}

export function isDone(payload: string): boolean {
  return payload === '[DONE]';
}
