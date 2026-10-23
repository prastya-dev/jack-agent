import * as https from 'https';
import { readConfig, updateConfig } from '../core/config';
import { OAUTH_TOKEN_URL, TOKEN_REFRESH_BUFFER_MS, APP_OAUTH_CLIENT_ID, APP_OAUTH_CLIENT_SECRET, API_TIMEOUT_MS } from '../core/constants';
import { getTheme } from '../ui/theme';

// ============================================================
// JACK-AGENT — Token Manager
// Auto-refresh access_token when approaching expiry
// ============================================================

/** Returns true if the stored access_token is still valid */
export function isTokenValid(): boolean {
  try {
    const cfg = readConfig();
    return (
      Boolean(cfg.auth.access_token) &&
      cfg.auth.expiry_date > Date.now() + TOKEN_REFRESH_BUFFER_MS
    );
  } catch {
    return false;
  }
}

/** Refresh tokens using the stored refresh_token */
export async function refreshAccessToken(): Promise<void> {
  const cfg = readConfig();
  const { refresh_token, client_id, client_secret } = cfg.auth as { refresh_token: string; client_id?: string; client_secret?: string };

  if (!refresh_token) {
    throw new Error('Tidak ada refresh token. Jalankan "jack login" untuk masuk ulang.');
  }

  // Gunakan app credentials yang di-embed di binary
  void client_id; void client_secret; // tidak dipakai lagi dari config
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token,
    client_id:     APP_OAUTH_CLIENT_ID,
    client_secret: APP_OAUTH_CLIENT_SECRET,
  }).toString();

  const responseText = await httpsPost(OAUTH_TOKEN_URL, body);
  const json = JSON.parse(responseText);

  if (json.error) {
    throw new Error(`Token refresh failed: ${json.error_description || json.error}`);
  }

  updateConfig({
    auth: {
      ...cfg.auth,
      access_token: json.access_token,
      expiry_date: Date.now() + json.expires_in * 1000,
      // Some providers return a new refresh_token
      refresh_token: json.refresh_token || refresh_token,
    },
  });
}

/**
 * PRD F1: refresh gagal → login ulang otomatis (hanya mungkin di TTY,
 * karena OAuth butuh browser). Non-TTY tetap memberi perintah manual.
 */
async function reloginOrThrow(cause: unknown): Promise<void> {
  const msg = cause instanceof Error ? cause.message : String(cause);

  if (process.stdin.isTTY && process.stdout.isTTY) {
    process.stdout.write(`\n  ↻ token tidak bisa diperbarui (${msg}) — memulai login ulang otomatis...\n`);
    try {
      const { runRelogin } = await import('../ui/wizard');
      await runRelogin();
      if (isTokenValid()) return;
    } catch {
      // jatuh ke pesan di bawah
    }
  }

  throw new Error(`Tidak bisa me-refresh token: ${msg}\nJalankan "jack login" untuk masuk ulang.`);
}

/**
 * Ensures a valid access_token is available.
 * Automatically refreshes if expired or close to expiry.
 * Throws if refresh also fails.
 */
export async function ensureValidToken(): Promise<void> {
  const t = getTheme();
  if (isTokenValid()) return;

  process.stdout.write(`${t.dim}  ↻ Token expired — refreshing...${t.reset}\n`);

  try {
    await refreshAccessToken();
    process.stdout.write(`${t.info}  ✓ Token refreshed.${t.reset}\n\n`);
  } catch (err: unknown) {
    await reloginOrThrow(err);
  }
}

/** PRD F2: refresh paksa ketika server menolak token (401) walau belum kedaluwarsa. */
export async function forceRefreshAccessToken(): Promise<void> {
  try {
    await refreshAccessToken();
  } catch (err) {
    await reloginOrThrow(err);
  }
}

/** Return the current (valid) access token */
export function getAccessToken(): string {
  const cfg = readConfig();
  return cfg.auth.access_token;
}

// ── HTTPS utility ──────────────────────────────────────────

function httpsPost(urlStr: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.setTimeout(API_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('timeout saat refresh token'));
    });
    req.write(body);
    req.end();
  });
}
