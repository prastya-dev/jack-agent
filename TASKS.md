# JACK-AGENT — TASKS

> **Wajib dibaca bersama `PRD.md` dan `optimize.md`.** Lihat `PRD.md` § 0 (Mandatory Agent Protocol) untuk aturan lengkap.
>
> **Ringkasan aturan:**
> 1. Baca `PRD.md` + `TASKS.md` + `optimize.md` sebelum mengubah kode apa pun.
> 2. Kerjakan task dari **Backlog** sesuai prioritas; jangan duplikasi task yang sudah ada.
> 3. Setiap pekerjaan selesai → **pindahkan** ke **Riwayat Selesai** dengan format yang sama.
> 4. Perubahan perilaku → update juga `PRD.md` + baris `Changelog PRD`.
> 5. Naikkan versi di `package.json` untuk rilis; sinkronkan tag `vX.Y.Z`.
>
> **Status:** `Todo` · `Doing` · `Blocked` · `Done`
> **Prioritas:** `P0` (kritis) · `P1` (tinggi) · `P2` (sedang) · `P3` (rendah)

---

## Rencana Rilis

| Versi | Isi | Sumber |
| :--- | :--- | :--- |
| **1.2.0** | ✅ **Selesai 2026-10-19.** Fitur besar: provider custom (OpenAI-compatible), satu mode agentik, system prompt v2, skills, hemat token (pemotongan output + `/compact`), config v1.2.0 + migrasi. **Plus** `O-01` (non-TTY) dan `O-14` (`jack -p`). Task: **T-011 … T-020** (lihat Riwayat Selesai). | `PRD.md` v1.2.0 |
| **1.2.1** | Optimasi ukuran/kecepatan/portabilitas/stabilitas + Mikrotik. Item: **`O-08`…`O-10`, `O-13`, `O-15`, `O-16`** + audit ulang `O-07`/`O-11`. (`O-01`, `O-03`, `O-14` selesai di 1.2.0; `O-02` selesai 2026-10-23 bersama perbaikan updater; `O-04`, `O-05`, `O-06` hilang bersama kode lama — lihat `optimize.md` § 0 & § 9.) | `optimize.md` |
| 1.3.0 | Usulan yang belum disetujui: `JACK.md`, `--dry-run`, tampilan token (PRD § 11 R-7, R-8, R-10). | `PRD.md` § 11.2 |

**Urutan kerja yang disarankan (1.2.0):** T-017 (skema config + migrasi) → T-011 (provider antigravity dipindah ke adapter) → T-012 (adapter openai) → T-013 (loop agentik + guard) → T-016 (hemat token) → T-014 (prompt v2) → T-015 (skills) → T-018 (CLI/slash + O-01 + O-14 + `--allow-write`) → T-019 (test) → T-020 (wizard + dokumentasi).

> **Catatan penjadwalan (keputusan pemilik, 2026-10-18):** fitur naik lebih dulu di 1.2.0, optimasi menyusul di 1.2.1. Tiga konsekuensi yang sudah diputuskan:
> 1. **`O-01` dan `O-14` dipindahkan ke 1.2.0** sebagai bagian T-018. Alasannya: `T-013` (loop agentik + klasifikasi izin) bergantung padanya — jalur non-interaktif adalah cara utama agentik dipakai (SSH, cron, `-p`), `setRawMode` tanpa cek `isTTY` sudah terbukti `TypeError`, dan `PRD.md` § 7.2 menetapkan konfirmasi non-TTY ditolak otomatis (perilaku yang harus diimplementasikan di `confirm.ts`). Karena itu `O-01` **harus** dikerjakan sebelum atau bersamaan `T-013`.
> 2. **`O-03` (deteksi perintah berbahaya) tidak lagi jadi item 1.2.1** — diserap ke T-013 karena klasifikasi izin (PRD § 7.2) adalah pengganti langsungnya. Mengerjakan O-03 terpisah setelah 1.2.0 berarti mengerjakan hal yang sama dua kali.
> 3. **`--allow-write` disetujui masuk 1.2.0** (PRD § 7.2.1): hanya berlaku pada jalur one-shot, mencetak peringatan tebal saat aktif, dan **tidak** membuka pola destruktif.

