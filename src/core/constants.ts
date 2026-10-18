// ============================================================
// JACK-AGENT — Global Constants
// ============================================================

import pkg from '../../package.json';

export const APP_NAME    = 'JACK-AGENT';
export const APP_VERSION = pkg.version || '1.0.0';
export const NPM_PACKAGE = '@prastya-dev/jack-agent';
export const DEVELOPER   = 'prastya-dev';

// ── API Endpoints ──────────────────────────────────────────
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

// ── Default Settings ───────────────────────────────────────
export const DEFAULT_SETTINGS = {
  default_model:            DEFAULT_MODEL,
  default_mode:             'chat' as 'chat' | 'exec' | 'quiz',
  confirm_danger_commands:  true,
  max_history_length:       50,
  language:                 'id' as 'id' | 'en',
};

// ── Typewriter ─────────────────────────────────────────────
export const TYPEWRITER_DELAY_MS = 8;
