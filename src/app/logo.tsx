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

/**
 * Lambang satu project.
 *
 * Berkasnya di public/project/<slug>.png — slug yang sama dengan yang ada di
 * tabel projects, jadi menambah project berarti menaruh satu berkas, bukan
 * menyunting daftar di dalam kode.
 *
 * Bila berkasnya belum ada, komponen ini tidak menampilkan apa pun: kartu
 * project-nya kembali berupa nama dan nama PT saja, persis seperti sebelum
 * lambangnya dipasang. Yang dihindari adalah ikon gambar rusak — layar ini
 * halaman pertama sesudah masuk, dan gambar rusak lima kali berjajar di sana
 * membuat seluruh sistem terbaca sebagai setengah jadi.
 *
 * Lambangnya tidak digambar ulang sebagai SVG, sama seperti lambang
 * perusahaan: lambang yang digambar berdasarkan perkiraan akan mirip, tidak
 * sama.
 */
/**
 * Lambang project.
 *
 * Dua varian. `asli` memakai berkas apa adanya, dengan warna masing-masing
 * merek. `emas` — yang dipakai pemilih project — adalah versi satu warna dalam
 * emas perusahaan, dibangkitkan dari alfa berkas aslinya.
 *
 * Varian satu warna itu ada karena keenam lambang ini tidak sekeluarga:
 * cokelat, hijau tua, hitam, emas, hijau kebiruan, masing-masing dengan berat
 * garis sendiri. Disandingkan apa adanya dalam satu kisi, yang terbaca bukan
 * enam project melainkan enam merek yang kebetulan berdampingan. Disamakan
 * warnanya, perbedaan bentuknya justru yang menonjol — dan itulah yang
 * membedakan kartu-kartu ini.
 */
export function LogoProject({ slug, tinggi = 40, alt, varian = "emas" }:
                            { slug: string; tinggi?: number; alt: string;
                              varian?: "asli" | "emas" }) {
  const [gagal, setGagal] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);

  // Gambar yang gagal dimuat sebelum React sempat terpasang tidak pernah
  // memicu onError — dan itu justru yang terjadi pada muatan pertama halaman.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setGagal(true);
  }, []);

  if (gagal) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref}
         src={varian === "emas" ? `/project/emas/${slug}.png`
                                : `/project/${slug}.png`} alt={alt}
         className="logo-project" style={{ height: tinggi }}
         onError={() => setGagal(true)} />
  );
}