---

## Backlog

### T-001 — Tambahkan test otomatis minimal
- **Status:** Todo (sebagian selesai via T-019) · **Prioritas:** P1 · **Ref:** PRD § 11 R-3
- **Konteks:** `npm test` (tsc + `node --test dist/*/*.test.js`) sudah ada sejak 1.2.0 dan mencakup guard/output/prompt/SSE/migrasi config. Sisa cakupan: `src/exec/parser.ts` (`extractCommand`: JSON valid, JSON terpotong, blok tanpa penutup, teks tanpa blok).
- **Acceptance:** `npm test` lulus; tiap cabang `exec/parser.ts` punya assertion.
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
- **Status:** **Diserap ke T-013** (1.2.0) · **Prioritas:** — · **Ref:** PRD § F4.8, § 7.2
- **Alasan:** klasifikasi izin berlapis di `src/agent/guard.ts` (auto / konfirmasi / blok) adalah pengganti langsung tugas ini. Perintah destruktif kini **diblok** (bukan sekadar diperingatkan), dan `isDangerousCommand()` dipanggil dari sana. Jangan kerjakan terpisah — hasilnya akan duplikat.
- **Konteks asli (dipertahankan untuk jejak):** `isDangerousCommand()` di `src/exec/runner.ts` tidak pernah dipanggil; `settings.confirm_danger_commands` ada di config tetapi tidak berpengaruh.
- **Yang tetap berlaku dari task ini:** daftar pola berbahaya harus ada **di kode**, bukan hanya di config (PRD § 7.1), dan `settings.confirm_danger_commands` (config lama) dipetakan ke `agent.auto_enabled` saat migrasi (PRD § 3.3).

### T-005 — Refresh token di dalam loop fallback
- **Status:** **Diserap ke T-011** (1.2.0) · **Prioritas:** — · **Ref:** PRD § 8 butir 1
- **Alasan:** `src/api/client.ts` (tempat token diambil sekali sebelum loop) sudah dihapus. Di `src/providers/antigravity.ts` yang baru, `ensureValidToken()` dipanggil **per percobaan model** di dalam loop fallback, jadi bug lama tidak punya tempat lagi. Jalur ini butuh akun Google untuk diuji ulang (lihat catatan verifikasi di Riwayat Selesai v1.2.0).
- **Konteks asli (dipertahankan untuk jejak):** `accessToken` diambil sekali di `sendMessage` sebelum loop `for (const modelId of modelsToTry)`.

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
- **Status:** **Diserap ke T-017** (1.2.0) · **Prioritas:** — · **Ref:** PRD § 8 butir 7, § F7
- **Alasan:** mulai 1.2.0 model disimpan **per provider** (`providers[x].default_model`), sehingga tidak ada lagi satu `selectedModel` global yang bisa berbeda dari `constants.ts`. Perbaikan ini menyatu dengan skema config baru.

---

## Sedang Dikerjakan (Doing)


_(kosong)_

---

## Blocked

_(kosong)_

---

## Riwayat Selesai

