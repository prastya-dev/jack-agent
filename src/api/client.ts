import * as https from 'https';
import { readConfig, updateConfig } from '../core/config';
import { stateManager } from '../core/state';
import { getAccessToken, ensureValidToken } from '../auth/token';
import { buildContents } from './prompt';
import { streamResponse } from './streamer';
import { extractCommand } from '../exec/parser';
import { runCommand } from '../exec/runner';
import { showConfirmDialog } from '../ui/confirm';
import { printBotPrefix } from '../ui/statusbar';
import { getTheme } from '../ui/theme';
import {
  API_STREAM_ENDPOINT,
  API_MODELS_ENDPOINT,
  API_LOAD_PROJECT,
  API_ONBOARD,
  API_BASE,
  FALLBACK_MODELS,
  USER_AGENT,
  X_GOOG_API_CLIENT,
  CLIENT_METADATA,
  GENERATION_CONFIG,
} from '../core/constants';
import * as crypto from 'crypto';

// ============================================================
// JCKW-AGENT — API Client
// Handles authenticated requests to Google Antigravity API
// ============================================================

/**
 * Helper to make a generic JSON API request
 */
function requestJson(urlStr: string, method: 'GET' | 'POST', payload?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken();
    const apiUrl = new URL(urlStr);
    const bodyStr = payload ? JSON.stringify(payload) : undefined;
    
    const options: https.RequestOptions = {
      hostname: apiUrl.hostname,
      path: `${apiUrl.pathname}${apiUrl.search}`,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Goog-Api-Client': X_GOOG_API_CLIENT,
        'Client-Metadata': CLIENT_METADATA,
      },
    };

    if (bodyStr) (options.headers as any)['Content-Length'] = Buffer.byteLength(bodyStr);

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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Onboard the user to Gemini Code Assist (provisioning the project id).
 */
export async function onboardAntigravity(): Promise<string> {
  const cfg = readConfig();
  if (cfg.environment.antigravity_project_id) {
    let pid: any = cfg.environment.antigravity_project_id;
    if (typeof pid === 'object') {
      pid = pid.id || pid.name || 'jckw-agent-12345';
      if (typeof pid === 'object') pid = 'jckw-agent-12345';
    }
    return String(pid);
  }

  try {
    const md = JSON.parse(CLIENT_METADATA);
    const loadRes = await requestJson(API_LOAD_PROJECT, 'POST', { metadata: md });
    
    let proj = loadRes.data.cloudaicompanionProject;
    let projectId = proj?.id || proj?.name || proj;

    const tierId = loadRes.data.allowedTiers?.find((t: any) => t.isDefault)?.id || "legacy-tier";

    let done = false;
    let onboardRes;
    for (let i = 0; i < 5; i++) {
      onboardRes = await requestJson(API_ONBOARD, 'POST', { tierId, metadata: md });
      if (onboardRes.data.done) {
        done = true;
        break;
      }
      await sleep(2000);
    }

    if (done && onboardRes?.data.response?.cloudaicompanionProject) {
      proj = onboardRes.data.response.cloudaicompanionProject;
      projectId = proj?.id || proj?.name || proj;
    }

    if (typeof projectId === 'object') {
       projectId = projectId.id || projectId.name || 'jckw-agent-12345';
       if (typeof projectId === 'object') projectId = 'jckw-agent-12345';
    }

    if (projectId) {
      projectId = String(projectId);
      updateConfig({ environment: { antigravity_project_id: projectId } as never });
      return projectId;
    }
    
    // Fallback if API changed but didn't throw
    return 'jckw-agent-12345';
  } catch (err) {
    // Silently ignore to not disrupt flow; but fallback to a generated ID
    return 'jckw-agent-error';
  }
}

