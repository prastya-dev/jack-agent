import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { getTheme, A } from '../ui/theme';
import { askUser } from '../ui/confirm';

const REPO = 'prastya-dev/jack-agent';
const NPM_PKG = '@prastya-dev/jack-agent';

/** true kalau `a` lebih baru dari `b` (semver sederhana, prerelease diabaikan). */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

function fetchJson(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const apiUrl = new URL(urlStr);
    const options: https.RequestOptions = {
      hostname: apiUrl.hostname,
      path: `${apiUrl.pathname}${apiUrl.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'JACK-AGENT-Updater'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(data || '{}') });
        } catch(e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function getLatestRelease(): Promise<any> {
  // 1. Try GitHub Releases API
  try {
    const res = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (res.status === 200 && res.data?.tag_name) {
      return res.data;
    }
  } catch {}

  // 2. Fallback: Try NPM Registry API
  try {
    const res = await fetchJson(`https://registry.npmjs.org/${NPM_PKG}/latest`);
    if (res.status === 200 && res.data?.version) {
      return { tag_name: `v${res.data.version}`, assets: [] };
    }
  } catch {}

  // 3. Fallback: Try GitHub Tags API
  try {
    const res = await fetchJson(`https://api.github.com/repos/${REPO}/tags`);
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      const tag = res.data[0].name;
      if (tag) return { tag_name: tag, assets: [] };
    }
  } catch {}

  return {};
}

export function downloadBinary(url: string, dest: string, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Terlalu banyak redirect'));
      return;
    }
    const req = https.get(url, (res) => {
      const status = res.statusCode || 0;

      // 301/302/307: ikuti Location (aset GitHub selalu redirect ke CDN).
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        downloadBinary(new URL(res.headers.location, url).toString(), dest, redirects + 1)
          .then(resolve, reject);
        return;
      }

      // Tanpa cek ini, halaman error (HTML 404) akan menimpa binary dengan sampah.
      if (status !== 200) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      const file = fs.createWriteStream(dest);
      const gagal = (err: Error) => {
        file.close();
        fs.unlink(dest, () => reject(err));
      };
      res.on('error', gagal);
      file.on('error', gagal);
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        // Unduhan terpotong (koneksi putus) tidak boleh dipasang.
        const expected = Number(res.headers['content-length'] ?? 0);
        try {
          const actual = fs.statSync(dest).size;
          if (expected > 0 && actual !== expected) {
            return fs.unlink(dest, () => reject(new Error(`Ukuran tidak cocok (${actual}/${expected} byte)`)));
          }
        } catch (err) {
          return reject(err as Error);
        }
        resolve();
      }));
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error('Timeout')));
  });
}