### [v1.2.0] — 2026-10-23 — Perbaikan updater + identitas paket (`O-02` ditutup lebih awal)
- **Ringkasan:** `jack update` diperbaiki agar tidak menimpa binary dengan unduhan rusak, tidak salah mendeteksi cara pemasangan, dan tidak menawarkan downgrade. Nama repo di seluruh jalur rilis disamakan dengan repo hasil rename (`prastya-dev/jack-agent`), dan workflow rilis kini menolak tag yang tidak cocok dengan versi paket.
- **File diubah:** `src/core/updater.ts`, `src/core/updater.test.ts` (baru), `package.json`, `scripts/install.sh`, `scripts/install.ps1`, `README.md`, `.github/workflows/release.yml`, `PRD.md` (§ 12 + F10), `optimize.md`, `TASKS.md`.
- **Rincian:**
  - `REPO` → `prastya-dev/jack-agent` (sebelumnya `JACK_AGENT`; redirect GitHub masih jalan, tapi API/raw URL tidak dijamin).
  - Deteksi pemasangan: `!process.pkg` menggantikan `process.execPath.includes('node') || !process.pkg` — binary standalone yang dipasang di path berisi kata "node" tidak lagi dianggap instalasi npm.
  - `isNewer()` (semver): versi lokal yang sama atau lebih baru tidak pernah diturunkan; pesan dibedakan ("sudah terbaru" vs "versi Anda lebih baru dari rilis terakhir").
  - `downloadBinary()`: hanya `200` yang ditulis (301/302/307 diikuti maks 5×), ukuran dicocokkan dengan `content-length`, `.tmp` dibersihkan bila gagal, timeout 30 dtk — menutup `optimize.md` **O-02** (`statusCode` + ukuran) sebelum 1.2.1.
  - Nama paket npm pada perintah manual memakai konstanta `NPM_PKG`; saran `npm install -g` ditampilkan saat aset OS/arsitektur tidak tersedia.
  - `package.json`: `repository`/`homepage`/`bugs` → `prastya-dev/jack-agent`; versi tetap **1.2.0** (tag `v1.2.0` belum pernah dibuat, rilis terakhir di GitHub masih `v1.1.9`).
  - `release.yml`: langkah **Verify package.json version matches tag** — rilis gagal bila tag ≠ `package.json` (mencegah rilis dengan aset/versi tak sinkron).
- **Verifikasi:**
  ```
  $ npm test
  1..39
  # tests 39
  # pass 39
  # fail 0
  ```
  - `node dist/index.js --update < /dev/null` → `✓ Versi Anda (v1.2.0) lebih baru dari rilis terakhir (v1.1.9)`, `exit=0` (API GitHub merespons dengan nama repo baru).
  - `runUpdate('1.1.9')` → `✓ Anda sudah menggunakan versi terbaru (v1.1.9)`.
  - `runUpdate('1.0.0')` non-TTY → menampilkan versi terbaru, konfirmasi dijawab "tidak (sesi non-interaktif)", pembaruan dibatalkan, `exit=0`.
  - `downloadBinary()` ke URL aset yang tidak ada (`.../download/v0.0.0/tidak-ada`) → `reject — HTTP 404`, berkas `.tmp` **tidak** dibuat (binary lama tidak tersentuh).
  - `npm run pkg:linux` lalu `./binaries/jack-linux-x64 --version` → `JACK-AGENT v1.2.0` (versi benar-benar ter-embed di binary).
- **Catatan:** aset rilis sekarang mencakup `linux-arm64` dan `macos-arm64` (target `node18-*`), jadi `scripts/install.sh` di Apple Silicon/Raspberry Pi tidak lagi 404. Yang belum ada: `armv7` (Mikrotik lama) dan evaluasi target `node22` — tetap bagian `optimize.md` O-13 (1.2.1).
- **Verifikasi tambahan (arm64):** `npm run pkg:linux-arm64` → `binaries/jack-linux-arm64` (48.7 MB, `ELF 64-bit LSB pie executable, ARM aarch64`); `npm run pkg:macos-arm64` → `binaries/jack-macos-arm64` (Mach-O 64-bit arm64). Peringatan `Failed to make bytecode node18-arm64 for is-wsl` tidak fatal (pkg memakai bytecode sumber). Kedua binary arm64 belum dieksekusi di mesin x64 ini (tidak ada qemu); verifikasi eksekusi menyusul di perangkat ARM / CI.