/** Fetch available models from the Antigravity API */
export async function fetchModels(): Promise<string[]> {
  await ensureValidToken();
  const cfg = readConfig();
  const projectId = await onboardAntigravity(); // Ensure we're onboarded first

  return new Promise((resolve) => {
    const accessToken = getAccessToken();
    const payload = JSON.stringify({ project: projectId });

    const options: https.RequestOptions = {
      hostname: new URL(API_MODELS_ENDPOINT).hostname,
      path: new URL(API_MODELS_ENDPOINT).pathname,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': USER_AGENT,
        'X-Goog-Api-Client': X_GOOG_API_CLIENT,
        'Client-Metadata': CLIENT_METADATA,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Try common response shapes
          const models: string[] = [];
          if (json.models && typeof json.models === 'object') {
            // Models returned as an object map (e.g. { "gemini-3.1-pro": {...} })
            for (const key of Object.keys(json.models)) {
              models.push(key);
            }
          } else if (Array.isArray(json.models)) {
            for (const m of json.models) {
              const name = m.name || m.id || m.displayName;
              if (name) models.push(name);
            }
          } else if (Array.isArray(json)) {
            for (const m of json) {
              const name = m.name || m.id;
              if (name) models.push(name);
            }
          }
          if (models.length > 0) {
            resolve(models);
          } else {
            resolve(FALLBACK_MODELS);
          }
        } catch {
          resolve(FALLBACK_MODELS);
        }
      });
    });

    req.on('error', () => resolve(FALLBACK_MODELS));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve(FALLBACK_MODELS);
    });
    req.write(payload);
    req.end();
  });
}

