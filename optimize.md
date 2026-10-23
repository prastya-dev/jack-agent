# JACK-AGENT — OPTIMIZE

> **Tujuan dokumen:** rencana agar jack menjadi agent paling **ringan**, paling **cepat**, bisa dipasang di **perangkat apa pun**, dan siap untuk **Mikrotik**.
>
> **Status:** **1.2.0 selesai 2026-10-19.** `O-01`, `O-03`, `O-14` ditutup di 1.2.0; `O-04`, `O-05`, `O-06` ikut hilang bersama kode lama dan perilakunya sudah sesuai acceptance; `O-07`/`O-11` terpenuhi sebagian. Sisa item dieksekusi di **1.2.1**. · **Dibuat:** 2026-10-18 · **Basis:** v1.1.9, diukur ulang pada v1.2.0 (§ 1).
> **Jadwal:** dokumen ini dieksekusi pada **v1.2.1**. Fitur besar (provider custom, mode agentik, skills, hemat token) naik lebih dulu di **v1.2.0** — lihat `TASKS.md` → **Rencana Rilis**.
> **Baca bersama:** `PRD.md` (invariant + aturan rekayasa) dan `TASKS.md` (papan kerja).
>
> **Penyesuaian jadwal (diputuskan pemilik, 2026-10-18):** `O-01` dan `O-14` **dipindahkan ke v1.2.0** karena `T-013` (loop agentik) bergantung padanya — tanpanya agentik tidak bisa dipakai non-interaktif (SSH, cron, `-p`) dan `setRawMode` tanpa cek `isTTY` sudah terbukti `TypeError`. Sebaliknya `O-03` **tidak lagi** dikerjakan di sini karena sudah terserap `T-013` (klasifikasi izin, `PRD.md` § 7.2). Sisa item di dokumen ini tetap dieksekusi pada **v1.2.1**.


**Aturan pakai dokumen ini:**

1. `TASKS.md` tetap **sumber kebenaran** pengerjaan. Item di sini dipindahkan ke `TASKS.md` saat mulai dikerjakan, lalu dicatat di Riwayat Selesai saat selesai.
2. Setiap item punya **acceptance** (kapan disebut selesai) dan **verifikasi** (perintah + angka yang harus terlihat). Tanpa keduanya, item belum boleh ditutup.
3. Angka sebelum/sesudah **wajib** dicatat di § 1. "Terasa lebih cepat" bukan bukti.
4. Tetap patuh `PRD.md` § 2.4 dan § 9: YAGNI, diff terpendek, tanpa dependency runtime baru (**I-1**), dan sejak 1.2.0: eksekusi hanya lewat `ToolRegistry` (**I-9**), output tool wajib dipotong (**I-11**).
5. Ketika 1.2.0 sudah rilis, **ukur ulang baseline** — struktur kode berubah cukup besar (provider, agent, skills), sehingga angka § 1 berbasis v1.1.9 perlu dinyatakan ulang sebelum item 1.2.1 dikerjakan.

---

## 0. Ringkasan keputusan

- **Urutan kerja:** stabilitas → kecepatan → ukuran → portabilitas → Mikrotik.
- **Wajib sebelum rilis 1.2.1:** `O-16`. `O-02` sudah ditutup 2026-10-23 (permintaan pemilik) karena mencegah kerusakan permanen — binary tertimpa berkas rusak; `O-16` menyangkut memori di perangkat kecil dan berkaitan langsung dengan pemotongan output yang baru masuk di 1.2.0. `O-01`/`O-14` sudah selesai di 1.2.0, `O-03` diserap `T-013`, dan `O-04`/`O-05`/`O-06` hilang bersama kode lama (lihat tabel status di § 0).
- **Keputusan besar** (menulis ulang inti ke Go) **belum diambil**. Diputuskan hanya setelah Fase 1–4 selesai dan diukur, dengan trigger yang jelas di § 6.
- **Yang paling menaikkan nilai jual** bukan mengecilkan binary, tapi **mode one-shot non-interaktif** (`O-14`): itu yang membuat jack bisa dipakai dari skrip, cron, SSH, CI, dan container — termasuk Mikrotik. Karena itu ia dipindahkan ke 1.2.0 bersama loop agentik.
- **Yang tidak dikerjakan:** lihat § 8.

### Peta item

| ID | Fase | Prio | Effort | Dampak | Ref temuan audit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| O-01 | 1 Stabilitas | P0 | S | Bisa jalan tanpa TTY (Docker/cron/Mikrotik) | #1 · **→ 1.2.0 (T-018)** |
| O-02 | 1 Stabilitas | P0 | S | Tidak merusak binary saat update gagal | #2 |
| O-03 | 1 Stabilitas | — | — | Peringatan perintah berbahaya | #3 · **diserap T-013 (1.2.0)** |
| O-04 | 2 Kecepatan | P1 | S | Output tidak diperlambat efek typewriter | #4 |
| O-05 | 2 Kecepatan | P0 | S | Fallback tidak gagal karena token mati | #5 = **T-005** |
| O-06 | 2 Kecepatan | P2 | XS | Error 401/403 tidak dicoba 6× | #6 |
| O-07 | 2 Kecepatan | P3 | S | `--version` / one-shot lebih cepat | #12 |
| O-08 | 2 Kecepatan | P3 | XS | I/O config 4× → 1× per pesan | #14 |
| O-09 | 3 Ringan | P2 | S | 0 dependency runtime | #7 |
| O-10 | 3 Ringan | P2 | S | Paket npm −1,7 MB | #8 |
| O-11 | 3 Ringan | P2 | S | −80 baris kode mati | #10 |
| O-12 | 3 Ringan | P3 | XS | Hapus template bakery | #11 = **T-003** |
| O-13 | 4 Portabilitas | P1 | M | Binary arm64 (Pi, Mac M-series, Mikrotik ARM64) | #9 |
| O-14 | 4 Portabilitas | P1 | M | Mode one-shot non-interaktif (`-p`) | — · **→ 1.2.0 (T-018)** |
| O-15 | 4 Portabilitas | P3 | XS | Deteksi instalasi npm tidak salah | #13 |
| O-16 | 3 Ringan | P1 | S | Output besar tidak menahan 10 MB di RAM | #15 |