### [v1.2.0] — 2026-10-19 — Implementasi rilis 1.2.0 (T-011…T-020)
- **Ringkasan:** Seluruh rencana 1.2.0 dibangun: satu mode agentik, dua adapter provider (Antigravity + OpenAI-compatible), system prompt v2, skills markdown, pemotongan output + `/compact`, config v1.2.0 + migrasi idempoten, CLI/slash baru, `jack -p` (one-shot/non-TTY), dan `--allow-write`. `T-004` dan `T-010` terpenuhi lewat `T-013`/`T-017`; `T-005` hilang bersama `src/api/client.ts`.
- **Per task:**

| Task | Hasil | File utama |
| :--- | :--- | :--- |
| T-011 | Satu interface `Provider`; adapter Antigravity memuat SSE, `json_exec`, onboarding, fallback model internal. `src/api/*` dihapus. | `src/providers/{types,sse,antigravity,index}.ts` |
| T-012 | Adapter OpenAI-compatible: SSE teks + `tool_calls` bertahap, `role: "tool"` + `tool_call_id`, mode `json_exec` bila `supports_tools: false`, `listModels`, klasifikasi error DNS/TLS/401/404/timeout. | `src/providers/openai.ts`, `src/providers/openai.test.ts` |
| T-013 | Loop agentik (maks `agent.max_steps`, tanya user bila habis/2 gagal), `ToolRegistry.run()` sebagai satu-satunya pintu eksekusi, guard auto/konfirmasi/blok, non-TTY menolak konfirmasi, teks parsial saat stream gagal dipertahankan (F5). | `src/agent/{loop,tool,guard}.ts`, `src/exec/runner.ts` |
| T-014 | Prompt v2 (lingkungan, tool, cara kerja, hemat token, keamanan, skill index, bahasa); tanpa sisa aturan mode. | `src/agent/prompt.ts` |
| T-015 | `SKILL.md` + frontmatter divalidasi, index nama+deskripsi saja, isi dimuat lewat `/skill` atau `use_skill` sebagai **pesan sistem tambahan** (PRD § 3.5), sekali per sesi; `jack skill add|list|rm`. | `src/skills/*`, `src/commands/skill.ts`, `src/agent/prompt.ts` |
| T-016 | Output dibersihkan (ANSI/`\r`/NUL), dipotong head+tail sesuai `tokens.*`, selalu menyertakan exit code; `/compact` + auto-compact; gagal merangkum → riwayat utuh. | `src/agent/output.ts`, `src/agent/loop.ts` |
| T-017 | Skema `providers`/`provider`/`agent`/`tokens`/`settings`/`environment`; migrasi v1.1.x dengan backup `config.json.bak-<versi>`, atomic write 0600, `auth`/`user` dipertahankan, config rusak tidak ditimpa. | `src/core/config.ts`, `src/core/config.test.ts` |
| T-018 | `jack provider …`, `jack skill …`, `--provider`, `--model`, `-p`, `--allow-write`; slash `/provider` `/skill` `/compact` `/allow`; mode lama dihapus dengan arahan; `canRaw()` + jalur non-TTY/one-shot. | `src/index.ts`, `src/session.ts`, `src/commands/*`, `src/ui/*` |
| T-019 | `npm test` (tsc + `node --test dist/*/*.test.js`): 36 test, termasuk `ls && rm -rf x` tidak lolos auto. | `*.test.ts` (7 berkas) |
| T-020 | Wizard memilih provider dulu (antigravity vs OpenAI-compatible + tes koneksi), README ditulis ulang untuk mode agentik, PRD/TASKS disamakan dengan kode. | `src/ui/wizard.ts`, `README.md`, `PRD.md`, `TASKS.md` |

