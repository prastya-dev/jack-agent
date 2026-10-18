# JACK-AGENT — TASKS

> **Wajib dibaca bersama `PRD.md`.** Lihat `PRD.md` § 0 (Mandatory Agent Protocol) untuk aturan lengkap.
>
> **Ringkasan aturan:**
> 1. Baca `PRD.md` + `TASKS.md` sebelum mengubah kode apa pun.
> 2. Kerjakan task dari **Backlog** sesuai prioritas; jangan duplikasi task yang sudah ada.
> 3. Setiap pekerjaan selesai → **pindahkan** ke **Riwayat Selesai** dengan format yang sama.
> 4. Perubahan perilaku → update juga `PRD.md` + baris `Changelog PRD`.
> 5. Naikkan versi di `package.json` untuk rilis; sinkronkan tag `vX.Y.Z`.
>
> **Status:** `Todo` · `Doing` · `Blocked` · `Done`
> **Prioritas:** `P0` (kritis) · `P1` (tinggi) · `P2` (sedang) · `P3` (rendah)

---

## Backlog

### T-001 — Tambahkan test otomatis minimal
- **Status:** Todo · **Prioritas:** P1 · **Ref:** PRD § 11 R-3
- **Konteks:** Saat ini nol test. `tsconfig` belum punya test setup.
- **Cakupan:**
  - `src/exec/parser.ts` — `extractCommand`: JSON valid, JSON terpotong (fallback regex), blok tanpa penutup, ```` ```json ```` biasa, teks tanpa blok.
  - `src/api/prompt.ts` — `buildSystemPrompt` mengisi keempat placeholder; `buildContents` menyuntikkan system prompt hanya ke pesan user pertama.
  - Fallback ordering di `sendMessage` — model famili sama didahulukan.
- **Aturan:** pakai test runner bawaan Node (`node:test` + `node:assert`) — **jangan** tambah dependency. Tambah script `npm test` = `tsc && node --test dist/**/*.test.js`.
- **Acceptance:** `npm test` lulus; minimal 12 assertion yang menguji cabang berbeda.
- **Verifikasi:** jalankan `npm test`, tempel output ke Riwayat Selesai.

### T-002 — Satukan installer: hapus `install.sh` di root
- **Status:** Todo · **Prioritas:** P1 · **Ref:** PRD § 3.1
- **Konteks:** `install.sh` di root repo berisi bootstrap **proyek lain** (Hermes Agent / NousResearch) dan tidak dilacak git. `scripts/install.sh` (262 baris) adalah installer JACK yang benar.
- **Perubahan:** hapus `install.sh` di root. Pastikan `scripts/install.sh` sudah menangani kasus yang disebut di README.
- **Acceptance:** `git status` bersih untuk file tersebut; README masih mengarah ke `scripts/install.sh` (sudah benar).
- **Catatan:** hapus `iucon.pdf` (tidak dilacak, tampak sisa) — konfirmasi ke pemilik repo sebelum menghapus.

### T-003 — Perbaiki `web/index.html`
- **Status:** Todo · **Prioritas:** P2 · **Ref:** PRD § 3.1
- **Konteks:** `web/index.html` berisi halaman **"Vanilla Bakery"** (template toko roti) — tidak ada hubungannya dengan JACK.
- **Perubahan:** ganti dengan landing page minimal JACK (banner, satu perintah `curl ... | bash`, tautan GitHub/NPM), atau hapus file bila tidak ada yang mereferensikannya.
- **Acceptance:** tidak ada konten bakery tersisa; file valid HTML5.

### T-004 — Tegakkan deteksi perintah berbahaya
- **Status:** Todo · **Prioritas:** P0 · **Ref:** PRD § F4.8, § 7
- **Konteks:** `isDangerousCommand()` di `src/exec/runner.ts` tidak pernah dipanggil. `settings.confirm_danger_commands` ada di config tetapi tidak berpengaruh.
- **Perubahan:**
  - Di `sendMessage` (blok `if (confirmed)`), panggil `isDangerousCommand(command)`.
  - Bila true → tampilkan peringatan merah tambahan di `showConfirmDialog` (atau dialog konfirmasi kedua) yang menyebut pola berbahaya yang cocok.
  - Hormati `settings.confirm_danger_commands`: bila `false`, **tetap** minta konfirmasi (invariant I-3) — flag hanya mengontrol tingkat peringatan, bukan melewati dialog.
- **Acceptance:** mengirim permintaan yang menghasilkan `rm -rf /` memunculkan peringatan eksplisit sebelum dialog Ya/Tidak.
- **Verifikasi:** jalankan manual di mode exec, sertakan tangkapan layar/output.

### T-005 — Refresh token di dalam loop fallback
- **Status:** Todo · **Prioritas:** P0 · **Ref:** PRD § 8 butir 1
- **Konteks:** `accessToken` diambil sekali di `sendMessage` sebelum loop `for (const modelId of modelsToTry)`.
- **Perubahan:** pindahkan akuisisi token ke dalam blok `try`, dengan `await ensureValidToken()` sebelum setiap percobaan (murah: hanya request jaringan bila mendekati expiry). Lakukan hal yang sama pada `requestJson` di `client.ts` yang membaca token sekali.
- **Acceptance:** fallback setelah token kedaluwarsa tetap berhasil.
- **Verifikasi:** sulit direproduksi manual — minimal uji dengan memaksa `expiry_date` di config ke masa lalu di tengah sesi.

### T-006 — Dukungan macOS pada integrasi OS
- **Status:** Todo · **Prioritas:** P2 · **Ref:** PRD § F11, § 11 R-4
- **Konteks:** `setupOSIntegrations()` hanya menangani `win32` dan `linux`; macOS memunculkan pesan "belum didukung".
- **Perubahan:** tambahkan `setupMacos()` di `src/core/setup.ts` — Quick Action / Service via `~/Library/Services`, atau minimal alias shell + ikon `.icns`.
- **Acceptance:** di macOS, `jack --setup` tidak lagi menampilkan pesan "belum didukung".

### T-007 — Tambah `/pwd`
- **Status:** Todo · **Prioritas:** P3 · **Ref:** PRD § 11 R-5
- **Perubahan:** tambah case `/pwd` di `src/commands/slash.ts` yang mencetak `state.currentDir`; tambahkan barisnya di `handleHelp()`.
- **Acceptance:** `/pwd` mencetak CWD aktif; `/help` menampilkannya.

### T-008 — Keluarkan `maxOutputTokens` ke config
- **Status:** Todo · **Prioritas:** P3 · **Ref:** PRD § 11 R-6
- **Perubahan:** tambah `max_output_tokens` ke `SettingsConfig` + `DEFAULT_SETTINGS`, pakai di `GENERATION_CONFIG` saat build payload.
- **Catatan:** validasi nilai (integer > 0); jangan tambah UI pengaturan — cukup dukung edit `config.json`.

### T-009 — Rombak i18n modul lama
- **Status:** Todo · **Prioritas:** P3 · **Ref:** PRD § 2.4 butir 5
- **Konteks:** `updater.ts`, `wizard.ts`, dan `runUninstall` sudah i18n (`settings.language`); `commands/slash.ts`, `ui/confirm.ts`, `ui/banner.ts`, `ui/statusbar.ts`, `exec/runner.ts` masih hardcoded Indonesia.
- **Perubahan:** satu helper kecil (`t(key)` atau peta `{ id, en }`) — **jangan** tambah library i18n.
- **Acceptance:** mengeset `language: "en"` membuat seluruh output pengguna berbahasa Inggris.

### T-010 — Perbaiki default `selectedModel` di `state.ts`
- **Status:** Todo · **Prioritas:** P3 · **Ref:** PRD § 8 butir 7
- **Perubahan:** ubah default `selectedModel` di `StateManager` menjadi `DEFAULT_MODEL` dari `constants.ts` (impor), atau kosongkan dan wajibkan bootstrap mengisinya.
- **Acceptance:** tidak ada lagi string model hardcoded yang berbeda dari `constants.ts`.

---

## Sedang Dikerjakan (Doing)

_(kosong)_

---

## Blocked

_(kosong)_

---

## Riwayat Selesai

### [v1.1.9] — 2026-10-18 — Rename produk `jckw` → `jack`
- **Ringkasan:** Seluruh nama produk diganti dari `jckw`/`JCKW` menjadi `jack`/`JACK`: perintah CLI (`bin.jack`), paket NPM `@prastya-dev/jack-agent`, repo `prastya-dev/JACK_AGENT`, aset rilis `jack-linux-x64` / `jack-macos-x64` / `jack-win-x64.exe`, ikon `jack.ico`, registry Windows `HKCU\Software\Classes\Directory[\Background]\shell\JACK` (label "Run JACK Here"), `jack.desktop` / `jack.png` / aksi KDE `runJack`, domain banner `jack-agent.dhyy.cloud`, banner ASCII + logo wizard di-rakit ulang menjadi "JACK AGENT" (lebar tetap 30 kolom), dan identifier kode (`JackConfig`, `JackState`).
- **Config:** folder pindah ke `~/.config/jack` / `%APPDATA%\jack`, dengan migrasi otomatis sekali jalan dari folder lama `jckw` bila folder baru belum ada, sehingga pengguna versi lama tidak perlu login ulang.
- **File diubah:** `package.json`, `package-lock.json` (nama + versi 1.1.9), `jckw.ico` → `jack.ico` (rename), `.github/workflows/release.yml`, `README.md`, `PRD.md` (§ 3.3 + Changelog), `AGENTS.md`, `scripts/install.sh`, `scripts/install.ps1`, `scripts/uninstall.ps1`, seluruh `src/**/*.ts` (`config.ts` juga dapat fungsi `migrateLegacyConfigDir`, `banner.ts` art baru, `wizard.ts` logo + registry).
- **Verifikasi:**
  - `npm run build` → bersih, `tsc` tanpa error.
  - `node dist/index.js --version` → `JACK-AGENT v1.1.9`.
  - `renderBanner()` → 3 baris "JACK AGENT", tiap baris 30 kolom (identik dengan lebar versi lama).
  - Migrasi config: `HOME=<tmp>` dengan `.config/jckw/config.json` → `getConfigPath()` mengembalikan `…/jack/config.json`, `configExists()=true`, isi terbaca, folder `jckw` sudah hilang.
  - `grep -ri jckw` pada seluruh file ter-track + `PRD.md`/`TASKS.md`/`AGENTS.md` → 0 hasil.
- **Belum diverifikasi (butuh akun Google / rilis published):** login OAuth, chat/exec, `jack --update`, `jack --setup` OS integration.
- **Langkah manual di luar repo (belum dikerjakan):** rename repo GitHub `JCKW_AGENT` → `JACK_AGENT`, publish paket NPM `@prastya-dev/jack-agent`, deprecate `@prastya-dev/jckw-agent`, dan push tag `v1.1.9` untuk memicu workflow release.

### [v1.1.8] — 2026-10-16 — Pembuatan PRD dan TASKS (dokumentasi)
- **Ringkasan:** Membuat `PRD.md` (dokumen produk hidup: protokol agent wajib, arsitektur, 13 grup fitur, kontrak system prompt, state machine mode, keamanan, batasan, invariant, panduan kontribusi, roadmap, changelog) dan `TASKS.md` (papan task: 10 item backlog + riwayat ini).
- **File diubah:** `PRD.md` (baru), `TASKS.md` (baru).
- **Verifikasi:** tidak ada perubahan kode; tidak ada perilaku runtime yang terpengaruh. Isi PRD diverifikasi terhadap pembacaan langsung seluruh 20 file di `src/` pada commit `ce4ec66`.
- **Temuan yang didokumentasikan (dijadikan backlog):** `isDangerousCommand` tidak terpakai (T-004); token diambil sekali sebelum loop fallback (T-005); `install.sh` di root berisi bootstrap proyek lain (T-002); `web/index.html` berisi template bakery (T-003); nol test (T-001).

### [v1.1.8] — 2026-10-16 — Debug updater
- **Ringkasan:** Perbaikan bug pada alur self-update.
- **File diubah:** `src/core/updater.ts`.
- **Verifikasi:** *(diisi oleh penulis perubahan — lihat commit `ce4ec66`)*.
- **Catatan:** entri direkonstruksi dari riwayat git; isi verifikasi tidak tercatat.