Effort: **XS** <½ hari · **S** ≈½–1 hari · **M** ≈1–3 hari.

**Status per 2026-10-19 (setelah rilis 1.2.0):**

| Item | Status |
| :--- | :--- |
| O-01, O-03, O-14 | ✅ selesai (bagian 1.2.0 / `T-018`, `T-013`) |
| O-04, O-05, O-06 | ✅ tidak lagi berlaku — kode lamanya (`api/streamer.ts`, `api/client.ts`) dihapus; perilaku sesuai acceptance |
| O-02 | ✅ selesai 2026-10-23 (lebih awal, lihat `TASKS.md` Riwayat Selesai) |
| O-15 | ✅ selesai 2026-10-23 (`!process.pkg`) |
| O-07 | ⚠ sebagian — `--version`/`--help` keluar sebelum modul berat dimuat (angka § 1) |
| O-11 | ⚠ sebagian besar — modul legacy dihapus; audit "nol pemanggil" ulang di 1.2.1 |
| O-13 | ⚠ sebagian — `linux-arm64` + `macos-arm64` siap; sisa `armv7` (Mikrotik lama) + evaluasi `node22` |
| O-08, O-09, O-10, O-16 | ⏳ sisa untuk 1.2.1 |

---

## 1. Baseline terukur (2026-10-18, v1.1.9)

Semua angka di bawah **diukur di mesin ini**, bukan perkiraan. Yang belum diukur ditandai jelas.

| Metrik | Nilai | Cara ukur |
| :--- | :--- | :--- |
| Node hidup saja (tanpa jack) | 60 ms · 53 MB RSS | `for i in 1 2 3; do /usr/bin/time -f "%e s %M KB" node -e ""; done` |
| `jack --version` | **90 ms · 64 MB RSS** | `/usr/bin/time -f "%e s %M KB" node dist/index.js --version` |
| Ukuran `dist/` | 468 KB · 80 file (20 `.js`, 40 `.map`, 20 `.d.ts`) | `du -sh dist; find dist -name '*.map' \| wc -l` |
| Kode sumber | 3.210 baris · 20 file | `find src -name '*.ts' \| xargs wc -l \| tail -1` |
| Paket npm | 1,5 MB tarball · 2,0 MB unpacked · 84 file | `npm pack --dry-run` |
| `icon.png` | 1024×1024 · 1,37 MB | header PNG (IHDR) |
| `jack.ico` | 278 KB (dari 4 gambar; 256×256 = 264 KB) | header ICO |
| `node_modules` | 42 MB | `du -sh node_modules` |
| Binary `pkg` | **belum diukur** | `npm run pkg:linux` (butuh unduh base binary / jaringan) |
| RSS saat chat nyata | **belum diukur** | butuh akun Google |
| RSS perintah beroutput besar (`find /`) | **belum diukur** | `/usr/bin/time -f "%M KB"` dengan jack menjalankan perintah itu (O-16) |
| Token per tugas (prompt + completion) | **tidak tersedia di v1.1.9** | butuh `usage` dari provider — baru ada sejak 1.2.0 (`T-016`); lihat § 7 butir 6 |

**Batas bawah yang harus disadari:** Node sendiri sudah 53 MB dan 60 ms sebelum aplikasi berbuat apa pun. Setiap target "RSS di bawah 32 MB" hanya bisa dicapai dengan keluar dari Node (§ 6).

### Baseline setelah 1.2.0 (2026-10-19) — indikatif

Diukur di mesin yang sama, setelah build bersih. Angka ini **belum** menjadi pembanding resmi item 1.2.1 (aturan 5: ukur ulang sebelum mulai), tetapi menunjukkan arah perubahan.

| Metrik | v1.1.9 | v1.2.0 | Cara ukur |
| :--- | :--- | :--- | :--- |
| Node hidup saja | 60 ms · 53 MB | 70 ms · ~53 MB | median 15× `spawnSync('node', ['-e',''])` |
| `jack --version` | 90 ms · 64 MB | **78 ms · 53 MB** | median 15×; RSS `/usr/bin/time -f "%M"` |
| `jack --help` | — | 76 ms | median 15× |
| JS di `dist/` | 468 KB · 20 file | **296 KB · 38 file** | `du -ch $(find dist -name '*.js')` |
| `dist/` total | 468 KB | 848 KB | `du -sh dist` |
| Paket npm | 1,5 MB / 2,0 MB / 84 file | **1,6 MB / 2,1 MB / 156 file** | `npm pack --dry-run` |
| Token per tugas | tidak tersedia | 685 KB output → **1.741 karakter** dikirim ke model | log mock server (`T-016`) |