- **Verifikasi (`npm test`, `tsc` bersih):**
  ```
  $ npm test
  1..36
  # tests 36
  # pass 36
  # fail 0
  ```
  Yang dicakup: klasifikasi izin (auto/konfirmasi/blok, segmen, redirection, NEVER_AUTO, allowlist user, `auto_enabled=false`), pemotongan output (head+tail, ANSI, stderr, timeout), prompt (batas 1.200 token, placeholder, skill index hanya nama+deskripsi, tanpa sisa mode), parser SSE + `json_exec`, dan migrasi config (nilai, backup, idempoten, config rusak).
- **UI REPL (permintaan pemilik, 2026-10-19):** saat mengetik `/`, daftar perintah yang cocok muncul di bawah prompt dalam viewport 8 baris + scrollbar (`↑`/`↓`, `Tab`, `Enter`). Pemilih model/provider/skill dibatasi 10 baris + scrollbar, jadi daftar panjang tidak lagi membanjiri terminal. Input REPL memakai editor raw-mode baru (`src/ui/input.ts`) dengan riwayat, gerak kursor, hapus kata, dan Ctrl+C dua kali = keluar; helper `src/ui/viewport.ts` murni dan diuji. Menu `/provider` kini memuat entri `+ tambah provider (base_url + api_key)` sehingga provider custom bisa ditambah tanpa hafal subcommand, dan wizard menyinkronkan state/status bar setelah provider aktif berubah.
- **Smoke test (mock server OpenAI-compatible di `/tmp`, tanpa jaringan/akun):**
  1. `jack -p "sebutkan isi direktori ini" < /dev/null` → model memanggil `run_command {"command":"ls -la"}`, hasil dieksekusi, jawaban dicetak, `exit=0`, tanpa ANSI.
  2. Output besar `cat /etc/services` → 11.599 baris / 685 KB dipotong menjadi 1.741 karakter (marker `… [dipotong: 11599 baris, 685.2 KB …]`) sebelum dikirim ke model.
  3. `rm -rf /` → `✗ diblok`, perintah tidak dijalankan, model menerima pesan `DIBLOK`.
  4. `touch berkas-baru.txt` di non-TTY tanpa flag → dialog tidak muncul, pesan "konfirmasi tidak tersedia di sesi non-interaktif", berkas **tidak** dibuat.
  5. Perintah yang sama dengan `--allow-write` → peringatan tebal di **stderr**, perintah jalan, berkas dibuat. `rm -rf /` tetap diblok walau flag aktif (diuji terpisah).
  6. REPL di pty: `ls -la` auto, `touch` memunculkan dialog dan berjalan setelah Enter, `/allow`, `/skill deploy-vps`, `/compact` (8 pesan → 1 ringkasan), `/exit`.
  7. Skill: index di prompt berisi `deploy-vps — langkah deploy ke VPS`, isi `SKILL.md` **tidak** ada di prompt awal. Setelah `use_skill` (one-shot) / `/skill` (REPL), body hanya masuk ke **pesan `system` request berikutnya** — bukan ke pesan `tool`/`user`; log mock: request #1 `system` tanpa `RAHASIA-SKILL`, request #2 `system` berisi, pesan `tool` hanya 70 karakter.
  8. `jack provider test` ke mock → `✓ terhubung — 1 model tersedia`; `jack provider list` menandai provider aktif.
  9. Migrasi nyata: `HOME=/tmp/…` dengan `.config/jckw/config.json` v1.1.9 → folder pindah ke `…/jack`, `version` 1.2.0, `auth.access_token` + `user` utuh, `confirm_danger_commands: true` → `auto_enabled: false`, `default_mode` hilang, backup `config.json.bak-1.1.9` ada; pembacaan kedua tidak mengubah berkas.
  10. `jack --version` → `JACK-AGENT v1.2.0`; `jack --help` memuat semua flag; non-TTY tanpa tugas → pesan + `exit=1`; non-TTY tanpa provider → pesan login/provider + `exit=1`.
  11. `--model m9` yang tidak ada di `providers[x].models` → peringatan "belum pernah diuji dengan jack — tetap dipakai" di **stderr**, model tetap dipakai; endpoint lokal mati → `koneksi ditolak — apakah endpoint lokal sudah jalan?` (bukan `fetch failed`).
  12. Wizard `F13` dari nol (tanpa config) di pty: bahasa → pilih `openai-compatible` → nama `ujiwiz` → base_url mock → api_key → tes koneksi `✓ terhubung — 1 model tersedia` → pilih model → ringkasan `Setup selesai` → tolak integrasi OS → masuk REPL. Config hasil: `provider.active=ujiwiz`, `kind=openai`, `default_model=mock-model`, `models=["mock-model"]`.
  13. `jack skill add <path-lokal>` → `✓ skill "deploy-vps" terpasang` (frontmatter divalidasi, folder disalin); `jack skill list` menampilkan deskripsi + lokasi.
  14. REPL di pty: ketik `/` → 10 perintah dalam viewport 8 baris + scrollbar (footer `↓ 2 lagi · Tab isi · Enter jalankan`); `↓` memilih `/skill`, `Tab` mengisi `/skill `; `Ctrl+U` membersihkan; `abc` + `←` + backspace → `ac`; `Enter` mengirim; `/exit` menyaring saran lalu keluar. `jack model` dengan 25 model → 10 baris, judul `8–17 dari 25`, ibu jari scrollbar bergeser ke tengah.
