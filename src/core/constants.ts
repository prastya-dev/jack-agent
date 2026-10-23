// ============================================================
// JACK-AGENT — Global Constants
// ============================================================

import pkg from '../../package.json';

export const APP_VERSION = pkg.version || '0.0.0';

// ── API Endpoints (khusus provider antigravity) ─────────────
export const API_BASE            = 'https://daily-cloudcode-pa.googleapis.com';
export const API_STREAM_ENDPOINT = `${API_BASE}/v1internal:streamGenerateContent?alt=sse`;
export const API_MODELS_ENDPOINT = `https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`;
export const API_LOAD_PROJECT    = `https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`;
export const API_ONBOARD         = `https://cloudcode-pa.googleapis.com/v1internal:onboardUser`;

// Menggunakan Official Antigravity Client ID (seperti 9router)
// Supaya Consent Screen bertuliskan "Antigravity" dan punya akses 1st-party
export const APP_OAUTH_CLIENT_ID     = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
export const APP_OAUTH_CLIENT_SECRET = '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';

export const OAUTH_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const OAUTH_REDIRECT_PORT = 8085;
export const OAUTH_REDIRECT_URI  = `http://localhost:${OAUTH_REDIRECT_PORT}/callback`;

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs'
];

// ── Token ──────────────────────────────────────────────────
/** Refresh token 5 menit sebelum expiry */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ── Models ─────────────────────────────────────────────────
export const FALLBACK_MODELS: string[] = [
  'gemini-3.6-flash-tiered',
  'gemini-3-flash-agent',
  'gemini-3.6-flash-medium',
  'gemini-2.5-flash-thinking',
  'gemini-3.5-flash-extra-low',
  'gemini-3.1-pro-high',
];

export const DEFAULT_MODEL = 'gemini-3.5-flash-extra-low';

// ── Request Headers ────────────────────────────────────────
export const USER_AGENT = 'google-api-nodejs-client/9.15.1 vscode-antigravity/1.107.0';
export const X_GOOG_API_CLIENT = 'google-cloud-sdk vscode_cloudshelleditor/0.1';
export const CLIENT_METADATA = JSON.stringify({ ideType: 9, platform: 3, pluginType: 2 });

// ── Generation Config ──────────────────────────────────────
export const GENERATION_CONFIG = {
  temperature:     0.2,
  maxOutputTokens: 4096,
};

// ── Batas agentik (default; bisa ditimpa config) ───────────
export const DEFAULT_MAX_STEPS            = 12;
export const DEFAULT_MAX_OUTPUT_LINES     = 200;
export const DEFAULT_MAX_OUTPUT_CHARS     = 8000;
export const DEFAULT_COMPACT_AT_PERCENT   = 70;
/** Batas konteks cadangan bila provider tidak melaporkan batas modelnya (PRD F7). */
export const DEFAULT_CONTEXT_TOKENS       = 32000;

// ── Timeout jaringan & perintah (wajib eksplisit, PRD § 2.4.2) ──
export const COMMAND_TIMEOUT_MS     = 30_000;
export const COMMAND_KILL_GRACE_MS  = 3_000;
export const COMMAND_MAX_BUFFER     = 10 * 1024 * 1024;
export const API_TIMEOUT_MS         = 20_000;
export const STREAM_TIMEOUT_MS      = 180_000;

// ── Skills ─────────────────────────────────────────────────
export const MAX_SKILLS       = 50;
export const SKILL_MAX_BYTES  = 8 * 1024;
export const SKILL_FILE_NAME  = 'SKILL.md';
