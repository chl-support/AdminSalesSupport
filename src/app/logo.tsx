"use client";

/**
 * Lambang perusahaan.
 *
 * Berkasnya diletakkan di public/logo-chl.png. Selama berkas itu belum ada,
 * komponen ini tidak menampilkan apa pun — bukan ikon gambar rusak: halaman
 * masuk adalah yang pertama dilihat orang, dan gambar rusak di sana membuat
 * seluruh sistem terbaca sebagai setengah jadi.
 *
 * Lambangnya tidak digambar ulang di sini sebagai SVG. Lambang perusahaan yang
 * digambar ulang berdasarkan perkiraan akan mirip, tidak sama — dan yang
 * beredar di dokumen resmi seharusnya yang asli, bukan yang mirip.
 */

import { useEffect, useRef, useState } from "react";

export function Logo({ tinggi = 40, alt = "Cipta Harmoni Lestari" }:
                     { tinggi?: number; alt?: string }) {
  const [gagal, setGagal] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);

  // Gambar yang gagal dimuat sebelum React sempat terpasang tidak pernah
  // memicu onError — dan itu justru yang terjadi pada muatan pertama halaman.
  // Karena itu keadaannya diperiksa sekali lagi setelah komponen terpasang.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setGagal(true);
  }, []);

  if (gagal) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src="/logo-chl.png" alt={alt} height={tinggi}
         style={{ height: tinggi, width: "auto", display: "block" }}
         onError={() => setGagal(true)} />
  );
}