- **Kesesuaian PRD yang ditutup setelah audit dokumen (tanpa akun/jaringan):**
  - **F1:** refresh token gagal di TTY → `runRelogin()` dipanggil otomatis sekali; non-TTY tetap error jelas berisi perintah `jack login` (`src/auth/token.ts`).
  - **F2:** server menolak `401` padahal token belum kedaluwarsa → `forceRefreshAccessToken()` lalu permintaan diulang **sekali** dari awal; bila sebagian teks sudah tampil, tidak diulang (`src/providers/antigravity.ts`).
  - **F5:** teks parsial dari stream yang gagal dibawa di `ProviderError.partialText` dan dimasukkan ke riwayat sebagai pesan asisten — tampilan tidak diulang, konteks tidak hilang.
  - **F10:** `jack update` menampilkan versi terbaru lalu meminta konfirmasi sebelum mengganti binary; non-TTY menjawab "tidak" (`src/core/updater.ts`).
  - **§ 3.5:** isi skill yang dimuat masuk ke blok `SKILL DIMUAT` pada **system prompt** permintaan berikutnya; pesan `tool`/`user` hanya berisi konfirmasi singkat (diuji lewat log mock).
  - **§ 3.3:** contoh skema disamakan dengan kode — `auth` snake_case (dipertahankan dari 1.1.x) dan `environment` berisi `project_id`/`machine_id`/`antigravity_project_id` (internal, bukan preferensi user).
- **Deviasi yang diketahui:**
  - `src/core/i18n.ts` belum dibuat; string baru hardcoded Indonesia (tetap **T-009**). Wizard/updater/uninstall tetap punya saklar `id`/`en`.
  - Output one-shot tetap memuat jejak langkah (`$ <perintah>`, preview output, ringkasan langkah) dalam **teks polos** — tanpa ANSI, spinner, atau status bar. Bila pemilik ingin stdout berisi jawaban model saja, itu perubahan terpisah.
  - `--allow-write` mencetak peringatan ke **stderr** supaya output one-shot tetap bersih (PRD hanya mewajibkan peringatan tebal).
  - `git clone` pada `jack skill add` dan `execSync` di updater/setup/wizard berada di luar `ToolRegistry` (I-9 menyasar perintah yang diminta model); ditandai `shortcut:` di `src/skills/store.ts`.
  - Wizard `F13` sudah diuji ujung-ke-ujung di pty untuk jalur `openai-compatible` (endpoint tiruan). Jalur `antigravity` di wizard tetap butuh akun Google, jadi belum diuji.
