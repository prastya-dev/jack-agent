import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { getTheme } from '../ui/theme';

// ============================================================
// JACK-AGENT — OS Integration Setup
// Handles Context Menu & Application Launcher generation
// ============================================================

export async function setupOSIntegrations(): Promise<void> {
  const t = getTheme();
  const platform = os.platform();
  const packageDir = path.join(__dirname, '..', '..');
  const iconPngPath = path.join(packageDir, 'icon.png');
  const iconIcoPath = path.join(packageDir, 'jack.ico');

  console.log(`\n${t.dim}Mempersiapkan OS Integrations...${t.reset}`);

  try {
    if (platform === 'win32') {
      await setupWindows(iconIcoPath, t);
    } else if (platform === 'linux') {
      await setupLinux(iconPngPath, t);
    } else {
      console.log(`\n${t.warn}  ! OS Anda (${platform}) saat ini belum didukung untuk fitur Auto-Setup shortcut.${t.reset}\n`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`\n${t.error}  ✗ Gagal melakukan setup: ${msg}${t.reset}\n`);
  }
}

async function setupWindows(iconPath: string, t: any): Promise<void> {
  console.log(`${t.dim}Mendeteksi sistem Windows...${t.reset}`);
  
  const hasIcon = fs.existsSync(iconPath);
  const iconStr = hasIcon ? `"${iconPath}"` : '';

  // Use a reliable command string that attempts wt.exe but falls back to cmd.exe start
  const jackCmd = `cmd.exe /s /c "start /b wt.exe -d \\"%V\\" cmd.exe /k jack 2>nul || start /d \\"%V\\" cmd.exe /k jack"`;
  const jackCmdDir = `cmd.exe /s /c "start /b wt.exe -d \\"%1\\" cmd.exe /k jack 2>nul || start /d \\"%1\\" cmd.exe /k jack"`;

  const addReg = (keyPath: string, cmdValue: string, iconVal: string) => {
    try {
      execSync(`reg add "${keyPath}" /ve /t REG_SZ /d "Run JACK Here" /f`, { stdio: 'ignore' });
      if (iconVal) {
        execSync(`reg add "${keyPath}" /v "Icon" /t REG_SZ /d "${iconVal}" /f`, { stdio: 'ignore' });
      }
      execSync(`reg add "${keyPath}\\command" /ve /t REG_SZ /d "${cmdValue}" /f`, { stdio: 'ignore' });
    } catch (e) {
      throw new Error(`Gagal menulis Registry Key: ${keyPath}`);
    }
  };

  // 1. Background File Explorer
  addReg(`HKCU\\Software\\Classes\\Directory\\Background\\shell\\JACK`, jackCmd.replace(/%1/g, '%V'), iconStr);
  
  // 2. Directory
  addReg(`HKCU\\Software\\Classes\\Directory\\shell\\JACK`, jackCmdDir, iconStr);

  console.log(`${t.accentBg}\x1b[30m ✓ Windows Context Menu (Run JACK Here) berhasil ditambahkan! ${t.reset}\n`);
}

async function setupLinux(iconPath: string, t: any): Promise<void> {
  console.log(`${t.dim}Mendeteksi sistem Linux...${t.reset}`);
  
  const home = os.homedir();
  
  // Create dirs
  const iconDir = path.join(home, '.local/share/icons/hicolor/256x256/apps');
  const appDir = path.join(home, '.local/share/applications');
  const kdeDir = path.join(home, '.local/share/kio/servicemenus');
  const fmDir = path.join(home, '.local/share/file-manager/actions');

  [iconDir, appDir, kdeDir, fmDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // Copy Icon
  const targetIcon = path.join(iconDir, 'jack.png');
  if (fs.existsSync(iconPath)) {
    fs.copyFileSync(iconPath, targetIcon);
  }

  // 1. App Launcher Shortcut
  const appDesktop = `[Desktop Entry]
Name=JACK Agent
Comment=AI CLI Terminal Interface
Exec=jack
Icon=jack
Terminal=true
Type=Application
Categories=Utility;Development;TerminalEmulator;
`;
  fs.writeFileSync(path.join(appDir, 'jack.desktop'), appDesktop);

  // 2. KDE/Dolphin Context Menu
  const kdeDesktop = `[Desktop Entry]
Type=Service
ServiceTypes=KonqPopupMenu/Plugin
MimeType=inode/directory;
Actions=runJack;
X-KDE-Priority=TopLevel

[Desktop Action runJack]
Name=Run JACK Here
Icon=jack
Exec=konsole --workdir %f -e jack || gnome-terminal --working-directory=%f -- jack || xterm -e "cd %f && jack"
`;
  fs.writeFileSync(path.join(kdeDir, 'jack.desktop'), kdeDesktop);

  // 3. Nautilus/Nemo Context Menu
  const fmDesktop = `[Desktop Entry]
Type=Action
Name=Run JACK Here
Icon=jack
Profiles=profile-zero;

[X-Action-Profile profile-zero]
Exec=gnome-terminal --working-directory=%f -- jack || konsole --workdir %f -e jack || xterm -e "cd %f && jack"
Name=Default profile
`;
  fs.writeFileSync(path.join(fmDir, 'jack.desktop'), fmDesktop);

  console.log(`${t.accentBg}\x1b[30m ✓ Linux Desktop Shortcut & Context Menu berhasil ditambahkan! ${t.reset}\n`);
}
