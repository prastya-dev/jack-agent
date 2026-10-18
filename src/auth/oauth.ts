import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import * as url from 'url';
import * as net from 'net';
import {
  APP_OAUTH_CLIENT_ID,
  APP_OAUTH_CLIENT_SECRET,
  OAUTH_AUTH_URL,
  OAUTH_TOKEN_URL,
  OAUTH_REDIRECT_PORT,
  OAUTH_SCOPES,
} from '../core/constants';

// ============================================================
// JACK-AGENT — OAuth2 PKCE Session
// ============================================================

export interface OAuthTokens {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  expiry_date:   number;
  user_email:    string;
  user_name:     string;
  user_picture:  string;
}

export interface OAuthSession {
  authUrl:      string;
  port:         number;
  redirectUri:  string;
  waitForCode:  Promise<string>;   // resolves when Google sends callback
  cancel:       () => void;
  exchangeCode: (code: string) => Promise<OAuthTokens>;
}

// ── PKCE ───────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url');
}
function generateCodeChallenge(v: string): string {
  return crypto.createHash('sha256').update(v).digest('base64url');
}

// ── Port ───────────────────────────────────────────────────

function isPortFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const srv = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => { srv.close(() => resolve(true)); })
      .listen(port, '127.0.0.1');
  });
}
async function getFreePort(start: number): Promise<number> {
  for (let p = start; p < start + 20; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`Tidak ada port bebas di range ${start}–${start + 19}`);
}

// ── Auth URL ───────────────────────────────────────────────

function buildAuthUrl(challenge: string, state: string, redirectUri: string): string {
  return `${OAUTH_AUTH_URL}?${new URLSearchParams({
    response_type:         'code',
    client_id:             APP_OAUTH_CLIENT_ID,
    redirect_uri:          redirectUri,
    scope:                 OAUTH_SCOPES.join(' '),
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    access_type:           'offline',
    prompt:                'consent',
    state,
  })}`;
}

// ── Callback Server ────────────────────────────────────────

function startCallbackServer(
  expectedState: string,
  port: number,
): { codePromise: Promise<string>; shutdown: () => void } {
  let _resolve: (code: string) => void;
  let _reject:  (err: Error)   => void;

  const codePromise = new Promise<string>((res, rej) => {
    _resolve = res; _reject = rej;
  });

  const server = http.createServer((req, res) => {
    if (!req.url) return;
    const parsed = url.parse(req.url, true);
    if (parsed.pathname !== '/callback') { res.writeHead(204); res.end(); return; }

    const code      = parsed.query.code      as string | undefined;
    const stateBack = parsed.query.state     as string | undefined;
    const error     = parsed.query.error     as string | undefined;
    const errDesc   = parsed.query.error_description as string | undefined;

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(callbackHtml(false, errDesc || error));
      server.close();
      _reject(new Error(`OAuth error: ${errDesc || error}`));
      return;
    }
    if (!code || stateBack !== expectedState) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(callbackHtml(false, 'State mismatch'));
      server.close();
      _reject(new Error('OAuth state mismatch'));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(callbackHtml(true));
    server.close();
    _resolve(code);
  });

  server.listen(port, '127.0.0.1');
  server.on('error', (e) => _reject(new Error(`Server error: ${e.message}`)));

  const timer = setTimeout(() => {
    server.close();
    _reject(new Error('OAuth timeout — tidak ada respons dalam 5 menit'));
  }, 5 * 60 * 1000);

  server.on('close', () => clearTimeout(timer));

  return {
    codePromise,
    shutdown: () => { try { server.close(); } catch { /* ignore */ } },
  };
}

// ── Token Exchange ─────────────────────────────────────────

