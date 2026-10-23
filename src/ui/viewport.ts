// ============================================================
// JACK-AGENT — Helper tampilan daftar panjang (viewport + scrollbar)
// Dipakai pemilih model/provider/skill dan kotak saran slash command.
// Fungsi murni supaya bisa diuji tanpa TTY.
// ============================================================

/** Baris pertama yang ditampilkan supaya `selected` tetap terlihat. */
export function windowStart(selected: number, total: number, size: number): number {
  if (total <= size || size <= 0) return 0;
  const clamped = Math.max(0, Math.min(selected, total - 1));
  const half = Math.floor(size / 2);
  return Math.max(0, Math.min(clamped - half, total - size));
}

/** Sel scrollbar (true = ibu jari) sepanjang `size`. */
export function scrollbarCells(total: number, size: number, start: number): boolean[] {
  if (size <= 0) return [];
  if (total <= size) return Array.from({ length: size }, () => true);

  const thumb = Math.max(1, Math.round((size * size) / total));
  const maxStart = total - size;
  const travel = size - thumb;
  const offset = maxStart <= 0 ? 0 : Math.round((travel * start) / maxStart);
  const thumbStart = Math.max(0, Math.min(offset, size - thumb));

  return Array.from({ length: size }, (_, i) => i >= thumbStart && i < thumbStart + thumb);
}