Catatan: paket npm **membesar** karena `dist` kini memuat lebih banyak modul + `.map`/`.d.ts` (O-10 belum dikerjakan); `icon.png` masih 1,37 MB. `--version` turun 12 ms dan RSS turun ~11 MB dibanding v1.1.9, tetapi masih ~8 ms di atas Node kosong (target O-07 ±5 ms).

---

## 2. Fase 1 — Stabilitas & keamanan

**Tujuan:** jack tidak boleh mati atau merusak dirinya sendiri di lingkungan yang bukan terminal interaktif.
**Exit criteria fase:** tiga item di bawah `Done`, `npm run build` bersih, dan `printf '' | node dist/index.js` tidak melempar exception.

### O-01 — Dukungan non-TTY (tanpa terminal sungguhan)
- **✅ Selesai 1.2.0 (`T-018`):** `canRaw()` ada di `src/ui/confirm.ts` dan dipakai `confirm.ts`/`modelselector.ts`/`wizard.ts`; non-TTY menolak konfirmasi tanpa menggantung, jalur one-shot membaca stdin. Diuji: `jack -p … < /dev/null` dan `jack < /dev/null` tidak melempar `TypeError` (lihat Riwayat Selesai v1.2.0).
- **Prio/Effort:** P0 · S
- **File:** `src/ui/modelselector.ts:49`, `src/ui/confirm.ts:45`, `src/index.ts`
- **Masalah:** `process.stdin.setRawMode(true)` dipanggil tanpa cek `isTTY`. Terbukti: `node -e "process.stdin.setRawMode(true)" < /dev/null` → `TypeError: process.stdin.setRawMode is not a function`. Karena wizard memanggil `showModelSelector` untuk memilih bahasa, **jalan pertama kali di Docker/cron/Mikrotik langsung mati**.
- **Perubahan:**
  - Helper kecil `canRaw(): boolean` (cek `process.stdin.isTTY && typeof process.stdin.setRawMode === 'function'`).
  - `showModelSelector`: bila bukan TTY → cetak daftar sebagai teks, pilih `currentModel` (atau item pertama), kembalikan tanpa raw mode.
  - `showConfirmDialog`: bila bukan TTY → cetak perintah + pesan bahwa konfirmasi butuh terminal, **kembalikan `false`**. Jangan pernah auto-approve.
- **Acceptance:** `printf '' | node dist/index.js` dan `node dist/index.js < /dev/null` tidak melempar `TypeError`; dialog konfirmasi di non-TTY selalu menolak.
- **Jangan:** menambah flag `--yes` atau opsi bypass konfirmasi.
- **⚠ Jadwal (diputuskan 2026-10-18: pindah ke 1.2.0, `T-018`):** `T-013` (loop agentik + klasifikasi izin) bergantung pada helper `canRaw()` ini, karena jalur non-TTY adalah cara utama agentik dipakai. Karena itu urutan pengerjaannya: `O-01` **lebih dulu** daripada `T-013`. Catatan `PRD.md` § 7.2 sudah menetapkan bahwa konfirmasi di non-TTY **ditolak otomatis** — perilaku itu belum bisa diimplementasikan di `confirm.ts` sebelum O-01 selesai. Tidak dikerjakan lagi di 1.2.1.

### O-02 — Updater tidak boleh merusak binary terpasang
- **Status:** ✅ **Selesai 2026-10-23** (dikerjakan lebih awal atas permintaan pemilik; lihat `TASKS.md` Riwayat Selesai). Sisa yang tidak dikerjakan: verifikasi checksum/signature aset.
- **Prio/Effort:** P0 · S
- **File:** `src/core/updater.ts:68-85` (`downloadBinary`), `:164-181`
- **Masalah:** respons tanpa cek `statusCode`. Unduhan terputus / server balas 500 → file `.tmp` berisi potongan tetap di-`chmod +x` lalu `renameSync()` **menimpa binary yang sedang jalan**. Hasilnya instalasi rusak permanen.
- **Perubahan:**
  - Terima hanya `res.statusCode === 200` (selain 301/302) → selain itu `destroy()` + `fs.unlink(dest)` + `reject`.
  - Bandingkan ukuran file akhir dengan header `content-length` (bila ada) sebelum `renameSync`.
- **Acceptance:** unduhan yang gagal menyisakan binary lama tetap utuh dan bisa dijalankan.
- **Verifikasi:** paksa gagal (mis. arahkan URL ke `https://httpstat.us/500` di kode sementara) → `jack` lama masih jalan, `.tmp` terhapus. **Dibuktikan 2026-10-23** dengan URL aset yang tidak ada (`…/releases/download/v0.0.0/tidak-ada`): `reject — HTTP 404`, `.tmp` tidak dibuat.

### O-03 — Tegakkan peringatan perintah berbahaya — **DISERAP `T-013` (1.2.0), jangan dikerjakan di sini**
- **Alasan:** `PRD.md` § 7.2 menggantinya dengan klasifikasi izin berlapis di `src/agent/guard.ts` (auto / konfirmasi / blok). Perintah destruktif sekarang **diblok**, bukan sekadar diberi peringatan tambahan, dan `isDangerousCommand()` dipanggil dari sana. Mengerjakan item ini terpisah setelah 1.2.0 = mengerjakan hal yang sama dua kali.
- **Yang tetap harus dipenuhi (bagian dari `T-013`):**
  - Daftar pola berbahaya ada **di kode**, bukan hanya di config (`PRD.md` § 7.1).
  - `settings.confirm_danger_commands` (config lama) dipetakan ke `agent.auto_enabled` saat migrasi (`PRD.md` § 3.3).
  - Uji manual: permintaan yang menghasilkan `rm -rf /` **tidak dijalankan** — tidak ada dialog yang bisa membuatnya jalan.
