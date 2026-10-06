"use client";

/**
 * Penanda tanda tangan pada foto KTP — satu alat, dipakai dua layar.
 *
 * Agent menandainya sendiri dari tautan pendaftaran; Admin Sales menandainya
 * di layar Spesimen saat fotonya diserahkan di luar sistem — lewat WhatsApp,
 * surel, atau map kertas. Keduanya mengerjakan hal yang persis sama: memilih
 * foto, menggeser kotak ke tanda tangan yang tercetak, lalu memotongnya.
 *
 * Karena itu ia berdiri sendiri di sini, bukan disalin ke layar kedua. Alat
 * potong yang ditulis dua kali akan berbeda pada salah satunya cepat atau
 * lambat, dan bedanya berupa spesimen yang dipotong dengan aturan yang lain
 * daripada yang dipakai membandingkannya.
 *
 * Potongannya tidak dibuat di tiap gerakan jari — kanvas dibaca sekali, saat
 * yang memakainya menekan tombol kirim. Itu sebabnya hasilnya diambil lewat
 * ref, bukan dikirim lewat onChange: membuat PNG pada tiap gerakan membuat
 * kotaknya tersendat justru saat sedang digeser.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState }
  from "react";
import { PilihBerkas } from "./pilih-berkas";

/** Batas ukuran foto KTP. Sama dengan batas pada server (lib/spesimen). */
export const BATAS_KTP = 3 * 1024 * 1024;

export type PenandaKtpRef = {
  /** Potongan tanda tangan sebagai data URL PNG, atau null bila belum ditandai. */
  potong: () => string | null;
  /** Foto KTP utuh yang sedang ditandai. */
  berkas: () => { dataUrl: string; tipe: string } | null;
};

/**
 * Cari tanda tangan pada foto KTP, supaya kotaknya sudah terpilih sendiri.
 *
 * Menarik kotak di atas cetakan kecil, dengan jempol, di layar ponsel, sambil
 * memegang kartunya — itulah langkah tempat pendaftaran paling sering berhenti.
 * Menandai sendiri lalu meminta orangnya memeriksa membalik pekerjaannya:
 * menggeser kotak yang sudah ada jauh lebih mudah daripada membuatnya.
 *
 * Caranya sederhana dan sengaja tidak pintar. Tanda tangan pada KTP selalu
 * berada di kanan bawah, di bawah tempat dan tanggal penerbitan, dan ia gumpalan
 * tinta paling bawah di sana. Jadi: ambil wilayah kanan bawah, cari piksel yang
 * jauh lebih gelap daripada latarnya, lalu ambil gumpalan terbawah — dipisahkan
 * dari tulisan di atasnya oleh baris-baris kosong di antara keduanya.
 *
 * Yang gagal tidak merusak apa pun: kotaknya tidak terpasang, dan orangnya
 * menariknya sendiri seperti sebelumnya.
 */
type Kotak = { x: number; y: number; w: number; h: number };

/**
 * Letak biasanya: kanan bawah kartu, di bawah tempat dan tanggal penerbitan.
 *
 * Dipakai bila pencarian tidak menemukan apa pun — foto terlalu gelap, tinta
 * terlalu tipis, kartunya terlalu miring. Kotak yang meleset masih jauh lebih
 * mudah digeser daripada kotak yang harus dibuat dari nol dengan jempol, dan
 * layar tidak pernah menampilkan keadaan "tidak ada apa-apa, silakan mulai
 * sendiri" — keadaan itulah yang membuat orang berhenti.
 */
function letakBiasanya(img: HTMLImageElement): Kotak {
  const l = img.clientWidth, t = img.clientHeight;
  const w = l * 0.28, h = t * 0.24;
  // Dirapatkan ke sudut kanan bawah gambar. Foto KTP hampir selalu diambil
  // rapat pada kartunya, jadi sudut foto adalah sudut kartu — dan kotak yang
  // menyentuh kedua tepinya lebih sering sudah memuat tanda tangannya daripada
  // kotak yang menggantung sedikit di dalam.
  return { x: l - w, y: t - h, w, h };
}

