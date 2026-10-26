/**
 * Project yang baru dipakai untuk Pricelist saja (atas permintaan, mis.
 * Scotts Vale yang masih disiapkan): menu lain disembunyikan, dan membuka
 * layar lain saat project ini terpilih diarahkan ke /pricelist. Hapus slug
 * dari sini bila project-nya sudah siap memakai semua menu.
 */
export const HANYA_PRICELIST: ReadonlySet<string> = new Set<string>([]);

/** Layar yang tetap boleh dibuka saat project terpilih hanya untuk Pricelist. */
export const LAYAR_PRICELIST = ["/pricelist", "/project", "/admin", "/audit", "/login"];

export const hanyaPricelist = (slug: string | null | undefined) => !!slug && HANYA_PRICELIST.has(slug);

export const layarBoleh = (path: string) =>
  LAYAR_PRICELIST.some((p) => path === p || path.startsWith(p + "/"));