- **Konteks asli (jejak audit, v1.1.9):** `src/exec/runner.ts:59` (`isDangerousCommand`, 0 pemanggil), `src/api/client.ts:386`; dialog untuk `rm -rf /` tampil sama seperti `ls -la` sehingga fitur peringatannya mati total.


---

## 3. Fase 2 — Kecepatan

**Tujuan:** membuang perlambatan buatan dan menghilangkan percobaan jaringan yang pasti gagal.
**Exit criteria fase:** output tidak lagi dibatasi delay buatan; percakapan panjang tidak gagal karena token; error auth berhenti setelah 1 percobaan.

### O-04 — Typewriter tidak boleh membatasi kecepatan
- **✅ Tidak lagi berlaku (1.2.0):** `src/api/streamer.ts` dihapus; `src/ui/stream.ts` mencetak chunk apa adanya (tanpa delay) dan hanya menyembunyikan blok tool. Spinner juga dimatikan di non-TTY.
- **Prio/Effort:** P1 · S
- **File:** `src/core/constants.ts:75`, `src/api/streamer.ts:3,33,53,66,77,116`
- **Masalah:** 8 ms/karakter = langit-langit **125 karakter/detik**. Jawaban 2.000 karakter butuh ≥16 detik hanya untuk menggambar teks yang sudah diterima. Efeknya juga jalan saat output dialihkan ke file.
- **Perubahan:** jadikan `TYPEWRITER_DELAY_MS` default `0`, dan aktifkan hanya bila `process.stdout.isTTY`. Boleh dibuka ke config kalau perlu — **jangan** tambah UI pengaturan.
- **Acceptance:** jawaban 2.000 karakter tampil tanpa jeda buatan di TTY; output ke file/pipe tidak berisi delay.
- **Verifikasi:** waktu antara "chunk terakhir diterima" dan "prompt kembali" turun mendekati 0.

### O-05 — Refresh token di dalam loop fallback (= T-005)
- **✅ Selesai 1.2.0 (`T-005` → `T-011`):** `src/api/client.ts` dihapus; `ensureValidToken()` dipanggil di dalam loop percobaan model pada `src/providers/antigravity.ts`. Belum diuji ulang dengan akun nyata (token kedaluwarsa di tengah sesi).
- **Prio/Effort:** P0 · S · **Sudah ada di `TASKS.md` sebagai T-005 — jangan buat task baru.**
- **File:** `src/api/client.ts:291` (token diambil sekali), `:339-354` (loop fallback)
- **Masalah:** setelah percobaan pertama yang lambat, sisa 5 percobaan memakai token mati → pesan error generik, user mengulang manual.
- **Perubahan:** `await ensureValidToken()` di dalam blok `try` sebelum setiap `executeModelRequest`. Murah: hanya memanggil jaringan bila token mendekati kedaluwarsa.
- **Acceptance:** fallback setelah token kedaluwarsa tetap berhasil.

### O-06 — Berhenti pada error yang tidak akan berubah
- **✅ Terpenuhi 1.2.0 (`T-011`):** loop fallback model di `src/providers/antigravity.ts` berhenti pada `400`/`401`/`403` (sekali percobaan, error asli diteruskan). Jalur OpenAI tidak punya loop model internal, jadi tidak relevan.
- **Prio/Effort:** P2 · XS
- **File:** `src/api/client.ts:345-353`
- **Masalah:** error 401/403 (token ditolak) tetap dicoba ke 6 model = 6 perjalanan jaringan sia-sia; di koneksi lambat terasa seperti hang.
- **Perubahan:** satu baris — `if (err.status === 401 || err.status === 403) break;` (pola yang sama sudah dipakai untuk error verifikasi).
- **Acceptance:** token tidak valid → tepat 1 percobaan, pesan jelas.

### O-07 — Flag cepat tidak perlu memuat seluruh aplikasi
- **⚠ Sebagian (1.2.0):** `src/index.ts` menangani `--version`/`--help` sebelum `import()` modul berat. Terukur 78 ms (Node kosong 70 ms) dan RSS 53 MB (turun dari 64 MB), jadi target ±5 ms belum tercapai — ukur ulang di 1.2.1.
- **Prio/Effort:** P3 · S
- **File:** `src/index.ts` (import di baris atas)
- **Masalah:** `--version` terukur 90 ms / 64 MB, sementara Node kosong 60 ms / 53 MB. Selisihnya biaya memuat semua modul.
- **Perubahan:** cek `--version`/`-v` sebelum modul berat, lalu `await import()` sisanya. Ini juga fondasi `O-14`.
- **Acceptance:** `--version` turun ke sekitar angka Node kosong (±5 ms / ±2 MB di atas baseline).