function deteksiTandaTangan(img: HTMLImageElement): Kotak | null {
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!W || !H) return null;

  // Dikecilkan lebih dulu: foto ponsel 12 MP tidak menambah ketepatan apa pun
  // di sini, hanya membuat peramban menggantung beberapa detik.
  const skala = Math.min(1, 1100 / W);
  const cw = Math.max(1, Math.round(W * skala));
  const ch = Math.max(1, Math.round(H * skala));
  const cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, cw, ch);

  // Wilayah dugaan: sepertiga kanan, sepertiga bawah.
  const x0 = Math.floor(cw * 0.62), y0 = Math.floor(ch * 0.58);
  const lw = cw - x0, lh = ch - y0;
  if (lw < 20 || lh < 20) return null;

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(x0, y0, lw, lh).data;
  } catch {
    return null; // kanvas ternoda — tidak terjadi untuk data URL, tetapi murah untuk dijaga
  }

  const terang = new Float32Array(lw * lh);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    terang[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // Latar diambil dari nilai tengah wilayah itu sendiri, bukan dari angka tetap:
  // foto di bawah lampu kuning dan foto di bawah matahari punya "putih" yang
  // sama sekali berbeda.
  const urut = Float32Array.from(terang).sort();
  const latar = urut[Math.floor(urut.length * 0.6)];
  const ambang = Math.min(latar - 42, 165);

  // Tepi wilayah diabaikan: bayangan kartu dan garis tepi foto berkumpul persis
  // di sana, dan gumpalan terbawah pada foto yang wajar justru berupa bayangan
  // meja — bukan tanda tangan.
  const tepi = Math.max(2, Math.round(Math.min(lw, lh) * 0.03));

  const perBaris = new Int32Array(lh);
  for (let y = tepi; y < lh - tepi; y++) {
    for (let x = tepi; x < lw - tepi; x++) {
      if (terang[y * lw + x] < ambang) perBaris[y]++;
    }
  }

  const isi = (n: number) => n >= Math.max(2, Math.round(lw * 0.012));
  const jeda = Math.max(3, Math.round(lh * 0.03));

  // Seluruh gumpalan didaftar, lalu dinilai dari yang paling bawah. Berhenti
  // pada gumpalan pertama yang ditemui berarti satu garis tepi setebal empat
  // piksel sudah cukup menggagalkan seluruh pencarian.
  const gumpalan: { atas: number; bawah: number }[] = [];
  let mulai = -1, kosong = 0;
  for (let y = lh - tepi - 1; y >= tepi; y--) {
    if (isi(perBaris[y])) {
      if (mulai < 0) mulai = y;
      kosong = 0;
    } else if (mulai >= 0 && ++kosong >= jeda) {
      gumpalan.push({ atas: y + kosong, bawah: mulai });
      mulai = -1; kosong = 0;
    }
  }
  if (mulai >= 0) gumpalan.push({ atas: tepi, bawah: mulai });

  for (const g of gumpalan) {
    const tinggi = g.bawah - g.atas + 1;
    if (tinggi < lh * 0.06 || tinggi > lh * 0.6) continue;

    const perKolom = new Int32Array(lw);
    for (let y = g.atas; y <= g.bawah; y++) {
      for (let x = tepi; x < lw - tepi; x++) {
        if (terang[y * lw + x] < ambang) perKolom[x]++;
      }
    }
    let kiri = -1, kanan = -1;
    for (let x = 0; x < lw; x++) if (perKolom[x] >= 1) { kiri = x; break; }
    for (let x = lw - 1; x >= 0; x--) if (perKolom[x] >= 1) { kanan = x; break; }
    if (kiri < 0 || kanan <= kiri) continue;

    const lebar = kanan - kiri + 1;
    // Tanda tangan lebih lebar daripada tinggi, dan tidak setipis satu baris
    // tulisan. Yang tidak memenuhi biasanya baris "KOTA ... / tanggal".
    if (lebar < lw * 0.15 || lebar > lw * 0.95) continue;
    if (lebar / tinggi > 9) continue;

    const pad = Math.round(Math.max(lebar, tinggi) * 0.1);
    const kx = Math.max(0, x0 + kiri - pad);
    const ky = Math.max(0, y0 + g.atas - pad);
    const kw = Math.min(cw - kx, lebar + pad * 2);
    const kh = Math.min(ch - ky, tinggi + pad * 2);

    const keLayar = img.clientWidth / cw;
    return { x: kx * keLayar, y: ky * keLayar,
             w: kw * keLayar, h: kh * keLayar };
  }
  return null;
}

