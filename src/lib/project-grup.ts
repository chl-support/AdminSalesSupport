/**
 * Project yang tampil sebagai satu kartu di pemilih project lalu dipecah
 * menjadi beberapa cluster (mis. The Sanctuary Collection). Tiap cluster
 * adalah project tersendiri di basis data — draf pricelist, unit, dan
 * datanya terpisah — tetapi dipilih lewat kartu induknya: kartu induk
 * diklik, pilihan cluster muncul, baru masuk menu.
 *
 * `slug` induk dipakai untuk lambang kartunya (public/project/<slug>.png).
 */
export type GrupProject = { slug: string; nama: string; anggota: string[] };

export const GRUP_PROJECT: GrupProject[] = [
  {
    slug: "the-sanctuary-collection", nama: "The Sanctuary Collection",
    anggota: ["tsc-tanglin-parc", "tsc-newton-springs", "tsc-orchard-riviera", "tsc-scotts-vale"],
  },
];

/** Grup tempat project (cluster) ini bernaung, bila ada. */
export const grupDari = (slug: string | null | undefined) =>
  slug ? GRUP_PROJECT.find((g) => g.anggota.includes(slug)) : undefined;