### O-08 — Baca config sekali per pesan
- **Prio/Effort:** P3 · XS
- **File:** `src/api/client.ts:287-294`
- **Masalah:** `readConfig()` dipanggil 4× per pesan (via `ensureValidToken` → `isTokenValid`, `readConfig`, `getAccessToken`, `onboardAntigravity`) = 4× baca + parse JSON sinkron. Kecil (≈0,2 ms) tapi gratis.
- **Perubahan:** baca sekali di awal `sendMessage`, teruskan sebagai parameter.
- **Acceptance:** 1 pembacaan config per pesan.

---

## 4. Fase 3 — Ringan (ukuran)

**Tujuan:** paket dan instalasi sekecil mungkin. Setiap byte harus diunduh dan disimpan user.
**Exit criteria fase:** `npm pack` di bawah 500 KB; nol dependency runtime; nol kode tanpa pemanggil; RSS untuk perintah beroutput besar tidak lagi menahan puluhan MB (O-16).

### O-09 — Buang dependency `open`
- **Prio/Effort:** P2 · S
- **File:** `src/auth/oauth.ts:257`, `package.json:41-43`
- **Masalah:** `open` dipakai 1 tempat, padahal **8 baris di bawahnya** (`oauth.ts:261-266`) sudah ada fallback `exec` (`xdg-open` / `open` / `start`) yang bekerja tanpa dependency. Ini satu-satunya dependency runtime.
- **Perubahan:** hapus blok `require('open')`, pakai `exec` yang sudah ada, hapus dari `dependencies`.
- **Acceptance:** `grep -r "'open'" src/` kosong; login tetap membuka browser di Linux/macOS/Windows; **I-1** jadi "nol dependency runtime".
- **Verifikasi:** jalankan wizard di 1 platform, browser terbuka.

### O-10 — Paket npm dan ikon
- **Prio/Effort:** P2 · S
- **File:** `package.json:6-10` (`files`), `icon.png`, `jack.ico`, `src/core/setup.ts:82-85`
- **Masalah:** 60 dari 80 file `dist/` adalah `.map` + `.d.ts` yang ikut terbit. `icon.png` 1024×1024 (1,37 MB) disalin ke folder `hicolor/256x256/apps/` — salah ukuran, 1,37 MB per pengguna Linux untuk ikon 256×256. Total tarball 2,0 MB padahal JS-nya 468 KB.
- **Perubahan:**
  - `"files": ["dist/**/*.js", "jack.ico"]` (+ `icon.png` yang sudah dikecilkan).
  - `icon.png` → 256×256 (≈40 KB), `jack.ico` → hanya 16/32/48/256 yang perlu, tanpa gambar 264 KB yang berlebihan.
  - Tambah `prepublishOnly` yang menjalankan `npm run build` supaya `dist` tidak pernah basi saat publish.
- **Acceptance:** `npm pack --dry-run` < 500 KB dan tidak memuat `.map`/`.d.ts`; ikon di disk user < 100 KB.
- **Verifikasi:** `npm pack --dry-run` sebelum/sesudah, catat di § 1.

### O-11 — Hapus ~80 baris kode mati
- **⚠ Sebagian besar (1.2.0):** seluruh daftar di bawah hilang bersama `src/api/` dan penulisan ulang `state.ts`/`theme.ts`/`parser.ts`/`constants.ts`. Audit "nol pemanggil" untuk sisa kode belum dijalankan ulang — itu bagian 1.2.1.
- **Prio/Effort:** P2 · S
- **File & bukti (semua sudah di-grep, nol pemanggil):**
  - `src/exec/parser.ts:42` — `stripExecBlocks`
  - `src/core/config.ts:105` — `hasValidToken`
  - `src/core/constants.ts:7-9` — `APP_NAME`, `DEVELOPER`, `NPM_PACKAGE`
  - `src/ui/theme.ts:32-36` — `A.saveCursor`, `A.restCursor`, `A.clearLine`
  - `src/core/state.ts:21,35,65-76` — seluruh sistem listener: `StateListener`, `listeners`, `toggleMode`, `subscribe`, `notify`
  - `src/commands/slash.ts:5` — `renderModeChange` diimpor tapi tidak pernah dipanggil (`src/ui/banner.ts:39` jadi ikut mati)
- **Masalah:** sistem listener adalah abstraksi untuk banyak pelanggan yang tidak pernah ada — persis yang dilarang `PRD.md` § 2.4 butir 3.
- **Perubahan:** hapus semuanya. Setelah dihapus, `notify()` yang tersisa cukup berupa penggantian state biasa.
- **Acceptance:** `npm run build` bersih; `grep` tiap nama di atas di `src/` hanya menemukan 0 hasil.
- **Catatan:** `isDangerousCommand` **tidak** dihapus — dia dipakai oleh O-03.

### O-12 — Ganti `web/index.html` (= T-003)
- **Prio/Effort:** P3 · XS · **Sudah ada di `TASKS.md` sebagai T-003.**
- **Masalah:** file ter-track berisi halaman "Vanilla Bakery"; kalau `web/` di-serve, publik melihat toko roti.
- **Perubahan:** hapus, atau ganti 1 halaman minimal (banner, satu perintah install, tautan GitHub/npm).
- **Acceptance:** tidak ada konten bakery tersisa; HTML5 valid.

