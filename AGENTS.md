# AGENTS.md

Panduan wajib untuk setiap agent (manusia atau AI) yang mengubah repo ini.

## Baca dulu, sebelum apa pun

1. **`PRD.md`** — spesifikasi produk, arsitektur, invariant, dan aturan rekayasa.
2. **`TASKS.md`** — backlog dan riwayat pekerjaan.

Perubahan kode tanpa membaca keduanya akan ditolak.

## Ringkasan aturan (detail di `PRD.md` § 0)

- Kerjakan hanya task yang ada di `TASKS.md`, sesuai prioritas. Jangan duplikasi.
- Setelah selesai, **pindahkan** task ke **Riwayat Selesai** di `TASKS.md` dengan: ringkasan, file yang diubah, verifikasi yang dijalankan.
- Perubahan perilaku → update juga `PRD.md` + baris `Changelog PRD`.
- Naikkan versi di `package.json` untuk setiap rilis; sinkronkan tag `vX.Y.Z`.

## Aturan rekayasa (ringkas)

- YAGNI: pertanyaan pertama selalu "apakah ini perlu ada?"
- Tidak ada dependency runtime baru di luar `open` (PRD invariant **I-1**).
- Tidak ada auto-approve eksekusi perintah (**I-3**) — semua perintah lewat `showConfirmDialog`.
- Hapus kode mati, jangan komentari.
- Diff terpendek yang benar menang.

## Verifikasi minimum sebelum menyerahkan pekerjaan

Belum ada test otomatis (lihat `TASKS.md` T-001). Jadi:

1. `npm run build` bersih.
2. Smoke test jalur yang diubah dengan `npm run dev`:
   - auth → `jack --config`
   - api/streaming → satu pesan di mode chat
   - exec → perintah trivial (mis. cek isi direktori)
   - ui/slash → `/help`, `/model`, `/cd`
   - updater → `jack --update` pada versi yang sama
3. Catat bukti (perintah + output yang diamati) di entri `TASKS.md`.