async function exchangeCodeInternal(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const params: Record<string, string> = {
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     APP_OAUTH_CLIENT_ID,
    code_verifier: verifier,
  };
  if (APP_OAUTH_CLIENT_SECRET) {
    params.client_secret = APP_OAUTH_CLIENT_SECRET;
  }
  const body = new URLSearchParams(params).toString();

  const raw  = await httpsPost(OAUTH_TOKEN_URL, body);
  const json = safeJSON(raw);

  if (!json || json.error) {
    throw new Error(`Token exchange gagal: ${json?.error_description || json?.error || raw.slice(0, 200)}`);
  }
  if (!json.access_token) throw new Error('access_token tidak ada dalam respons');

  const profile = await fetchProfile(json.access_token as string);

  return {
    access_token:  json.access_token  as string,
    refresh_token: (json.refresh_token as string) || '',
    token_type:    (json.token_type    as string) || 'Bearer',
    expiry_date:   Date.now() + ((json.expires_in as number) * 1000),
    ...profile,
  };
}

// ── User Profile ───────────────────────────────────────────

export async function fetchProfile(token: string): Promise<{ user_email: string; user_name: string; user_picture: string }> {
  return new Promise(resolve => {
    const fallback = { user_email: '', user_name: '', user_picture: '' };
    const req = https.request({
      hostname: 'www.googleapis.com', path: '/oauth2/v3/userinfo',
      method: 'GET', headers: { Authorization: `Bearer ${token}` },
    }, res => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => {
        try {
          const info = JSON.parse(d) as Record<string, string>;
          resolve({ user_email: info.email || '', user_name: info.name || '', user_picture: info.picture || '' });
        } catch { resolve(fallback); }
      });
    });
    req.on('error', () => resolve(fallback));
    req.setTimeout(8000, () => { req.destroy(); resolve(fallback); });
    req.end();
  });
}

// ── User Projects (Resource Manager) ───────────────────────

