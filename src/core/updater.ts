import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { getTheme, A } from '../ui/theme';

const REPO = 'prastya-dev/JCKW_AGENT';
const NPM_PKG = '@prastya-dev/jckw-agent';

function fetchJson(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const apiUrl = new URL(urlStr);
    const options: https.RequestOptions = {
      hostname: apiUrl.hostname,
      path: `${apiUrl.pathname}${apiUrl.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'JCKW-AGENT-Updater'
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

function downloadBinary(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirect
        return downloadBinary(res.headers.location as string, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

export async function runUpdate(currentVersion: string): Promise<void> {
  let isEn = false;
  try {
    const { readConfig } = await import('../core/config');
    isEn = readConfig().settings.language === 'en';
  } catch {}

  const t = getTheme();
  console.log(`\n${t.accent}${isEn ? 'Checking for JCKW-AGENT updates...' : 'Mengecek pembaruan JCKW-AGENT...'}${t.reset}`);

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

  console.log(`${t.dim}${isEn ? 'Latest version:' : 'Versi terbaru:'} v${latestVersion} (${isEn ? 'Currently:' : 'Saat ini:'} v${currentVersion})${t.reset}`);

  // Cek apakah di-install lewat NPM
  // @ts-ignore
  const isNpm = process.execPath.includes('node') || !process.pkg;
  
  if (isNpm) {
    console.log(`\n${t.accent}${isEn ? 'Updating via NPM...' : 'Memperbarui melalui NPM...'}${t.reset}`);
    try {
      execSync('npm install -g @prastya-dev/jckw-agent@latest', { stdio: 'inherit' });
      console.log(`\n${A.green}✓ ${isEn ? `Successfully updated to v${latestVersion}!` : `Berhasil diperbarui ke v${latestVersion}!`}${t.reset}\n`);
    } catch (err) {
      console.error(`\n${t.error}✗ ${isEn ? 'Failed to update via NPM. Please run manually:' : 'Gagal memperbarui via NPM. Silakan jalankan manual:'}${t.reset}`);
      console.log(`  npm install -g @prastya-dev/jckw-agent@latest\n`);
    }
    process.exit(0);
  }

  // Jika standalone binary (pkg)
  const platform = process.platform;
  const arch = process.arch;
  let assetName = '';
  
  if (platform === 'linux' && arch === 'x64') assetName = 'jckw-linux-x64';
  else if (platform === 'darwin' && arch === 'x64') assetName = 'jckw-macos-x64';
  else if (platform === 'win32' && arch === 'x64') assetName = 'jckw-win-x64.exe';
  
  if (!assetName) {
    console.log(`\n${t.error}✗ ${isEn ? 'This OS/architecture does not have an automatic precompiled binary.' : 'Sistem operasi/arsitektur ini tidak memiliki precompiled binary otomatis.'}${t.reset}\n`);
    process.exit(1);
  }

  const asset = release.assets?.find((a: any) => 
    a.name === assetName || 
    a.name === assetName.replace('-x64', '') || 
    a.name === assetName.replace('-x64.exe', '.exe')
  );
  if (!asset) {
    console.log(`\n${t.error}✗ ${isEn ? `Release v${latestVersion} does not provide a file for this system.` : `Rilis v${latestVersion} tidak menyediakan file untuk sistem ini.`}${t.reset}\n`);
    process.exit(1);
  }

  console.log(`\n${t.accent}${isEn ? `Downloading jckw v${latestVersion}...` : `Mengunduh jckw v${latestVersion}...`}${t.reset}`);
  const tmpPath = path.join(os.tmpdir(), assetName + '.tmp');
  const destPath = process.execPath;

  try {
    await downloadBinary(asset.browser_download_url, tmpPath);
    if (platform !== 'win32') {
      fs.chmodSync(tmpPath, 0o755);
    }
  } catch (err) {
    console.error(`\n${t.error}✗ ${isEn ? 'Failed to download update.' : 'Gagal mengunduh pembaruan.'}${t.reset}\n`);
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
    console.log(`${isEn ? 'Please restart the "jckw" command.' : 'Silakan jalankan ulang perintah "jckw".'}\n`);
  } catch (err) {
    console.error(`\n${t.error}✗ ${isEn ? 'Failed to replace binary file (may need Admin/Sudo access).' : 'Gagal mengganti file binary (mungkin butuh akses Admin/Sudo).'}${t.reset}`);
    console.error(`${isEn ? 'Please replace the file manually at:' : 'Silakan ganti manual file di:'} ${destPath}\n`);
  }
  process.exit(0);
}
