"use client";

/**
 * Navigasi konsol — kolom di sebelah kiri.
 *
 * Sebelumnya berupa deretan mendatar di kepala halaman. Bentuk itu tidak
 * menyisakan tempat untuk susunan bertingkat, padahal sebagian bab memang hanya
 * wadah: isinya ada pada anaknya.
 *
 * Sengaja tidak dipasang di layout akar: layar tanda tangan agent
 * (/sign/[token]) dan layar pendaftaran spesimen (/daftar-ttd/[token]) dibuka
 * orang luar lewat tautan WhatsApp. Menampilkan menu internal di sana
 * membocorkan struktur sistem sekaligus mengundang klik yang akan berakhir 401.
 * Halaman yang memang bagian dari konsol memanggilnya lewat <Kerangka>.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useBahasa, type Bahasa } from "./bahasa";

type Butir = {
  /**
   * Lintasan yang dituju. Boleh kosong: "Data Marketing" adalah nama rumpun,
   * bukan layar — satu-satunya layar di bawahnya adalah Spesimen Tanda Tangan.
   * Butir tanpa href digambar sebagai judul rumpun yang tidak dapat ditekan,
   * bukan tautan yang mengantar ke mana-mana.
   */
  href?: string;
  /** Label per bahasa. Keduanya wajib ada, jadi tidak ada menu yang diam-diam
      tetap berbahasa Indonesia saat sisanya sudah berganti. */
  label: Record<Bahasa, string>;
  peran?: string[] | null;
  anak?: Butir[];
};

/**
 * Menu, beserta peran yang boleh melihatnya.
 *
 * `peran` kosong berarti terbuka untuk semua. Menyembunyikan menu hanya
 * kerapian — setiap endpoint di belakangnya tetap memeriksa perannya sendiri,
 * jadi mengetikkan alamatnya langsung tidak memberi akses apa pun.
 */
const MENU: Butir[] = [
  // Data marketing di atas: penerima fee berasal dari sini, dan yang belum
  // punya spesimen tanda tangan klaimnya selalu berakhir di pemeriksaan manual.
  // Yang menentukan hasil pengajuan karenanya dilihat lebih dulu daripada
  // pengajuannya.
  //
  // Tanpa href: ia nama rumpun, dan satu-satunya layar di bawahnya adalah
  // Spesimen Tanda Tangan. Menjadikannya tautan ke layar anaknya berarti dua
  // butir menu mengantar ke tempat yang sama, dan keduanya menyala bersamaan
  // saat layar itu dibuka.
  {
    label: { id: "Data Marketing", en: "Marketing Data" },
    peran: ["admin_sales", "admin_system"],
    anak: [
      { href: "/spesimen",
        label: { id: "Spesimen Tanda Tangan", en: "Specimen Signature" } },
    ],
  },
  // Keempat jenis fee tidak lagi menjadi butir menu tersendiri. Menu dan daftar
  // pilihan pada layarnya adalah dua jalan menuju hal yang sama, dan yang satu
  // selalu lebih pendek — yang lain lalu hanya memanjangkan kolom menu. Jenisnya
  // dipilih di dalam layar datanya, tempat penyaring lain juga berada.
  { href: "/klaim", label: { id: "Pengajuan Fee", en: "Fee Submission" } },
  { href: "/memo", label: { id: "Memo Approval", en: "Approval Memo" } },
  { href: "/sirkulasi",
    label: { id: "Sirkulasi Dokumen", en: "Document Workflow" } },
  { href: "/persetujuan",
    label: { id: "Approval / Persetujuan", en: "Approval Status" } },
  { href: "/laporan",
    label: { id: "Report / Laporan", en: "Marketing Report" } },
  // Administrasi sempat hilang dari menu saat susunannya ditata ulang, padahal
  // layarnya tetap ada: unggah Laporan Penjualan, Laporan Penerimaan, dan
  // Report Agent semuanya di sana. Butir yang hilang membuat satu-satunya jalan
  // ke sana adalah mengetik alamatnya, dan itu bukan jalan yang dapat diingat
  // orang.
  //
  // Hanya Admin IT: di dalamnya ada pengosongan data dan penggantian sandi
  // pengguna lain.
  { href: "/admin", label: { id: "Administrasi", en: "Administration" },
    peran: ["admin_system"] },
];

const boleh = (b: Butir, peran?: string) =>
  !b.peran || (peran ? b.peran.includes(peran) : false);

/**
 * Menu induk dari lintasan sekarang, bila ia memang anak dari sesuatu.
 *
 * Dipakai kepala halaman untuk menyebut halaman ini bagian dari mana —
 * "Closing Fee" sendirian tidak memberi tahu bahwa ia salah satu dari empat
 * jenis di bawah Pengajuan Fee, dan menu di kiri baru menjawabnya setelah
 * dilihat. Yang tidak punya induk mengembalikan null alih-alih menyebut
 * dirinya sendiri: baris yang mengulang judul di bawahnya bukan keterangan,
 * hanya baris tambahan yang harus dilewati mata.
 */
export function indukDari(path: string):
    { href: string; label: Record<Bahasa, string> } | null {
  for (const m of MENU) {
    // Induk tanpa href dilewati: ia nama rumpun, bukan layar, jadi tidak ada
    // tempat yang dapat dituju baris "kembali" di kepala halaman.
    if (!m.href) continue;
    if (m.anak?.some((a) => a.href &&
                            (path === a.href || path.startsWith(a.href + "/")))) {
      return { href: m.href, label: m.label };
    }
  }
  return null;
}