### O-16 — Output perintah tidak menahan 10 MB di RAM
- **Prio/Effort:** P1 · S
- **File:** `src/exec/runner.ts` (`maxBuffer`), `src/agent/output.ts` (baru di 1.2.0 / `T-016`)
- **Masalah:** perintah seperti `find /`, `npm install`, atau build besar menampung **seluruh** output di memori (batas `maxBuffer` 10 MB) sebelum apa pun dipotong. `T-016` memotong output **setelah** ditangkap (menyelesaikan sisi token, bukan sisi memori) — jadi 10 MB tetap dialokasikan lalu 99% dibuang. Di perangkat 256 MB ini pemborosan yang terasa; di `pkg` sering berujung mati karena kehabisan memori.
- **Perubahan:**
  - Baca stream dengan batas: berhenti mengakumulasi setelah `tokens.max_output_chars` (8 KB) + margin untuk `tail` (mis. simpan 2 buffer: head 64 KB, tail 64 KB, dan hitung jumlah baris/byte total).
  - Di atas ambang, hentikan proses (SIGTERM) dan tandai hasilnya "output dipotong karena melebihi batas" — jangan biarkan perintah berjalan tanpa batas hanya karena tidak ada yang membaca.
  - Hitung jumlah baris/byte **selama** streaming, bukan setelahnya (agar keterangan pemotongan tetap akurat tanpa menyimpan semuanya).
- **Acceptance:** `find /` (atau perintah beroutput > 50 MB) membuat RSS jack naik < 5 MB dibanding idle, dan hasil yang masuk ke model tetap ≤ batas `max_output_lines`/`max_output_chars` dengan keterangan pemotongan yang benar.
- **Verifikasi:** `/usr/bin/time -f "%M KB"` sebelum/sesudah untuk perintah beroutput besar; catat di § 1.
- **Catatan:** item ini **wajib** untuk target Mikrotik/perangkat kecil (§ 6) dan tidak boleh dilewati hanya karena `T-016` sudah selesai.


---

## 5. Fase 4 — Portabilitas

**Tujuan:** "bisa di install di segala perangkat" menjadi benar, bukan klaim.
**Exit criteria fase:** release menyediakan arm64; jack bisa dipakai non-interaktif dari skrip.

### O-13 — Binary arm64 + rapikan jalur rilis
- **Status:** ⚠ **Sebagian selesai 2026-10-23:** `node18-linux-arm64` + `node18-macos-arm64` masuk `pkg.targets`, script `pkg:*`, daftar `files` workflow, deteksi `assetName` di `updater.ts`, dan jalur `install.sh` (yang sudah mendeteksi `arm64`). Sisa: `armv7` (Mikrotik lama) dan pertimbangan target `node22`.
- **Prio/Effort:** P1 · M
- **File:** `package.json:50-59` (`pkg.targets` + script `pkg:*`), `.github/workflows/release.yml:49-52`, `src/core/updater.ts:140-142`, `scripts/install.sh:48-52`
- **Masalah:** sekarang **inkonsisten**: `install.sh` mendeteksi `aarch64|arm64` dan meminta `jack-linux-arm64`, tapi workflow tidak pernah membangun aset itu → unduhan 404 di tengah instalasi. User Raspberry Pi / Mac M-series / Mikrotik ARM64 dijanjikan dukungan lalu gagal.
- **Perubahan:** tambah `node18-linux-arm64` dan `node18-macos-arm64` (opsional `armv7` untuk perangkat Mikrotik lama) di `targets`, script `pkg:*`, daftar `files` workflow, dan deteksi `assetName` di `updater.ts`.
- **Acceptance:** `install.sh` di arm64 tidak lagi 404; `jack --update` di arm64 menemukan aset.
- **Verifikasi:** build lokal `npm run pkg:linux` untuk arm64 (atau cek daftar aset di release v1.1.10), catat ukuran binary di § 1.
- **Catatan:** ini juga menjawab kebutuhan prasyarat Mikrotik di § 6.

### O-14 — Mode one-shot non-interaktif (`jack -p "..."`)
- **✅ Selesai 1.2.0 (`T-018`):** `src/session.ts` memisahkan REPL vs one-shot/non-TTY; `-p`/`--print`, stdin sampai EOF, output polos (tanpa banner/spinner/status bar/ANSI), exit 1 bila tugas gagal total. Diuji dengan mock server dan `< /dev/null`.
- **Prio/Effort:** P1 · M · **Item dengan dampak terbesar untuk "bisa dipakai di mana saja".**
- **File:** `src/index.ts` (parsing argumen + jalur tanpa readline), `src/ui/*` (hormati non-TTY)
- **Masalah:** jack selalu membuka TUI: membersihkan layar, mencetak banner berwarna, lalu `readline`. Tidak ada jalur untuk "kirim satu pertanyaan, cetak jawabannya, keluar". Tanpa ini, jack tidak bisa dipakai dari skrip, cron, SSH Mikrotik, CI, atau sebagai sub-proses agent lain — dan itu bagian terbesar dari "bisa di skala".
- **Perubahan (sekecil mungkin):**
  - Flag `-p, --print <teks>`: kirim `sendMessage` sekali, cetak **teks polos** (tanpa banner, warna, spinner, typewriter), `exit 0/1`.
  - Bila `!process.stdout.isTTY`: warna dimatikan otomatis dan banner dilewati (manfaatkan O-01).
  - Opsional: baca pertanyaan dari stdin bila `-p` tanpa nilai.
