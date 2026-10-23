# AGENTS.md

Panduan wajib untuk setiap agent (manusia atau AI) yang mengubah repo ini.

## Baca dulu, sebelum apa pun

1. **`PRD.md`** — spesifikasi produk, arsitektur, invariant, dan aturan rekayasa.
2. **`TASKS.md`** — backlog, rencana rilis, dan riwayat pekerjaan.
3. **`optimize.md`** — rencana optimasi (dijadwalkan **v1.2.1**).

Perubahan kode tanpa membaca ketiganya akan ditolak.

## Ringkasan aturan (detail di `PRD.md` § 0)

- Kerjakan hanya task yang ada di `TASKS.md`, sesuai prioritas. Jangan duplikasi.
- **Rencana rilis:** **1.2.0** = fitur (provider custom, mode agentik, prompt v2, skills, hemat token) **+ `O-01`/`O-14`** — `T-011`…`T-020`; **1.2.1** = sisa optimasi (`O-02`, `O-08`…`O-10`, `O-13`, `O-15`, `O-16`, audit ulang `O-07`/`O-11`; `O-04`/`O-05`/`O-06` sudah hilang bersama kode lama). Jangan mencampur keduanya. `TASKS.md` → **Rencana Rilis** adalah rujukannya.
- Setelah selesai, **pindahkan** task ke **Riwayat Selesai** di `TASKS.md` dengan: ringkasan, file yang diubah, verifikasi yang dijalankan.
- Perubahan perilaku → update juga `PRD.md` + baris `Changelog PRD`.
- Naikkan versi di `package.json` untuk setiap rilis; sinkronkan tag `vX.Y.Z`.

## Aturan rekayasa (ringkas)

- YAGNI: pertanyaan pertama selalu "apakah ini perlu ada?"
- Tidak ada dependency runtime baru. Satu-satunya sisa `open` dijadwalkan dihapus (`optimize.md` O-09) — PRD invariant **I-1**.
- **Izin eksekusi berlapis (I-3):** allowlist read-only boleh jalan otomatis, selain itu **konfirmasi**, perintah destruktif **diblok**. Tidak ada auto-approve implisit; di non-TTY konfirmasi ditolak. Satu-satunya pengecualian adalah flag eksplisit `--allow-write` pada jalur one-shot (`PRD.md` § 7.2.1) — dan itu pun tidak membuka pola destruktif. Aturannya di `src/agent/guard.ts` (`PRD.md` § 7.2) — **wajib ada test** (`PRD.md` § 2.4 butir 8).
- **Satu pintu tool (I-9):** eksekusi perintah hanya lewat `ToolRegistry.run()`; tidak ada `exec`/`spawn` di modul lain.
- **Satu interface provider:** tidak ada `if (kind === 'openai')` di luar `src/providers/`.
- **Output tool wajib dipotong (I-11)** sebelum dikirim ke model; riwayat tidak pernah dihapus tanpa jejak (**I-12**).
- Tidak ada mode `chat`/`exec`/`quiz` sejak 1.2.0 — jack selalu agentik.
- Hapus kode mati, jangan komentari.
- Diff terpendek yang benar menang.

## Verifikasi minimum sebelum menyerahkan pekerjaan

Test otomatis baru terbatas (lihat `TASKS.md` T-001/T-019). Jadi:

1. `npm run build` bersih.
2. Smoke test jalur yang diubah dengan `npm run dev`:
   - auth → `jack login` / provider antigravity
   - provider/openai → `jack provider test`
   - agentik → "sebutkan isi direktori ini" (harus memicu `run_command`)
   - klasifikasi izin → `ls -la` (auto), `git commit` (konfirmasi), `rm -rf /` (blok)
   - hemat token → perintah beroutput besar harus dipotong sebelum dikirim ke model
   - skills → `jack skill add <path>` lalu `/skill <nama>`
   - ui/slash → `/help`, `/model`, `/provider`, `/compact`, `/allow`
   - updater → `jack --update` pada versi yang sama
3. Jalankan juga di **non-TTY** (`< /dev/null`, `| cat`) — jalur ini pernah crash (`optimize.md` O-01).
4. Catat bukti (perintah + output yang diamati) di entri `TASKS.md`.