- **Belum diverifikasi (butuh akun Google / jaringan nyata):** login OAuth, login ulang otomatis F1, ulang-sekali F2 setelah 401, tugas nyata lewat Antigravity, fallback provider ke antigravity, dan konfirmasi `jack update` (registry npm untuk paket ini masih 404, jadi jalur "versi tidak ditemukan" yang teruji; jalur konfirmasi hanya bisa dicapai bila ada versi lebih baru).
- **Catatan rilis:** tag `v1.2.0` dan publikasi npm/binary belum dibuat (butuh keputusan pemilik).

### [v1.2.0 · rencana] — 2026-10-18 — Skema: provider custom, mode agentik, skills, hemat token (dokumentasi)
- **Ringkasan:** Menyusun skema (belum ada kode yang dibangun) untuk arah produk 1.2.0: (1) provider dapat dipilih — Antigravity + endpoint **OpenAI-compatible** apa pun (base_url/api_key/models); (2) mode `chat`/`exec`/`quiz` **dihapus** → satu mode agentik; (3) system prompt v2 yang lebih kuat (8 blok, provider-aware, batas 1.200 token); (4) **hemat token** — pemotongan output perintah + `/compact` manual & otomatis; (5) **skills** markdown yang bisa dipasang dari git/lokal. Fitur dijadwalkan **1.2.0**, optimasi (`optimize.md`) **1.2.1** sesuai keputusan pemilik.
- **Keputusan yang mengubah aturan lama (perlu diketahui):** § 2.2 "provider tunggal: Antigravity" **dibatalkan**; invariant **I-3** diganti dari "tidak ada auto-approve sama sekali" menjadi **klasifikasi berlapis** (allowlist read-only auto / konfirmasi / blok destruktif, non-TTY menolak konfirmasi); **I-5** diganti (berpindah provider tidak menghapus riwayat); I-1/I-2/I-4 diperbarui; **I-9…I-12** baru (satu pintu tool, skill hanya teks, output wajib dipotong, riwayat tidak hilang tanpa jejak).
- **File diubah:** `PRD.md` (naik ke v1.2.0: § 2.2, § 2.4, § 3.1–3.8, F3/F4/F5/F6/F7/F8/F9/F12/F13 diperbarui + F14/F15/F16 baru, § 5 prompt v2, § 6 state & siklus agentik, § 7 klasifikasi izin, § 8 butir 9–13, § 9 invariant, § 10.4 test, § 11 R-7…R-10, § 12 changelog), `TASKS.md` (bagian **Rencana Rilis** + task **T-011…T-020**; T-004 → diserap T-013; T-010 → diserap T-017), `optimize.md` (penjadwalan 1.2.1 + O-16 baru), `AGENTS.md` (aturan ringkas diselaraskan dengan I-3/I-9 baru).
- **Tidak ada kode yang diubah** — sesuai permintaan ("jangan build dulu, buat skemanya saja").
- **Konsekuensi penjadwalan yang dicatat sebagai risiko:** (a) **O-01** (crash `setRawMode` di non-TTY, sudah terbukti `TypeError`) harus dibawa ke 1.2.0 karena T-013 bergantung padanya; (b) **O-14** (`jack -p`) juga, karena tanpa itu agentik hanya bisa interaktif; (c) **O-03** (deteksi perintah berbahaya) otomatis terserap T-013 sehingga tidak lagi dikerjakan di 1.2.1.
- **Keputusan pemilik (2026-10-18, dikonfirmasi):** (a) **`--allow-write` disetujui** masuk 1.2.0 sebagai satu-satunya pengecualian eksplisit I-3 — hanya one-shot, diabaikan di REPL, diblok tetap berlaku untuk pola destruktif, tanpa padanan di config (PRD § 7.2.1); (b) **`O-01` + `O-14` dipindahkan ke 1.2.0** sebagai bagian T-018 karena T-013 bergantung padanya; (c) **mode `quiz` ikut dihapus** — jack benar-benar satu mode.
- **Usulan fitur yang masih terbuka (belum disetujui, PRD § 11.2):** `JACK.md` per proyek (R-7), `--dry-run` (R-8), tampilan pemakaian token (R-10).
- **Verifikasi:** tinjauan dokumen saja (tidak ada build/test). Rujukan silang diperiksa: setiap `Ref:` di task menunjuk nomor bagian yang benar-benar ada di `PRD.md`; `grep -n "^## "` pada PRD/TASKS menunjukkan urutan bagian utuh (tidak ada heading yang hilang saat penyuntingan).