export const PenandaKtp = forwardRef<PenandaKtpRef, {
  busy?: boolean;
  /** Dipanggil saat foto atau kotaknya berubah, supaya tombol kirim tahu. */
  onBerubah?: (siap: boolean) => void;
  /** Dipanggil saat berkas yang dipilih ditolak sebelum sempat terbaca. */
  onTolak?: (judul: string, kalimat: string) => void;
  /** Isi tambahan di atas pemilih berkas — contoh foto, syarat, dan sejenisnya. */
  children?: React.ReactNode;
}>(function PenandaKtp({ busy, onBerubah, onTolak, children }, ref) {
  const [ktpUrl, setKtpUrl] = useState<string | null>(null);
  const [ktpTipe, setKtpTipe] = useState<string>("");
  const [kotak, setKotak] = useState<Kotak | null>(null);
  const gambarRef = useRef<HTMLImageElement | null>(null);
  // Apakah kotak yang tampil dipilih sendiri oleh sistem. Dipakai hanya untuk
  // memilih kalimat yang tepat: yang ditandai sendiri perlu diperiksa, yang
  // ditarik orangnya tidak.
  const [otomatis, setOtomatis] = useState(false);
  // Apakah kotaknya hasil pencarian atau sekadar letak yang biasanya. Yang
  // ditebak perlu dikatakan apa adanya — "ditandai otomatis" untuk kotak yang
  // sebetulnya asal taruh akan membuat orang percaya pada yang salah.
  const [ketemu, setKetemu] = useState(false);

  /**
   * Keadaan "siap dikirim" dikabarkan dari efek, bukan dari tiap pemanggil.
   *
   * Sebelumnya tiap tempat yang mengubah kotaknya ikut mengabarkan sendiri —
   * dan yang mengabarkan saat fotonya baru saja dipasang membaca ktpUrl dari
   * render sebelumnya, sehingga tombol kirim tetap mati walau kotaknya sudah
   * tampak di layar. Satu sumber kebenaran, dibaca sesudah render: yang
   * terlihat di layar dan yang diketahui tombolnya tidak dapat berbeda lagi.
   */
  useEffect(() => {
    onBerubah?.(Boolean(ktpUrl && kotak));
    // onBerubah sengaja tidak ikut: pemanggil yang menuliskannya sebagai
    // fungsi baru tiap render akan membuat efek ini berjalan tanpa henti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ktpUrl, kotak]);

  const pilihKtp = (f: File) => {
    if (!/^image\//.test(f.type)) {
      onTolak?.("Berkas bukan gambar",
                "Foto KTP harus berupa JPG, PNG, WEBP, atau HEIC.");
      return;
    }
    if (f.size > BATAS_KTP) {
      onTolak?.("Foto terlalu besar",
                `${(f.size / 1024 / 1024).toFixed(1)} MB, sedangkan batasnya ` +
                "3 MB. Perkecil fotonya lalu ulangi.");
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      setKtpUrl(String(fr.result)); setKotak(null);
      setOtomatis(false); setKetemu(false);
    };
    fr.readAsDataURL(f);
    setKtpTipe(f.type);
  };

  /** Titik pada gambar, dalam satuan tampilan (bukan piksel asli). */
  const titik = (e: React.MouseEvent | React.TouchEvent) => {
    const r = gambarRef.current!.getBoundingClientRect();
    const p = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };

  /**
   * Satu gerakan seret melayani tiga hal sekaligus: membuat kotak baru,
   * memindahkan yang sudah ada, dan mengubah ukurannya lewat pegangan di
   * sudutnya.
   *
   * Yang menentukan bukan tombol terpisah melainkan tempat jari mendarat —
   * pada pegangan, di dalam kotak, atau di luar keduanya. Menyediakan tombol
   * "ubah ukuran" berarti satu ketukan tambahan pada layar yang justru sedang
   * dipakai satu tangan sambil memegang kartunya.
   */
  const aksi = useRef<
    { mode: string; dari: { x: number; y: number }; awal: Kotak } | null>(null);

  const batas = () => {
    const img = gambarRef.current;
    return { l: img?.clientWidth ?? 0, t: img?.clientHeight ?? 0 };
  };

  const mulaiSeret = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const dari = titik(e);
    const arah = (e.target as HTMLElement)?.dataset?.arah;

    if (arah && kotak) {
      aksi.current = { mode: arah, dari, awal: kotak };
      return;
    }
    if (kotak && dari.x >= kotak.x && dari.x <= kotak.x + kotak.w &&
        dari.y >= kotak.y && dari.y <= kotak.y + kotak.h) {
      aksi.current = { mode: "geser", dari, awal: kotak };
      return;
    }
    // Di luar kotak: menggambar kotak baru, seperti sebelumnya.
    aksi.current = { mode: "baru", dari, awal: { x: dari.x, y: dari.y, w: 0, h: 0 } };
    setKotak(null);
    setOtomatis(false);
    setKetemu(false);
  };

  const seret = (e: React.MouseEvent | React.TouchEvent) => {
    const a = aksi.current;
    if (!a) return;
    e.preventDefault();
    const p = titik(e);
    const { l, t } = batas();
    const dx = p.x - a.dari.x, dy = p.y - a.dari.y;
    const MIN = 16;

    if (a.mode === "baru") {
      setKotak({ x: Math.min(a.dari.x, p.x), y: Math.min(a.dari.y, p.y),
                 w: Math.abs(p.x - a.dari.x), h: Math.abs(p.y - a.dari.y) });
      return;
    }

    if (a.mode === "geser") {
      // Kotak yang digeser tidak boleh keluar dari gambar: yang di luar tidak
      // dapat dipotong, dan kotaknya menghilang tanpa penjelasan.
      setKotak({
        ...a.awal,
        x: Math.min(Math.max(0, a.awal.x + dx), l - a.awal.w),
        y: Math.min(Math.max(0, a.awal.y + dy), t - a.awal.h),
      });
      return;
    }

    // Pegangan sudut: tepi yang dipegang bergerak, tepi seberangnya diam.
    let { x, y, w, h } = a.awal;
    if (a.mode.includes("kiri")) {
      const kanan = a.awal.x + a.awal.w;
      x = Math.min(Math.max(0, a.awal.x + dx), kanan - MIN);
      w = kanan - x;
    }
    if (a.mode.includes("kanan")) {
      w = Math.min(Math.max(MIN, a.awal.w + dx), l - a.awal.x);
    }
    if (a.mode.includes("atas")) {
      const bawah = a.awal.y + a.awal.h;
      y = Math.min(Math.max(0, a.awal.y + dy), bawah - MIN);
      h = bawah - y;
    }
    if (a.mode.includes("bawah")) {
      h = Math.min(Math.max(MIN, a.awal.h + dy), t - a.awal.y);
    }
    setKotak({ x, y, w, h });
  };

  const selesaiSeret = () => { aksi.current = null; };

  /**
   * Potong bagian yang ditandai dari gambar aslinya.
   *
   * Dipotong dari piksel asli, bukan dari gambar yang sudah dikecilkan ke layar:
   * tanda tangan pada KTP tercetak kecil, dan memotong dari versi layar ponsel
   * membuang justru detail yang hendak dibandingkan.
   */
  const potong = (): string | null => {
    const img = gambarRef.current;
    if (!img || !kotak || kotak.w < 12 || kotak.h < 8) return null;
    const sx = img.naturalWidth / img.clientWidth;
    const sy = img.naturalHeight / img.clientHeight;
    const cv = document.createElement("canvas");
    cv.width = Math.round(kotak.w * sx);
    cv.height = Math.round(kotak.h * sy);
    const c2d = cv.getContext("2d")!;
    c2d.fillStyle = "#fff";
    c2d.fillRect(0, 0, cv.width, cv.height);
    c2d.drawImage(img, Math.round(kotak.x * sx), Math.round(kotak.y * sy),
                  cv.width, cv.height, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/png");
  };

  useImperativeHandle(ref, () => ({
    potong,
    berkas: () => (ktpUrl ? { dataUrl: ktpUrl, tipe: ktpTipe } : null),
  }));

  return (
    <>
      {/* Contoh dan syarat foto ditaruh sebelum pemilih berkas, bukan
          sesudahnya: sesudah dipilih, fotonya sudah terlanjur diambil. */}
      {!ktpUrl && children}

      <PilihBerkas accept="image/*" capture="environment"
                   disabled={busy} style={{ width: "100%", fontSize: 12.5 }}
                   onChange={(e) => {
                     const f = e.target.files?.[0];
                     e.target.value = "";
                     if (f) pilihKtp(f);
                   }} />

      {ktpUrl && (
        <>
          <div className="lbl" style={{ marginTop: 12 }}>
            {!otomatis ? "Tarik kotak di atas tanda tangan pada KTP"
              : ketemu ? "Periksa kotaknya — geser bila belum pas"
              : "Geser kotaknya ke tanda tangan pada KTP"}
          </div>
          {/* Gambar dan kotak penanda menumpuk; kotaknya digambar dengan
              posisi mutlak di atas gambarnya, bukan di dalam kanvas, supaya
              fotonya tetap tajam saat diperbesar peramban. */}
          <div className="tandai"
               onMouseDown={mulaiSeret} onMouseMove={seret}
               onMouseUp={selesaiSeret} onMouseLeave={selesaiSeret}
               onTouchStart={mulaiSeret} onTouchMove={seret}
               onTouchEnd={selesaiSeret}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={gambarRef} src={ktpUrl} alt="Foto KTP" draggable={false}
                 onLoad={(e) => {
                   const img = e.currentTarget;
                   const k = deteksiTandaTangan(img);
                   setKotak(k ?? letakBiasanya(img));
                   setOtomatis(true);
                   setKetemu(Boolean(k));
                 }} />
            {kotak && (
              <div className="kotak-tandai"
                   style={{ left: kotak.x, top: kotak.y,
                            width: kotak.w, height: kotak.h }}>
                {["atas-kiri", "atas-kanan", "bawah-kiri", "bawah-kanan"]
                  .map((a) => (
                    <span key={a} data-arah={a} className={`pegangan ${a}`} />
                  ))}
              </div>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--mut)", textAlign: "center",
                      marginTop: 6 }}>
            {!otomatis
              ? "Pada e-KTP, tanda tangan tercetak kecil di bawah foto, " +
                "sebelah kanan bawah kartu."
              : ketemu
              ? "Kotak merah ditandai otomatis. Geser dari tengahnya, tarik " +
                "titik putih di sudutnya untuk mengubah ukuran."
              : "Tanda tangannya tidak terbaca pada foto ini, jadi kotaknya " +
                "ditaruh pada letak yang biasanya. Geser dari tengahnya, " +
                "tarik titik putih di sudutnya untuk mengubah ukuran."}
          </p>
        </>
      )}
    </>
  );
});