/**
 * Panah pelipat. Satu bentuk yang diputar, bukan dua gambar berbeda: yang
 * membedakan "terbuka" dan "tertutup" memang hanya arahnya, dan memutarnya
 * membuat peralihannya terbaca sebagai gerakan yang sama benda.
 */
function IkonLipat({ terbuka }: { terbuka: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"
         fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round"
         style={{ transform: `rotate(${terbuka ? 90 : 0}deg)`,
                  transition: "transform .16s ease" }}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

const BANTU = {
  id: { buka: (n: string) => `Tampilkan sub menu ${n}`,
        tutup: (n: string) => `Sembunyikan sub menu ${n}` },
  en: { buka: (n: string) => `Show ${n} submenu`,
        tutup: (n: string) => `Hide ${n} submenu` },
};

/** Di mana rumpun yang sedang terlipat disimpan. */
const KUNCI_LIPAT = "chl.menu-tertutup";

export function Nav({ peran }: { peran?: string }) {
  const path = usePathname();
  const { bahasa } = useBahasa();
  const bantu = BANTU[bahasa];

  /**
   * Rumpun yang sedang terlipat, bukan yang sedang terbuka.
   *
   * Yang disimpan kebalikannya supaya keadaan awalnya — belum ada yang pernah
   * dilipat — berarti semuanya terbuka. Menyimpan "yang terbuka" membuat
   * pemakai baru, dan siapa pun yang penyimpanan situsnya dibersihkan,
   * mendapat menu yang seluruh sub-nya tersembunyi.
   */
  const [tertutup, setTertutup] = useState<string[]>([]);

  // Dibaca setelah komponen terpasang, bukan saat render: membaca localStorage
  // saat render membuat keluaran server dan klien berbeda. Dibungkus try/catch
  // karena di jendela penyamaran ia melempar, dan menu yang gagal tampil karena
  // ingatan lipatan jauh lebih mahal daripada manfaatnya.
  useEffect(() => {
    try {
      const t = JSON.parse(localStorage.getItem(KUNCI_LIPAT) ?? "[]");
      if (Array.isArray(t)) setTertutup(t.filter((x) => typeof x === "string"));
    } catch { /* biarkan semuanya terbuka */ }
  }, []);

  const lipat = (kunci: string) => {
    setTertutup((lama) => {
      const baru = lama.includes(kunci)
        ? lama.filter((x) => x !== kunci) : [...lama, kunci];
      try { localStorage.setItem(KUNCI_LIPAT, JSON.stringify(baru)); }
      catch { /* tidak apa-apa */ }
      return baru;
    });
  };

  // Cocok persis, atau induk dari lintasan sekarang. `startsWith` telanjang
  // akan membuat "/klaim" terpilih bersamaan dengan "/klaim/komisi".
  const aktif = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <nav className="nav">
      {MENU.filter((m) => boleh(m, peran)).map((m) => {
        const anak = (m.anak ?? []).filter((a) => boleh(a, peran));
        // Rumpun tanpa lintasan sendiri yang seluruh anaknya tersembunyi oleh
        // peran tidak menyisakan apa pun yang dapat ditekan — judulnya saja
        // hanya menggantung sebagai kata yang tidak menuju ke mana-mana.
        if (!m.href && !anak.length) return null;

        const kunci = m.href ?? m.label.id;
        const idAnak = `submenu-${kunci.replace(/[^a-zA-Z0-9]+/g, "-")}`;
        // Rumpun yang memuat halaman yang sedang dibuka dipaksa terbuka. Menu
        // yang menyembunyikan justru baris yang sedang menyala membuat orang
        // kehilangan letaknya sendiri di dalam sistem.
        const memuatYangAktif = anak.some((a) => aktif(a.href!));
        const terbuka = memuatYangAktif || !tertutup.includes(kunci);
        const nama = m.label[bahasa];

        return (
          <div key={kunci} className="grup">
            {m.href ? (
              /* Punya layarnya sendiri: namanya tetap tautan, dan pelipatnya
                 tombol tersendiri di sebelahnya. Menjadikan seluruh barisnya
                 pelipat berarti menu ini tidak lagi dapat dibuka dengan
                 menekan namanya. */
              <div className="grup-baris">
                <Link href={m.href} className={path === m.href ? "active" : ""}
                      aria-current={path === m.href ? "page" : undefined}>
                  {nama}
                </Link>
                {anak.length > 0 && (
                  <button type="button" className="grup-lipat"
                          aria-expanded={terbuka} aria-controls={idAnak}
                          aria-label={terbuka ? bantu.tutup(nama) : bantu.buka(nama)}
                          onClick={() => lipat(kunci)}>
                    <IkonLipat terbuka={terbuka} />
                  </button>
                )}
              </div>
            ) : (
              /* Tidak punya layar sendiri: seluruh barisnya jadi pelipat. Nama
                 rumpun yang tidak menuju ke mana-mana tetapi juga tidak dapat
                 ditekan hanya menggantung sebagai kata mati. */
              <button type="button" className="grup-judul"
                      aria-expanded={terbuka} aria-controls={idAnak}
                      onClick={() => lipat(kunci)}>
                <span>{nama}</span>
                <IkonLipat terbuka={terbuka} />
              </button>
            )}

            {anak.length > 0 && (
              <div className="anak" id={idAnak} hidden={!terbuka}>
                {anak.map((a) => (
                  <Link key={a.href} href={a.href!}
                        className={aktif(a.href!) ? "active" : ""}
                        aria-current={aktif(a.href!) ? "page" : undefined}>
                    {a.label[bahasa]}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
