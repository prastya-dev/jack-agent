# ============================================================
# JACK-AGENT Install Script (Windows - PowerShell - Direct Download)
# ============================================================

try {
    $Repo = "prastya-dev/JACK_AGENT"
    $BinName = "jack.exe"
    $InstallDir = "$env:LOCALAPPDATA\jack"

    Write-Host ""
    Write-Host "  JACK-AGENT Installer" -ForegroundColor Cyan
    Write-Host "  by prastya-dev" -ForegroundColor DarkGray
    Write-Host ""
    
    # Pilih Bahasa / Select Language (Arrow Keys)
    function Select-Language {
        $options = @("English", "Bahasa Indonesia")
        $selected = 1 # Default: Bahasa Indonesia

        try {
            $origCursor = $Host.UI.RawUI.CursorVisible
            $Host.UI.RawUI.CursorVisible = $false

            function Render-Menu {
                param($sel)
                for ($i = 0; $i -lt $options.Length; $i++) {
                    if ($i -eq $sel) {
                        Write-Host "  ▶ $($options[$i])" -ForegroundColor Cyan
                    } else {
                        Write-Host "    $($options[$i])" -ForegroundColor DarkGray
                    }
                }
            }

            Write-Host "  Select Language / Pilih Bahasa:" -ForegroundColor White
            Render-Menu $selected

            while ($true) {
                $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
                if ($key.VirtualKeyCode -eq 38) { # Up arrow
                    $selected = ($selected - 1 + $options.Length) % $options.Length
                } elseif ($key.VirtualKeyCode -eq 40) { # Down arrow
                    $selected = ($selected + 1) % $options.Length
                } elseif ($key.VirtualKeyCode -eq 13) { # Enter
                    break
                } elseif ($key.Character -eq '1') {
                    $selected = 0
                    break
                } elseif ($key.Character -eq '2') {
                    $selected = 1
                    break
                } else {
                    continue
                }

                $pos = $Host.UI.RawUI.CursorPosition
                $pos.Y = [Math]::Max(0, $pos.Y - 2)
                $Host.UI.RawUI.CursorPosition = $pos
                Render-Menu $selected
            }

            $Host.UI.RawUI.CursorVisible = $origCursor
            return ($selected -eq 0)
        } catch {
            return $false
        }
    }

    $IsEn = Select-Language

    # Pastikan PowerShell menggunakan TLS 1.2 (wajib untuk GitHub)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # Set User-Agent agar tidak diblokir GitHub API (menghindari error 403)
    $headers = @{
        "User-Agent" = "JACK-AGENT-Installer"
    }

    if ($IsEn) { Write-Host "  -> Fetching latest release from GitHub..." -ForegroundColor Cyan }
    else { Write-Host "  -> Mencari rilis versi terbaru di GitHub..." -ForegroundColor Cyan }
    
    $apiUrl = "https://api.github.com/repos/$Repo/releases/latest"
    $response = Invoke-RestMethod -Uri $apiUrl -Headers $headers -UseBasicParsing
    $Version = $response.tag_name

    # Direct Link ke versi rilis terbaru
    $BinaryUrl = "https://github.com/$Repo/releases/latest/download/jack-win-x64.exe"
    $TmpPath   = [System.IO.Path]::GetTempFileName() + ".exe"

    if ($IsEn) { Write-Host "  -> Downloading jack $Version for Windows..." -ForegroundColor Cyan }
    else { Write-Host "  -> Mengunduh jack $Version untuk Windows..." -ForegroundColor Cyan }
    
    Invoke-WebRequest -Uri $BinaryUrl -OutFile $TmpPath -Headers $headers -UseBasicParsing

    # Proses Instalasi Biner
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $DestPath = Join-Path $InstallDir $BinName
    Move-Item -Path $TmpPath -Destination $DestPath -Force

    # Tambahkan ke Environment PATH
    $CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($CurrentPath -notlike "*$InstallDir*") {
        if ($IsEn) { Write-Host "  -> Adding $InstallDir to Environment PATH..." -ForegroundColor Cyan }
        else { Write-Host "  -> Menambahkan $InstallDir ke Environment PATH..." -ForegroundColor Cyan }
        [Environment]::SetEnvironmentVariable("PATH", "$CurrentPath;$InstallDir", "User")
        if ($IsEn) { Write-Host "  v PATH updated successfully." -ForegroundColor Green }
        else { Write-Host "  v PATH berhasil diupdate." -ForegroundColor Green }
    }

    # Menambahkan opsi Context Menu (Run JACK Here)
    if ($IsEn) { Write-Host "  -> Adding 'Run JACK Here' to folder context menu..." -ForegroundColor Cyan }
    else { Write-Host "  -> Menambahkan opsi 'Run JACK Here' ke klik-kanan folder..." -ForegroundColor Cyan }
    
    # Download icon for Context Menu
    $IconUrl = "https://raw.githubusercontent.com/$Repo/main/jack.ico"
    $IconPath = Join-Path $InstallDir "jack.ico"
    try {
        Invoke-WebRequest -Uri $IconUrl -OutFile $IconPath -Headers $headers -UseBasicParsing
    } catch {
        $IconPath = $DestPath
    }

    # Buat launcher script agar wt.exe (Windows Terminal) diprioritaskan
    $LauncherPath = Join-Path $InstallDir "jack-here.cmd"
    Set-Content -Path $LauncherPath -Value "@echo off`nwt.exe -d `"%~1`" cmd.exe /k jack 2>nul || start /d `"%~1`" cmd.exe /k jack"

    # 1. Background File Explorer (Klik kanan di ruang kosong explorer)
    $RegBgShell = "HKCU:\Software\Classes\Directory\Background\shell\JACK"
    New-Item -Path $RegBgShell -Force | Out-Null
    Set-ItemProperty -Path $RegBgShell -Name "(Default)" -Value "Run JACK Here" -Force
    Set-ItemProperty -Path $RegBgShell -Name "Icon" -Value "`"$IconPath`"" -Force
    New-Item -Path "$RegBgShell\command" -Force | Out-Null
    Set-ItemProperty -Path "$RegBgShell\command" -Name "(Default)" -Value "`"$LauncherPath`" `"%V`"" -Force

    # 2. Directory (Klik kanan pada sebuah folder)
    $RegDirShell = "HKCU:\Software\Classes\Directory\shell\JACK"
    New-Item -Path $RegDirShell -Force | Out-Null
    Set-ItemProperty -Path $RegDirShell -Name "(Default)" -Value "Run JACK Here" -Force
    Set-ItemProperty -Path $RegDirShell -Name "Icon" -Value "`"$IconPath`"" -Force
    New-Item -Path "$RegDirShell\command" -Force | Out-Null
    Set-ItemProperty -Path "$RegDirShell\command" -Name "(Default)" -Value "`"$LauncherPath`" `"%1`"" -Force

    if ($IsEn) { Write-Host "  v Context Menu added successfully." -ForegroundColor Green }
    else { Write-Host "  v Context Menu berhasil ditambahkan." -ForegroundColor Green }

    if ($IsEn) { Write-Host "  v jack installed successfully to $DestPath" -ForegroundColor Green }
    else { Write-Host "  v jack berhasil diinstal ke $DestPath" -ForegroundColor Green }
    
    Write-Host ""
    if ($IsEn) {
        Write-Host "  🎉 INSTALLATION COMPLETE!" -ForegroundColor Green
        Write-Host "  Installation complete, please close this tab and try 'jack' in your terminal." -ForegroundColor White
    } else {
        Write-Host "  🎉 INSTALASI SELESAI!" -ForegroundColor Green
        Write-Host "  Instalasi selesai silahkan close tab ini dan coba di terminal anda jack" -ForegroundColor White
    }
    Write-Host ""

} catch {
    Write-Host ""
    if ($IsEn) { Write-Host "  ❌ ERROR DURING INSTALLATION:" -ForegroundColor Red }
    else { Write-Host "  ❌ TERJADI ERROR SAAT INSTALASI:" -ForegroundColor Red }
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
} finally {
    Write-Host "========================================" -ForegroundColor DarkGray
    if ($IsEn) { Read-Host "Press [ENTER] to close this window" }
    else { Read-Host "Tekan [ENTER] untuk menutup jendela ini" }
}