export async function runUpdate(currentVersion: string): Promise<void> {
  let isEn = false;
  try {
    const { readConfig } = await import('../core/config');
    isEn = readConfig().settings.language === 'en';
  } catch {}

  const t = getTheme();
  console.log(`\n${t.accent}${isEn ? 'Checking for JACK-AGENT updates...' : 'Mengecek pembaruan JACK-AGENT...'}${t.reset}`);

  let release;
  try {
    release = await getLatestRelease();
  } catch (err) {
    console.error(`\n${t.error}✗ ${isEn ? 'Failed to check for updates.' : 'Gagal mengecek pembaruan.'}${t.reset}\n`);
    process.exit(1);
  }

  const latestVersion = release.tag_name?.replace(/^v/, '');
  
  if (!latestVersion) {
    console.log(`\n${t.error}✗ ${isEn ? 'Version information not found.' : 'Informasi versi tidak ditemukan.'}${t.reset}\n`);
    process.exit(1);
  }

  if (latestVersion === currentVersion) {
    console.log(`\n${A.green}✓ ${isEn ? `You are already using the latest version (v${currentVersion}).` : `Anda sudah menggunakan versi terbaru (v${currentVersion}).`}${t.reset}\n`);
    process.exit(0);
  }

  // Jangan pernah menurunkan versi: rilis terakhir bisa lebih lama dari build lokal.
  if (!isNewer(latestVersion, currentVersion)) {
    console.log(`\n${A.green}✓ ${isEn ? `Your version (v${currentVersion}) is newer than the latest release (v${latestVersion}).` : `Versi Anda (v${currentVersion}) lebih baru dari rilis terakhir (v${latestVersion}).`}${t.reset}\n`);
    process.exit(0);
  }

  console.log(`${t.dim}${isEn ? 'Latest version:' : 'Versi terbaru:'} v${latestVersion} (${isEn ? 'Currently:' : 'Saat ini:'} v${currentVersion})${t.reset}`);

  // PRD F10: minta konfirmasi sebelum mengganti binary. Non-TTY menjawab "tidak".
  const lanjut = await askUser(isEn ? `Update to v${latestVersion} now? (y/n)` : `Perbarui ke v${latestVersion} sekarang? (y/n)`);
  if (!lanjut) {
    console.log(`\n${t.dim}${isEn ? 'Update cancelled.' : 'Pembaruan dibatalkan.'}${t.reset}\n`);
    process.exit(0);
  }

  // Cek apakah di-install lewat NPM. Satu-satunya penanda yang benar adalah
  // process.pkg: pengecekan `execPath.includes('node')` juga cocok untuk
  // binary standalone yang dipasang di path berisi "node".
  // @ts-ignore
  const isNpm = !process.pkg;

  if (isNpm) {
    console.log(`\n${t.accent}${isEn ? 'Updating via NPM...' : 'Memperbarui melalui NPM...'}${t.reset}`);
    try {
      execSync(`npm install -g ${NPM_PKG}@latest`, { stdio: 'inherit' });
      console.log(`\n${A.green}✓ ${isEn ? `Successfully updated to v${latestVersion}!` : `Berhasil diperbarui ke v${latestVersion}!`}${t.reset}\n`);
    } catch (err) {
      console.error(`\n${t.error}✗ ${isEn ? 'Failed to update via NPM. Please run manually:' : 'Gagal memperbarui via NPM. Silakan jalankan manual:'}${t.reset}`);
      console.log(`  npm install -g ${NPM_PKG}@latest\n`);
    }
    process.exit(0);
  }

  // Jika standalone binary (pkg)
  const platform = process.platform;
  const arch = process.arch;
  let assetName = '';
  
  if (platform === 'linux' && arch === 'x64') assetName = 'jack-linux-x64';
  else if (platform === 'linux' && arch === 'arm64') assetName = 'jack-linux-arm64';
  else if (platform === 'darwin' && arch === 'x64') assetName = 'jack-macos-x64';
  else if (platform === 'darwin' && arch === 'arm64') assetName = 'jack-macos-arm64';
  else if (platform === 'win32' && arch === 'x64') assetName = 'jack-win-x64.exe';
  
  if (!assetName) {
    console.log(`\n${t.error}✗ ${isEn ? 'This OS/architecture does not have an automatic precompiled binary.' : 'Sistem operasi/arsitektur ini tidak memiliki precompiled binary otomatis.'}${t.reset}`);
    console.log(`  npm install -g ${NPM_PKG}@latest\n`);
    process.exit(1);
  }

  const asset = release.assets?.find((a: any) => a.name === assetName);
  if (!asset) {
    console.log(`\n${t.error}✗ ${isEn ? `Release v${latestVersion} does not provide a file for this system.` : `Rilis v${latestVersion} tidak menyediakan file untuk sistem ini.`}${t.reset}`);
    console.log(`  npm install -g ${NPM_PKG}@latest\n`);
    process.exit(1);
  }

  console.log(`\n${t.accent}${isEn ? `Downloading jack v${latestVersion}...` : `Mengunduh jack v${latestVersion}...`}${t.reset}`);
  const tmpPath = path.join(os.tmpdir(), assetName + '.tmp');
  const destPath = process.execPath;

  try {
    await downloadBinary(asset.browser_download_url, tmpPath);
    if (platform !== 'win32') {
      fs.chmodSync(tmpPath, 0o755);
    }
  } catch (err) {
    fs.unlink(tmpPath, () => {});
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`\n${t.error}✗ ${isEn ? `Failed to download update (${detail}).` : `Gagal mengunduh pembaruan (${detail}).`}${t.reset}\n`);
    process.exit(1);
  }

  try {
    if (platform === 'win32') {
      const oldPath = destPath + '.old';
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      fs.renameSync(destPath, oldPath);
      fs.renameSync(tmpPath, destPath);
    } else {
      fs.renameSync(tmpPath, destPath);
    }
    console.log(`\n${A.green}✓ ${isEn ? `Successfully updated to v${latestVersion}!` : `Berhasil diperbarui ke v${latestVersion}!`}${t.reset}`);
    console.log(`${isEn ? 'Please restart the "jack" command.' : 'Silakan jalankan ulang perintah "jack".'}\n`);
  } catch (err) {
    console.error(`\n${t.error}✗ ${isEn ? 'Failed to replace binary file (may need Admin/Sudo access).' : 'Gagal mengganti file binary (mungkin butuh akses Admin/Sudo).'}${t.reset}`);
    console.error(`${isEn ? 'Please replace the file manually at:' : 'Silakan ganti manual file di:'} ${destPath}\n`);
  }
  process.exit(0);
}