async function executeModelRequest(modelId: string, userText: string, projectId: string, cfg: any, accessToken: string, t: any, stopSpinner: () => void, isExecMode?: boolean): Promise<string> {
  const payload = JSON.stringify({
    project: projectId,
    model: modelId,
    userAgent: 'antigravity',
    requestType: 'agent',
    requestId: `agent/${crypto.randomUUID()}/${Date.now()}/${crypto.randomUUID()}/1`,
    request: {
      model: modelId,
      contents: buildContents(userText),
      generationConfig: GENERATION_CONFIG,
      sessionId: cfg.environment.machine_id,
    }
  });

  const apiUrl = new URL(API_STREAM_ENDPOINT);
  const options: https.RequestOptions = {
    hostname: apiUrl.hostname,
    path: `${apiUrl.pathname}${apiUrl.search}`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': USER_AGENT,
      'X-Goog-Api-Client': X_GOOG_API_CLIENT,
      'Client-Metadata': CLIENT_METADATA,
    },
  };

  return new Promise<string>((resolve, reject) => {
    const req = https.request(options, (res) => {
      stopSpinner(); // Clear spinner once response headers arrive
      
      if (res.statusCode && res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => { errBody += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(errBody);
            const json = Array.isArray(parsed) ? parsed[0] : parsed;
            
            if (json.error?.details) {
              const detail = json.error.details.find((d: any) => d.reason === 'VALIDATION_REQUIRED' || d.metadata?.validation_url);
              if (detail && detail.metadata?.validation_url) {
                reject(new Error(`API Error (${res.statusCode}): Akun Google-mu perlu diverifikasi oleh Gemini Code Assist.\n\n👉 Silakan klik link ini untuk verifikasi:\n${detail.metadata.validation_url}\n\nSetelah sukses, silakan coba lagi.`));
                return;
              }
            }

            const errMsg = json.error?.message || json.error?.status || errBody;
            const err = new Error(errMsg) as any;
            err.status = res.statusCode;
            reject(err);
          } catch {
            const err = new Error(errBody) as any;
            err.status = res.statusCode;
            reject(err);
          }
        });
        return;
      }
      streamResponse(res, resolve, reject, { hideExec: isExecMode });
    });

    req.on('error', (err) => {
      stopSpinner();
      reject(err);
    });
    req.setTimeout(180000, () => {
      stopSpinner();
      req.destroy();
      reject(new Error('Request timeout (180s)'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Send a user message to the AI and stream the response.
 * Handles auto-fallback if 429 limit is reached.
 */
export async function sendMessage(userText: string, isSystemFollowUp: boolean = false): Promise<void> {
  await ensureValidToken();

  const cfg         = readConfig();
  const state       = stateManager.get();
  const accessToken = getAccessToken();
  const t           = getTheme();

  const projectId = await onboardAntigravity();

  const selectedModelId = state.selectedModel.startsWith('ag/') ? state.selectedModel : state.selectedModel;
  
  // Helper to extract model family prefix (e.g., 'gemini', 'claude')
  const getModelFamily = (modelId: string): string => {
    const clean = modelId.replace(/^ag\//, '');
    const match = clean.match(/^(gemini|claude|gpt|deepseek|qwen)/i);
    if (match) return match[1].toLowerCase();
    return clean.split('-')[0].toLowerCase();
  };

  // Group candidates so models with the same prefix (e.g. gemini- or claude-) are tried first
  const selectedFamily = getModelFamily(selectedModelId);
  const candidatePool = Array.from(new Set([selectedModelId, ...FALLBACK_MODELS]));
  const sameFamily = candidatePool.filter(m => m !== selectedModelId && getModelFamily(m) === selectedFamily);
  const otherFamily = candidatePool.filter(m => m !== selectedModelId && getModelFamily(m) !== selectedFamily);
  
  const modelsToTry = [selectedModelId, ...sameFamily, ...otherFamily];

  printBotPrefix();
  stateManager.update({ isStreaming: true });

  let frameIndex = 0;
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  process.stdout.write('\x1b[s');
  
  const spinnerTimer = setInterval(() => {
    const text = isSystemFollowUp ? "working..." : "thinking...";
    process.stdout.write(`\x1b[u${t.accent}${frames[frameIndex]} ${t.dim}${text}\x1b[K`);
    frameIndex = (frameIndex + 1) % frames.length;
  }, 100);

  let fullResponse = '';
  let finalError: Error | null = null;
  let successModel = '';

  let spinnerStopped = false;
  const stopSpinner = () => {
    if (spinnerStopped) return;
    spinnerStopped = true;
    clearInterval(spinnerTimer);
    process.stdout.write('\x1b[u\x1b[K');
  };

  for (const modelId of modelsToTry) {
    try {
      fullResponse = await executeModelRequest(modelId, userText, projectId, cfg, accessToken, t, stopSpinner, state.activeMode === 'exec');
      successModel = modelId;
      finalError = null;
      break; // Success!
    } catch (err: any) {
      finalError = err;
      // If account verification is required, stop immediately so user sees the link
      if (err.message?.includes('diverifikasi oleh Gemini Code Assist')) {
        break;
      }
      // For any other error (400 invalid argument, 429 rate limit, 503 overloaded, exec mode errors, etc.), fallback to next model
      continue;
    }
  }

  stopSpinner();

  stateManager.update({ isStreaming: false });

  if (finalError) {
    if ((finalError as any).status === 429 || finalError.message.includes('RESOURCE_EXHAUSTED')) {
      process.stdout.write(`\n${t.error}  ✗ Token Anda limit, silakan tunggu beberapa jam agar token terisi kembali.${t.reset}\n`);
    } else {
      process.stdout.write(`\n${t.error}  ✗ Error: ${finalError.message}${t.reset}\n`);
    }
    return;
  }

  if (successModel !== selectedModelId) {
    process.stdout.write(`\n\n${t.dim}  (Fallback: Dialihkan menggunakan model ${successModel})${t.reset}\n`);
  }

  // Add assistant message to history
  if (fullResponse) {
    stateManager.addMessage({
      role: 'assistant',
      content: fullResponse,
      timestamp: Date.now(),
    });
  }

  // Handle exec mode: check for json_exec block
  if (state.activeMode === 'exec' && fullResponse) {
    const command = extractCommand(fullResponse);
    if (command) {
      const confirmed = await showConfirmDialog(command);
      if (confirmed) {
        // Run command silently
        const result = await runCommand(command);
        const output = result.stdout || result.stderr || '(tidak ada output)';

        // Add output to history so AI can read it in the next request
        const outputMsg = `[OUTPUT PERINTAH TERMINAL]\n${output}\n\nTolong jelaskan hasil output di atas atau berikan perintah selanjutnya jika diperlukan.`;
        stateManager.addMessage({
          role: 'user',
          content: outputMsg,
          timestamp: Date.now(),
        });

        // Trigger AI follow-up automatically
        await sendMessage(outputMsg, true);
      } else {
        process.stdout.write(`\n${t.dim}  Eksekusi dibatalkan.${t.reset}\n`);
      }
    }
  }
}
