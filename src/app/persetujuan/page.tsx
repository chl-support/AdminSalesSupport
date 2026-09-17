"use client";

/**
 * Approval / Persetujuan.
 *
 * Layarnya sudah ada sejak lama dengan nama lain: konsol klaim, tempat klaim
 * diperiksa, disetujui, dikembalikan, dan diteruskan. Yang berubah hanya
 * namanya pada menu.
 *
 * Karena itu halaman ini mengalihkan, bukan menyalin isinya. Dua salinan layar
 * yang sama akan berbeda perilaku cepat atau lambat, dan bedanya berupa klaim
 * yang disetujui di satu layar tetapi tidak di layar lain.
 */

import { useEffect } from "react";

import { MemeriksaSesi } from "../kerangka";

export default function PersetujuanPage() {
  useEffect(() => { location.replace("/konsol"); }, []);
  return <MemeriksaSesi />;
}
