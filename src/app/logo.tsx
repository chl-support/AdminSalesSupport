"use client";

/**
 * Lambang perusahaan.
 *
 * Berkasnya di public/logo-chl.png, PNG beralfa sehingga sama-sama terbaca di
 * atas bidang gelap halaman masuk dan bidang terang kolom menu. Bila berkasnya
 * hilang, komponen ini tidak menampilkan apa pun — bukan ikon gambar rusak:
 * halaman masuk adalah yang pertama dilihat orang, dan gambar rusak di sana
 * membuat seluruh sistem terbaca sebagai setengah jadi.
 *
 * Lambangnya tidak digambar ulang di sini sebagai SVG. Lambang perusahaan yang
 * digambar ulang berdasarkan perkiraan akan mirip, tidak sama — dan yang
 * beredar di dokumen resmi seharusnya yang asli, bukan yang mirip.
 */

import { useEffect, useRef, useState } from "react";

/**
 * Bagian lambang saja, tanpa tulisan "CIPTA HARMONI LESTARI" di bawahnya.
 *
 * Tulisan itu setinggi 80 piksel pada berkas 1464 piksel: pada ukuran menu ia
 * mengecil menjadi coretan yang tidak terbaca, dan tulisan yang tidak terbaca
 * di dalam lambang terlihat seperti cacat cetak. Di tempat sempit yang dipakai
 * lambangnya saja — namanya toh sudah tertulis di sebelahnya.
 */
const TINGGI_PENUH = 1464;
const TINGGI_LAMBANG = 1300;

export function Logo({ tinggi = 40, hanyaLambang = false,
                       alt = "Cipta Harmoni Lestari" }:
                     { tinggi?: number; hanyaLambang?: boolean; alt?: string }) {
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

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src="/logo-chl.png" alt={alt}
         style={{
           height: hanyaLambang ? tinggi * (TINGGI_PENUH / TINGGI_LAMBANG) : tinggi,
           width: "auto", display: "block",
         }}
         onError={() => setGagal(true)} />
  );

  if (!hanyaLambang) return img;
  return (
    <div style={{ height: tinggi, overflow: "hidden", display: "inline-block" }}>
      {img}
    </div>
  );
}
