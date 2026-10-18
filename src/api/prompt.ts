import * as os from 'os';
import { stateManager } from '../core/state';

// ============================================================
// JACK-AGENT — System Prompt Builder
// Injects runtime environment variables into the prompt template
// ============================================================

const SYSTEM_PROMPT_TEMPLATE = `Kamu adalah Jack-agent, AI CLI Yang dikembangkan oleh prastya-dev.

KONTEKS LINGKUNGAN PENGGUNA:
- Sistem Operasi: {PLATFORM_OS}
- Shell Utama: {CURRENT_SHELL}
- Direktori Kerja: {CURRENT_DIRECTORY}
- Mode: {CURRENT_MODE}

ATURAN PERILAKU:
1. BERBICARALAH SEPENDEK MUNGKIN. DILARANG memberikan penjelasan panjang. Maksimal 2-3 kalimat. Fokus pada lingkungan CLI. JANGAN gunakan format Markdown bold (simbol *).
2. Jika mode saat ini adalah 'chat', berikan penjelasan singkat. Jika perintah meminta tentang tindakan ke sistem, sarankan ubah mode ke exec.
3. Jika mode saat ini adalah 'exec' dan pengguna meminta tindakan pada sistem/file:
   - WAJIB CEK DIREKTORI TERLEBIH DAHULU: Sebelum menyarankan perintah untuk memodifikasi sistem/file , kamu WAJIB memberikan perintah (seperti \`ls -la\` atau \`dir\`) untuk mengecek seluruh isi direktori saat ini. Jawab dengan sangat singkat, contoh "directory check...".
   - Jawab dengan SANGAT SINGKAT (Maksimal 1 kalimat) sebelum memberikan blok JSON.
   - Sertakan perintah terminal yang disarankan dalam format blok JSON khusus di akhir respons:
     \`\`\`json_exec
     { "command": "perintah_terminal_disini" }
     \`\`\`
     - jangan rekomendasi perintah jack
4. Jika mode saat ini adalah 'quiz', jawab dengan SUPER SINGKAT, to the point, tanpa penjelasan, tanpa basa basi. Langsung berikan jawaban intinya saja.`;

/** Detect the current shell from environment variables */
function detectShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

/** Detect platform in human-readable format */
function detectOS(): string {
  const platform = os.platform();
  const release  = os.release();
  switch (platform) {
    case 'darwin': return `macOS ${release}`;
    case 'win32':  return `Windows ${release}`;
    case 'linux':  return `Linux ${release}`;
    default:       return `${platform} ${release}`;
  }
}

/** Build the injected system prompt with runtime values */
export function buildSystemPrompt(): string {
  const state = stateManager.get();
  return SYSTEM_PROMPT_TEMPLATE
    .replace('{PLATFORM_OS}',      detectOS())
    .replace('{CURRENT_SHELL}',    detectShell())
    .replace('{CURRENT_DIRECTORY}', state.currentDir)
    .replace('{CURRENT_MODE}',     state.activeMode);
}

/** Build the contents array for the API payload */
export function buildContents(userMessage: string): Array<{role: string; parts: Array<{text: string}>}> {
  const state = stateManager.get();
  const systemPrompt = buildSystemPrompt();

  const contents: Array<{role: string; parts: Array<{text: string}>}> = [];

  // Inject system prompt as part of the first user message
  const firstContent = `${systemPrompt}\n\n${userMessage}`;

  if (state.history.length === 0) {
    // No history — just the system-injected user message
    contents.push({
      role: 'user',
      parts: [{ text: firstContent }],
    });
  } else {
    // Build history + current message
    // First message includes system prompt injection
    let isFirst = true;
    for (const msg of state.history) {
      if (msg.role === 'system') continue;
      const text = isFirst && msg.role === 'user'
        ? `${systemPrompt}\n\n${msg.content}`
        : msg.content;
      isFirst = false;
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }],
      });
    }

    // Append the new user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });
  }

  return contents;
}
