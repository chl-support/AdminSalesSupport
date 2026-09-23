/**
 * Pencarian jalur antar status, terpisah dari peta tahapnya.
 *
 * Dipisah karena ia memerlukan TRANSITIONS dari mesin alur, dan mesin alur
 * membawa serta penggerak basis data. Layar Approval memakai ./tahap tanpa
 * ikut menyeret semua itu ke peramban.
 */

import { TRANSITIONS } from "./workflow";
import { bolehGerak } from "./tahap";

/**
 * Jalur terpendek dari satu status ke status lain, menurut aturan alur.
 *
 * Dicari, bukan ditulis tangan: daftar tepi yang ditulis tangan akan berbeda
 * dari TRANSITIONS cepat atau lambat, dan bedanya berupa klaim yang berpindah
 * lewat jalur yang sebenarnya tidak diizinkan.
 *
 * Mengembalikan null bila memang tidak ada jalurnya — termasuk bila yang
 * diminta adalah mundur, sebab alur ini hampir seluruhnya searah.
 */
export function jalurKe(dari: string, tuju: string): string[] | null {
  if (dari === tuju) return [];
  if (!bolehGerak(dari)) return null;
  const antre: string[][] = [[dari]];
  const pernah = new Set([dari]);
  while (antre.length) {
    const jalur = antre.shift()!;
    for (const lanjut of TRANSITIONS[jalur[jalur.length - 1]] ?? []) {
      if (pernah.has(lanjut)) continue;
      const baru = [...jalur, lanjut];
      if (lanjut === tuju) return baru.slice(1);
      pernah.add(lanjut);
      antre.push(baru);
    }
  }
  return null;
}