- **Acceptance:** `jack -p "cek isi direktori" > hasil.txt` menghasilkan file teks bersih tanpa kode ANSI; `echo "halo" | jack -p > out.txt` juga jalan.
- **Jangan:** menambah format JSON keluaran, streaming callback, atau flag agent lain sebelum ada pemakai nyata.
- **Ketergantungan:** butuh O-01 selesai lebih dulu.
- **⚠ Jadwal (diputuskan 2026-10-18: pindah ke 1.2.0, `T-018`):** tanpa `-p`, agentik hanya berguna secara interaktif — padahal nilai terbesarnya justru dipanggil dari skrip/CI/cron. Alasan kedua: `PRD.md` § 7.2 menetapkan konfirmasi di non-TTY ditolak otomatis, dan perilaku itu hanya bisa diuji lewat jalur one-shot ini. Alasan ketiga: `--allow-write` (disetujui, `PRD.md` § 7.2.1) hanya masuk akal di jalur one-shot, jadi keduanya dikerjakan bersama.

### O-15 — Deteksi instalasi npm tidak salah
- **✅ Selesai 2026-10-23:** `src/core/updater.ts` memakai `!process.pkg` (bukan `process.execPath.includes('node')`); `src/auth/wizard.ts` tidak lagi memuat pengecekan itu di 1.2.0.
- **Prio/Effort:** P3 · XS
- **File:** `src/core/updater.ts:121`, `src/auth/wizard.ts:396`
- **Masalah:** `process.execPath.includes('node') || !process.pkg`. Binary pkg yang dipasang di folder bernama `node-sesuatu` dianggap instalasi npm → `jack --update` menjalankan `npm install -g` yang pasti gagal.
- **Perubahan:** cukup `!process.pkg`.
- **Acceptance:** `jack --update` pada binary pkg selalu mengambil jalur unduh aset.

---

## 6. Fase 5 — Mikrotik (keputusan, belum dikerjakan)

Bagian ini **bukan** daftar item, tapi catatan keputusan: kapan masuk ke Mikrotik, dan dengan cara apa.

**Batasan yang sudah terukur:** Node sendiri 53 MB RSS / 60 ms; jack 64 MB / 90 ms. Binary `pkg` belum diukur (perkiraan umum 20–45 MB, turun dengan `--compress GZip`). Node 18 juga sudah lewat masa dukungan — pertimbangkan target `node22` saat menyentuh `pkg.targets` di O-13.

**Syarat agar container RouterOS v7 bisa menjalankan jack:**
1. Aset **arm64** tersedia → **O-13** (`jack-linux-arm64` + `jack-macos-arm64` dibangun sejak 2026-10-23).
2. RAM perangkat ≥ 256 MB. RB5009 / hAP ax3 (1 GB) aman; hEX / hAP lite (128–256 MB) tidak nyaman. Sejak 1.2.0 tambah syarat: perintah beroutput besar tidak boleh menahan seluruh output di RAM → **O-16**.
3. Storage untuk image + binary (biasanya perlu USB atau NAND yang lega).
4. **Mode non-interaktif** → **O-14** (sudah ada di 1.2.0, `T-018`; sebelumnya crash di non-TTY, lihat O-01).

**Tiga opsi, dari termurah:**

| Opsi | Isi | Biaya | Cocok untuk |
| :--- | :--- | :--- | :--- |
| **A. Node di container** | Setelah Fase 1–4 selesai, jalankan image node + jack di container, panggil via `jack -p` dari skrip RouterOS / SSH. | ≈0 baris kode baru | RB5009, hAP ax3, perangkat ≥256 MB |
| **B. Sama seperti A, tapi dijadwalkan** | Skrip RouterOS memanggil `jack -p` dari scheduler, hasilnya dikirim ke log/notifikasi. | ≈0 baris kode baru | Monitoring ringan |
| **C. Tulis ulang inti ke Go** | Pindahkan auth + api + prompt (±800 baris) ke Go: satu binary statis 6–10 MB, RSS ~10 MB, start ~5 ms, tanpa Node/npm. TUI boleh tetap di Node atau diganti. | **Besar** (minggu) | Perangkat 128 MB, atau kalau targetnya "paling ringan" secara serius |

**Trigger untuk memilih C** (jangan memutuskan sebelum ini terukur di perangkat target):
- RSS one-shot masih > 32 MB **atau** waktu start one-shot > 50 ms; **atau**
- perangkat sasaran < 256 MB RAM; **atau**
- ukuran binary `pkg` > 25 MB setelah kompresi.

**Yang tidak perlu — walau terdengar masuk akal:** framework, database, daemon/background service, lapisan config baru, atau sistem plugin. Semuanya menambah berat tanpa menjawab "ringan dan cepat". (Multi-provider bukan lagi contoh di sini: sejak 1.2.0 ia fitur inti dengan biaya kode kecil, `PRD.md` § 3.4.)

---

## 7. Protokol pengukuran

Dijalankan **sebelum dan sesudah** setiap fase; hasilnya ditulis ulang ke tabel § 1.

