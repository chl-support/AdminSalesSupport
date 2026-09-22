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
 * Lambang project, dengan warna mereknya sendiri.
 *
 * Warnanya tidak pernah diseragamkan. Keenamnya memang tidak sekeluarga —
 * cokelat, hijau tua, hitam, emas, hijau kebiruan — dan menyamakannya memang
 * membuat kisinya lebih tenang, tetapi lambang project adalah milik
 * project itu, bukan bahan susunan layar. Yang disamakan bidangnya, bukan
 * gambarnya.
 */
/**
 * Lambang yang selebar ini atau kurang dibanding tingginya dianggap tegak.
 *
 * Keenam lambang terbelah jelas pada angka ini: Banara 0,94 dan Mazenta 0,79
 * di satu sisi; Marchand 2,36, Permai 3,51, Naraya 3,78, dan BIO 4,32 di sisi
 * lain. Tidak ada yang berada di dekat batasnya, jadi penggolongan ini tidak
 * goyah oleh selisih beberapa piksel.
 */
const RASIO_TEGAK = 1.6;

export function LogoProject({ slug, tinggi = 40, alt, gantiTeks, tinggiTegak }:
                            { slug: string; tinggi?: number; alt: string;
                              gantiTeks?: string; tinggiTegak?: number }) {
  const [gagal, setGagal] = useState(false);
  const [tegak, setTegak] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);

  // Gambar yang gagal dimuat sebelum React sempat terpasang tidak pernah
  // memicu onError — dan itu justru yang terjadi pada muatan pertama halaman.
  //
  // Bentuknya diukur di sini pula, dengan alasan yang sama: gambar yang sudah
  // selesai dimuat sebelum React terpasang tidak pernah memicu onLoad.
  useEffect(() => {
    const img = ref.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth === 0) setGagal(true);
    else ukurBentuk(img);
  }, []);

  const ukurBentuk = (img: HTMLImageElement) => {
    if (!img.naturalHeight) return;
    setTegak(img.naturalWidth / img.naturalHeight < RASIO_TEGAK);
  };

  // Tanpa berkasnya, namanya yang ditulis. Kartu pemilih project tidak lagi
  // menuliskan nama project di bawah lambangnya — namanya sudah ada di dalam
  // lambang itu — jadi lambang yang hilang berarti kartu tanpa nama sama
  // sekali, dan yang tersisa hanya nama PT yang dipakai bersama beberapa
  // project.
  if (gagal) {
    return gantiTeks ? <b className="ganti-lambang">{gantiTeks}</b> : null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    // Lambang tegak diberi tinggi tersendiri bila pemanggilnya menyediakan.
    // Dipatok satu tinggi untuk semua, lambang yang hampir persegi menyusut
    // menjadi seperempat lebar lambang yang memanjang, dan di sebelahnya
    // tampak seperti gambar yang gagal dimuat separuh.
    <img ref={ref} src={`/project/${slug}.png`} alt={alt}
         className="logo-project"
         style={{ height: tegak && tinggiTegak ? tinggiTegak : tinggi }}
         onLoad={(e) => ukurBentuk(e.currentTarget)}
         onError={() => setGagal(true)} />
  );
}
