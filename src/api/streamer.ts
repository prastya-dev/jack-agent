import * as http from 'http';
import * as https from 'https';
import { TYPEWRITER_DELAY_MS } from '../core/constants';
import { getTheme } from '../ui/theme';

// ============================================================
// JACK-AGENT — SSE Stream Parser + Typewriter Effect
// Parses Server-Sent Events from Google Antigravity API
// and renders text with a typewriter character-by-character effect
// ============================================================

/** Sleep helper for typewriter delay */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class DelayedTypewriter {
  private buffer = '';
  private isHidden = false;
  private execMatch = '```json_exec';
  private closeMatch = '```';
  private t = getTheme();
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private spinnerTimer?: any;

  constructor(private hideExec: boolean) {}

  async write(text: string) {
    if (!this.hideExec) {
      for (const char of text) {
        process.stdout.write(char);
        if (TYPEWRITER_DELAY_MS > 0) {
          await sleep(TYPEWRITER_DELAY_MS);
        }
      }
      return;
    }

    for (const char of text) {
      this.buffer += char;

      if (!this.isHidden) {
        let isPrefix = false;
        for (let i = this.execMatch.length; i >= 1; i--) {
          if (this.buffer.endsWith(this.execMatch.slice(0, i))) {
            isPrefix = true;
            if (i === this.execMatch.length) {
               this.isHidden = true;
               const safeToPrint = this.buffer.slice(0, -this.execMatch.length);
               for (const c of safeToPrint) {
                 process.stdout.write(c);
                 if (TYPEWRITER_DELAY_MS > 0) await sleep(TYPEWRITER_DELAY_MS);
               }
               
               process.stdout.write('\n');
               this.spinnerTimer = setInterval(() => {
                 process.stdout.write(`\r\x1b[K${this.t.accent}${this.frames[this.frameIndex]} ${this.t.dim}Generating command...${this.t.reset}`);
                 this.frameIndex = (this.frameIndex + 1) % this.frames.length;
               }, 100);
               this.buffer = '';
            } else {
               const safeToPrint = this.buffer.slice(0, -i);
               for (const c of safeToPrint) {
                 process.stdout.write(c);
                 if (TYPEWRITER_DELAY_MS > 0) await sleep(TYPEWRITER_DELAY_MS);
               }
               this.buffer = this.buffer.slice(-i);
            }
            break;
          }
        }

        if (!isPrefix) {
          for (const c of this.buffer) {
             process.stdout.write(c);
             if (TYPEWRITER_DELAY_MS > 0) await sleep(TYPEWRITER_DELAY_MS);
          }
          this.buffer = '';
        }
      } else {
        // Hidden mode
        let isPrefix = false;
        for (let i = this.closeMatch.length; i >= 1; i--) {
           if (this.buffer.endsWith(this.closeMatch.slice(0, i))) {
             isPrefix = true;
             if (i === this.closeMatch.length) {
               this.isHidden = false;
               if (this.spinnerTimer) {
                 clearInterval(this.spinnerTimer);
                 process.stdout.write('\r\x1b[K');
                 this.spinnerTimer = undefined;
               }
               this.buffer = '';
             } else {
               this.buffer = this.buffer.slice(-i);
             }
             break;
           }
        }
        if (!isPrefix) {
           this.buffer = '';
        }
      }
    }
  }

  async stop() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      process.stdout.write('\r\x1b[K');
    }
    if (!this.isHidden && this.buffer) {
      for (const c of this.buffer) {
         process.stdout.write(c);
         if (TYPEWRITER_DELAY_MS > 0) await sleep(TYPEWRITER_DELAY_MS);
      }
    }
  }

  // Tambahan helper untuk memaksa berhenti
  forceStop() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      process.stdout.write('\r\x1b[K');
      this.spinnerTimer = undefined;
    }
  }
}

/**
 * Extract text chunks from a single SSE data line.
 * Handles multiple Gemini/Antigravity response shapes.
 */
function extractTextFromChunk(jsonStr: string): string {
  try {
    const data = JSON.parse(jsonStr);

    // Shape 0: { response: { candidates: [{ content: { parts: [{ text: "..." }] } }] } }
    if (data.response?.candidates && Array.isArray(data.response.candidates)) {
      const parts = data.response.candidates[0]?.content?.parts;
      if (parts && Array.isArray(parts)) {
        return parts.map((p: { text?: string }) => p.text || '').join('');
      }
    }

    // Shape 1: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
    if (data.candidates && Array.isArray(data.candidates)) {
      const parts = data.candidates[0]?.content?.parts;
      if (parts && Array.isArray(parts)) {
        return parts.map((p: { text?: string }) => p.text || '').join('');
      }
    }

    // Shape 2: Array of candidate objects
    if (Array.isArray(data)) {
      const parts = data[0]?.candidates?.[0]?.content?.parts;
      if (parts && Array.isArray(parts)) {
        return parts.map((p: { text?: string }) => p.text || '').join('');
      }
    }

    // Shape 3: Direct text field
    if (typeof data.text === 'string') {
      return data.text;
    }

  } catch {
    // Not valid JSON, skip
  }
  return '';
}

/**
 * Stream and parse the HTTP response from the Antigravity API.
 * Calls resolve with the full accumulated response text.
 * Outputs each text chunk via typewriter effect.
 */
export function streamResponse(
  res: http.IncomingMessage,
  resolve: (text: string) => void,
  reject: (err: Error) => void,
  options: { hideExec?: boolean } = {}
): void {
  let buffer = '';
  let fullText = '';
  let pendingWrites: Promise<void> = Promise.resolve();

  const typewriter = new DelayedTypewriter(!!options.hideExec);

  res.setEncoding('utf8');

  res.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let jsonStr = '';

      if (trimmed.startsWith('data: ')) {
        const payload = trimmed.slice(6).trim();
        if (payload === '[DONE]') continue;
        jsonStr = payload;
      } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        jsonStr = trimmed;
      } else {
        continue;
      }

      const text = extractTextFromChunk(jsonStr);
      if (!text) continue;

      fullText += text;

      // Chain typewriter writes to preserve order
      const textCopy = text;
      pendingWrites = pendingWrites.then(() => typewriter.write(textCopy)).catch(() => {});
    }
  });

  res.on('end', () => {
    // Process any remaining buffer content
    if (buffer.trim()) {
      const text = extractTextFromChunk(buffer.trim());
      if (text) {
        fullText += text;
        pendingWrites = pendingWrites.then(() => typewriter.write(text)).catch(() => {});
      }
    }

    // Wait for all pending typewriter writes to finish before resolving
    pendingWrites.then(() => typewriter.stop()).then(() => {
      process.stdout.write('\n');
      resolve(fullText);
    });
  });

  res.on('error', (err) => {
    typewriter.forceStop();
    reject(new Error(`Stream error: ${err.message}`));
  });
}