export async function fetchUserProjects(token: string): Promise<string[]> {
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'cloudresourcemanager.googleapis.com',
      path: '/v1/projects',
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, res => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(d) as { projects?: Array<{ projectId: string; lifecycleState: string }> };
          if (json.projects && Array.isArray(json.projects)) {
            // Hanya ambil project yang aktif
            const active = json.projects
              .filter(p => p.lifecycleState === 'ACTIVE')
              .map(p => p.projectId);
            resolve(active);
          } else {
            resolve([]);
          }
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ── Helpers ────────────────────────────────────────────────

function httpsPost(urlStr: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = new URL(urlStr);
    const req = https.request({
      hostname: p.hostname, path: p.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let d = ''; res.on('data', c => { d += c; }); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(body); req.end();
  });
}

function safeJSON(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

// ── Browser Opener ─────────────────────────────────────────

export async function openBrowser(authUrl: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('open');
    const fn  = typeof pkg === 'function' ? pkg : (pkg.default ?? null);
    if (typeof fn === 'function') { await fn(authUrl); return; }
  } catch { /* fallthrough */ }
  const { exec } = await import('child_process');
  const cmds: Partial<Record<NodeJS.Platform, string>> = {
    linux: `xdg-open "${authUrl}"`, darwin: `open "${authUrl}"`, win32: `start "" "${authUrl}"`,
  };
  const c = cmds[process.platform];
  if (c) await new Promise<void>(r => exec(c, () => r()));
}

// ── Session Factory ────────────────────────────────────────

/**
 * Create an OAuth session. Returns everything needed for the
 * "Connect Antigravity" dialog to orchestrate the login flow.
 */
export async function createOAuthSession(): Promise<OAuthSession> {
  const verifier   = generateCodeVerifier();
  const challenge  = generateCodeChallenge(verifier);
  const state      = crypto.randomBytes(16).toString('hex');
  const port       = await getFreePort(OAUTH_REDIRECT_PORT);
  const redirectUri = `http://localhost:${port}/callback`;
  const authUrl    = buildAuthUrl(challenge, state, redirectUri);

  const { codePromise, shutdown } = startCallbackServer(state, port);

  return {
    authUrl,
    port,
    redirectUri,
    waitForCode: codePromise,
    cancel: shutdown,
    exchangeCode: (code: string) => exchangeCodeInternal(code, verifier, redirectUri),
  };
}

// ── Backward-compat wrapper ─────────────────────────────────

export async function runOAuthFlow(): Promise<OAuthTokens> {
  const session = await createOAuthSession();
  await openBrowser(session.authUrl);
  const code   = await session.waitForCode;
  return session.exchangeCode(code);
}

// ── Callback Page HTML ─────────────────────────────────────

function callbackHtml(ok: boolean, errMsg = ''): string {
  if (ok) return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>JACK — Login Success</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:#080c10;display:flex;flex-direction:column;
    align-items:center;justify-content:center;font-family:'Inter',-apple-system,sans-serif;gap:32px;padding:24px}
  .logo{display:flex;flex-direction:column;align-items:center;gap:8px}
  .logo-icon{width:56px;height:56px;background:linear-gradient(135deg,#00d4ff,#0066ff);
    border-radius:14px;display:flex;align-items:center;justify-content:center;
    font-size:28px;box-shadow:0 0 32px #00d4ff44}
  .logo-name{font-size:1.1rem;font-weight:700;color:#e0f0ff;letter-spacing:3px;text-transform:uppercase}
  .card{background:#0d1520;border:1px solid #1a3a5c;border-radius:16px;padding:40px 48px;
    text-align:center;max-width:460px;width:100%;box-shadow:0 8px 48px #00000060}
  .check{width:64px;height:64px;background:linear-gradient(135deg,#00ff88,#00d4aa);
    border-radius:50%;display:flex;align-items:center;justify-content:center;
    margin:0 auto 24px;font-size:28px;color:#003322;box-shadow:0 0 32px #00ff8844}
  h1{color:#e0f0ff;font-size:1.4rem;font-weight:600;margin-bottom:12px}
  p{color:#6a8aaa;font-size:1rem;line-height:1.6;margin-bottom:24px}
  .chip{display:inline-flex;align-items:center;gap:8px;background:#162030;
    border:1px solid #1e3a5a;border-radius:24px;padding:8px 16px;color:#8ab4d8;font-size:.82rem}
  .dot{width:8px;height:8px;background:#00ff88;border-radius:50%}
  footer{color:#2a4060;font-size:.72rem;letter-spacing:2px;text-transform:uppercase}
</style></head><body>
<div class="card"> <div class="check">✓</div><h1>Login Success!</h1> <p> Please return to the terminal wizard.<div class="chip"><div class="dot"></div>Sesi aktif</div>
</div><footer>JACK • prastya-dev</footer>
<script>setTimeout(()=>{try{window.close()}catch(e){}},3000)</script>
</body></html>`;

  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>Antigravity — Login Gagal</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:#080c10;display:flex;flex-direction:column;
    align-items:center;justify-content:center;font-family:sans-serif;gap:24px;padding:24px}
  .card{background:#150d0d;border:1px solid #4a1a1a;border-radius:16px;
    padding:40px 48px;text-align:center;max-width:400px;width:100%}
  h1{color:#ff6666;font-size:1.3rem;margin-bottom:12px}
  p{color:#886666;font-size:.88rem;line-height:1.6}
  .err{color:#ff4444;background:#2a0a0a;border-radius:8px;
    padding:8px 12px;margin-top:16px;font-size:.8rem;font-family:monospace}
  footer{color:#2a1a1a;font-size:.72rem;letter-spacing:2px;text-transform:uppercase}
</style></head><body>
<div class="card">
  <h1>✗ Login Gagal</h1>
  <p>Terjadi kesalahan saat login ke Antigravity.</p>
  <div class="err">${errMsg}</div>
  <p style="margin-top:16px">Tutup tab ini dan coba lagi dari terminal.</p>
</div>
<footer>Antigravity • prastya-dev</footer>
</body></html>`;
}