### [v1.1.9] — 2026-10-18 — Rencana optimasi (`optimize.md`)
- **Ringkasan:** Audit menyeluruh repo (seluruh 20 file `src/`, `package.json`, workflow rilis, ketiga installer) plus pengukuran langsung di mesin, lalu disusun jadi rencana berfase di `optimize.md`: 15 item (`O-01`…`O-15`) dalam 5 fase — stabilitas → kecepatan → ukuran → portabilitas → Mikrotik — masing-masing dengan acceptance, verifikasi, dan effort. Termasuk baseline terukur, protokol pengukuran, daftar "yang tidak dikerjakan", dan pemetaan ke task yang sudah ada (O-03 = T-004, O-05 = T-005, O-12 = T-003) supaya tidak duplikasi.
- **File diubah:** `optimize.md` (baru), `TASKS.md` (entri ini). Tidak ada kode aplikasi yang disentuh.
- **Temuan yang belum ada di backlog:**
  - Crash non-TTY: `process.stdin.setRawMode(true)` tanpa cek `isTTY` (`src/ui/modelselector.ts:49`, `src/ui/confirm.ts:45`) → terbukti `TypeError` lewat `node -e ... < /dev/null`. Wizard memanggil `showModelSelector`, jadi jalan pertama di container/cron langsung mati.
  - `downloadBinary` (`src/core/updater.ts:68-85`) tidak memeriksa `statusCode` → unduhan gagal bisa menimpa binary terpasang dengan file rusak (kerusakan permanen).
  - Ketidakkonsistenan rilis: `scripts/install.sh:50` mendeteksi `arm64` dan meminta `jack-linux-arm64`, tapi `pkg.targets` + `release.yml` tidak pernah membangunnya → 404 di tengah instalasi.
  - Pemborosan paket: 60 dari 80 file `dist/` yang terbit adalah `.map`/`.d.ts`; `icon.png` 1024×1024 (1,37 MB) disalin ke folder `hicolor/256x256/apps`; total tarball 2,0 MB padahal JS 468 KB.
  - ~80 baris tanpa pemanggil: `stripExecBlocks`, `hasValidToken`, `APP_NAME`/`DEVELOPER`/`NPM_PACKAGE`, `A.saveCursor`/`restCursor`/`clearLine`, seluruh sistem listener `StateManager` (`toggleMode`/`subscribe`/`notify`/`listeners`/`StateListener`), dan `renderModeChange` yang diimpor tapi tak pernah dipanggil.
  - Celah terbesar untuk "bisa dipasang di mana saja": tidak ada mode one-shot non-interaktif (`jack -p`) — diusulkan sebagai O-14.
- **Verifikasi (semua diukur, bukan perkiraan):** `node -e ""` = 60 ms / 53 MB RSS; `node dist/index.js --version` = 90 ms / 64 MB RSS; `du -sh dist` = 468 KB; `npm pack --dry-run` = 2,0 MB unpacked / 84 file; `icon.png` 1,37 MB (1024×1024); `grep` tiap simbol mati = 0 pemanggil; `node -e "process.stdin.setRawMode(true)" < /dev/null` = `TypeError`. `npm run build` tetap bersih (tidak ada perubahan perilaku).
- **Belum diukur:** ukuran binary `pkg` (butuh unduh base binary) dan RSS saat chat nyata (butuh akun Google) — tercatat apa adanya di `optimize.md` § 1.

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