```bash
# 1. Waktu & memori (3× ambil yang tercepat)
for i in 1 2 3; do /usr/bin/time -f "%e s  %M KB" node dist/index.js --version; done
/usr/bin/time -f "%e s  %M KB" node -e ""        # batas bawah Node

# 2. Ukuran kode & paket
du -sh dist
find dist -name '*.map' | wc -l
find dist -name '*.d.ts' | wc -l
npm pack --dry-run                              # tarball + unpacked + jumlah file
find src -name '*.ts' | xargs wc -l | tail -1

# 3. Kode mati (harus 0 setelah O-11)
grep -rn "stripExecBlocks\|hasValidToken\|renderModeChange\|toggleMode\|subscribe(" src/

# 4. Non-TTY (harus tidak ada TypeError setelah O-01)
printf '' | node dist/index.js 2>&1 | head -5

# 5. Mode one-shot (setelah O-14: harus tidak ada kode ANSI)
node dist/index.js -p "halo" > /tmp/out.txt 2>&1; grep -c $'\x1b' /tmp/out.txt

# 6. Hemat token (sejak 1.2.0 — metrik baru, tidak ada di baseline v1.1.9)
#    Jalankan satu tugas yang sama (mis. "jelaskan struktur repo ini") dan catat:
#    - token prompt & completion dari usage provider
#    - jumlah karakter output perintah yang dikirim balik ke model
#    Metrik yang dituju: output tool yang dikirim ke model ≤ 8 KB per perintah,
#    dan riwayat tidak pernah melewati ambang auto-/compact (PRD § 3.8).
#    Cara cepat tanpa akun (dipakai di 1.2.0): jalankan endpoint OpenAI-compatible
#    tiruan, lalu catat payload yang diterima server (lihat TASKS.md → Riwayat
#    Selesai v1.2.0: 685 KB output → 1.741 karakter yang dikirim ke model).

# 7. Memori output besar (setelah O-16)
/usr/bin/time -f "%e s  %M KB" find / > /dev/null      # baseline alat-alat, bukan jack
```

**Catatan pengukuran token:** angka token **wajib** dicatat sebagai bagian dari penyelesaian `T-016`, karena inti fitur 1.2.0 adalah "hemat token" — tanpa angka, klaim itu tidak bisa dibuktikan. Karena `usage` baru tersedia setelah `T-012`/`T-016`, baseline v1.1.9 untuk metrik ini dinyatakan "tidak tersedia", bukan "nol".

**Aturan:** satu item boleh ditutup hanya kalau angkanya bergerak ke arah yang dijanjikan, atau alasannya dicatat (mis. "tidak terukur karena butuh akun Google").

---

## 8. Yang tidak dikerjakan

- Menambah dependency runtime (melanggar **I-1**). Termasuk pengganti `open` yang berupa paket lain.
- Refactor massal di luar daftar ini: i18n seluruh modul lama, penataan ulang UI, penamaan ulang berkas.
- Plugin/sistem ekstensi, GUI/web app, mode multi-user/daemon (`PRD.md` § 2.2 sudah melarang).
- ~~Multi-provider (OpenAI/Anthropic langsung)~~ → **keluar dari daftar ini** sejak 1.2.0: provider abstraksi + adapter OpenAI-compatible adalah fitur inti (`PRD.md` § 3.4, `T-011`/`T-012`). Yang tetap tidak dikerjakan: adapter khusus vendor non-OpenAI-compatible (Anthropic native, Bedrock, Vertex) — itu hanya jika ada pemakai nyata.
- Menambah test otomatis di luar `T-019`: itu bagian dari **T-001**/`T-019`, dengan aturan sendiri (`node:test`, tanpa dependency baru).
- Menyimpan riwayat chat ke disk.
- Menambahkan "sistem skill" versi kedua di sini: skill sudah masuk lingkup 1.2.0 (`T-015`); `optimize.md` hanya boleh menyentuh **biaya I/O** pembacaan skill, bukan fiturnya.

---

## 9. Pemetaan ke `TASKS.md`

| Item di sini | Statusnya di `TASKS.md` |
| :--- | :--- |
| O-01 | ✅ Selesai 1.2.0 sebagai bagian **T-018** |
| O-14 | ✅ Selesai 1.2.0 sebagai bagian **T-018** |
| O-03 | ✅ Diserap **T-013** (1.2.0) |
| O-05 | ✅ Selesai lewat **T-011** (**T-005** ditandai diserap) |
| O-04, O-06 | ✅ Tidak lagi berlaku setelah **T-011**/`T-018` (kode lama dihapus) |
| O-07, O-11 | ⚠ Sebagian terpenuhi lewat **T-018**/penulisan ulang 1.2.0; sisanya 1.2.1 |
| O-12 | = **T-003** (jangan duplikasi) |
| O-02, O-08, O-09, O-10, O-13, O-15, O-16 | **task baru** — pindahkan ke Backlog `TASKS.md` saat mulai dikerjakan, dengan prioritas dari tabel § 0 |
| — | `T-011`…`T-017`, `T-019`, `T-020` adalah pekerjaan **1.2.0** (selesai 2026-10-19), bukan item di dokumen ini |

**Urutan pengerjaan yang disarankan (1.2.1):** `O-02` → `O-16` → `O-10` → `O-09` → `O-08` → `O-13` → `O-15` → audit ulang `O-07`/`O-11`.

Alasan urutan: `O-02` menghentikan kerusakan permanen, `O-16` menghentikan pemborosan memori yang baru terasa setelah agentik sering menjalankan perintah beroutput besar, lalu `O-10`/`O-09`/`O-08` memberi perbaikan terasa dengan risiko rendah, dan `O-13` adalah prasyarat Mikrotik. `O-05`/`O-04`/`O-06` keluar dari urutan karena sudah selesai/hilang di 1.2.0.

**Sebelum memulai fase mana pun di sini:** nyatakan ulang baseline § 1 pada kode 1.2.0 (lihat aturan pakai no. 5 di atas), karena struktur kode berubah paling besar pada rilis itu.


