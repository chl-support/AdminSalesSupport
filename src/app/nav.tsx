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
import { createContext, useContext, useEffect, useState } from "react";

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
  // Satu rumpun memayungi seluruh pekerjaan sehari-hari, dan susunan di
  // dalamnya dibiarkan apa adanya — yang berubah hanya atapnya.
  //
  // Rumpunnya tanpa href: ia nama, bukan layar. Tidak ada satu halaman pun
  // yang memuat seluruh isinya, dan menjadikannya tautan ke salah satu
  // anaknya berarti dua butir menu mengantar ke tempat yang sama, lalu
  // keduanya menyala bersamaan saat layar itu dibuka.
  //
  // Administrasi dan Jejak Audit sengaja tetap di luar: keduanya hanya untuk
  // Admin IT, dan bukan bagian dari alur pengajuan maupun dokumen. Memasukkan
  // keduanya membuat rumpun ini berarti "semua menu", dan rumpun yang berarti
  // semua tidak memisahkan apa pun.
  {
    label: { id: "Pengajuan, Dokumen & Payment",
             en: "Submission, Documents & Payment" },
    anak: [
      // Data marketing di atas: penerima fee berasal dari sini, dan yang belum
      // punya spesimen tanda tangan klaimnya selalu berakhir di pemeriksaan
      // manual. Yang menentukan hasil pengajuan karenanya dilihat lebih dulu
      // daripada pengajuannya.
      //
      // Tanpa href, dengan alasan yang sama seperti rumpun di atasnya:
      // satu-satunya layar di bawahnya adalah Spesimen Tanda Tangan.
      {
        label: { id: "Data Marketing", en: "Marketing Data" },
        peran: ["admin_sales", "admin_system"],
        anak: [
          { href: "/spesimen",
            label: { id: "Spesimen Tanda Tangan", en: "Specimen Signature" } },
        ],
      },
      // Keempat jenis fee tidak menjadi butir menu tersendiri. Menu dan daftar
      // pilihan pada layarnya adalah dua jalan menuju hal yang sama, dan yang
      // satu selalu lebih pendek — yang lain lalu hanya memanjangkan kolom
      // menu. Jenisnya dipilih di dalam layar datanya, tempat penyaring lain
      // juga berada.
      //
      // Pengajuan Fee punya layarnya sendiri sekaligus anak: namanya tetap
      // tautan ke daftar pengajuannya, dan pelipatnya tombol tersendiri di
      // sebelahnya.
      { href: "/klaim", label: { id: "Pengajuan Fee", en: "Fee Submission" },
        anak: [
          { href: "/klaim/referensi",
            label: { id: "Referensi Pengajuan", en: "Submission Reference" } },
        ] },
      { href: "/memo", label: { id: "Memo Approval", en: "Approval Memo" } },
      { href: "/persetujuan",
        label: { id: "Manajemen Alur Kerja Dokumen",
                 en: "Document Workflow Management" } },
      { href: "/laporan",
        label: { id: "Monitoring Laporan", en: "Marketing Report" } },
    ],
  },
  // Simulasi dan pricelist berdiri sebagai rumpun tersendiri, bukan di dalam
  // rumpun di atasnya: keduanya dikerjakan sebelum ada penjualan — dihitung
  // dan ditawarkan — sedangkan seluruh isi rumpun di atasnya dikerjakan
  // sesudah penjualannya jadi. Dua pekerjaan yang berurutan, bukan sejenis.
  //
  // Layarnya belum ada; keduanya memakai <BelumSiap>. Menunya disusun lebih
  // dulu supaya urutannya sudah benar sejak sekarang, dan tanpa layar di
  // ujungnya menekan menu itu berakhir pada halaman 404 bawaan Next.js.
  {
    label: { id: "Simulasi & Pricelist", en: "Simulation & Price List" },
    anak: [
      { href: "/simulasi",
        label: { id: "Simulasi / NPV", en: "Simulation / NPV" } },
      { href: "/pricelist", label: { id: "Pricelist", en: "Price List" } },
    ],
  },
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
  // Jejak audit juga hanya untuk Admin IT, atas permintaan. Bukan sekadar
  // disembunyikan dari menu: /api/audit pun menolak peran lain, jadi mengetik
  // alamatnya tidak memberi jalan masuk.
  { href: "/audit", label: { id: "Jejak Audit", en: "Audit Trail" },
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
  // Ditelusuri sampai ke dasar, bukan hanya satu tingkat: sejak Pengajuan Fee
  // masuk ke dalam rumpun, Referensi Pengajuan berada dua tingkat dari puncak,
  // dan pencarian satu tingkat tidak akan menemukan induknya sama sekali.
  const telusur = (daftar: Butir[]):
      { href: string; label: Record<Bahasa, string> } | null => {
    for (const m of daftar) {
      const anak = m.anak ?? [];
      // Induk tanpa href dilewati sebagai jawaban — ia nama rumpun, bukan
      // layar, jadi tidak ada tempat yang dapat dituju baris "kembali" di
      // kepala halaman. Anaknya tetap ditelusuri.
      if (m.href && anak.some((a) => a.href && (path === a.href ||
                                                path.startsWith(a.href + "/")))) {
        return { href: m.href, label: m.label };
      }
      const dalam = telusur(anak);
      if (dalam) return dalam;
    }
    return null;
  };
  return telusur(MENU);
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

/**
 * Di mana rumpun yang sedang terbuka disimpan.
 *
 * Kuncinya berganti nama dari "chl.menu-tertutup" bersamaan dengan berbaliknya
 * arti isinya. Nama lama dibiarkan mati di penyimpanan peramban alih-alih
 * dipakai ulang: yang sudah pernah memakai aplikasi ini menyimpan daftar
 * "yang terlipat" di sana, dan daftar itu dibaca sebagai "yang terbuka" akan
 * membuka persis rumpun yang dulu sengaja mereka tutup.
 */
const KUNCI_BUKA = "chl.menu-terbuka";

/**
 * Keadaan lipatan menu, dibagi ke seluruh kerangka.
 *
 * Bukan milik <Nav> sendiri lagi: kerangka halaman ikut membacanya, sebab isi
 * halaman hanya ditampilkan selama menunya terbuka. Dua tempat membaca satu
 * keadaan, dan keadaan yang disalin ke dua tempat cepat atau lambat berbeda.
 */
const KonteksLipat = createContext<{
  dibuka: string[];
  lipat: (k: string) => void;
  dipilih: string | null;
  pilih: (href: string) => void;
}>({ dibuka: [], lipat: () => {}, dipilih: null, pilih: () => {} });

export function PenyediaMenu({ children }: { children: React.ReactNode }) {
  /**
   * Rumpun yang sedang terbuka — bukan yang sedang terlipat.
   *
   * Dibalik dengan sengaja. Yang disimpan "yang terlipat", keadaan awalnya —
   * belum ada yang pernah ditekan — berarti seluruh isi menu terhampar
   * sekaligus, dan rumpun yang isinya selalu terlihat bukan rumpun melainkan
   * hanya judul di atas daftar. Dengan "yang terbuka", menu dimulai tertutup:
   * isinya muncul karena rumpunnya ditekan.
   */
  const [dibuka, setDibuka] = useState<string[]>([]);

  // Dibaca setelah komponen terpasang, bukan saat render: membaca localStorage
  // saat render membuat keluaran server dan klien berbeda. Dibungkus try/catch
  // karena di jendela penyamaran ia melempar, dan menu yang gagal tampil karena
  // ingatan lipatan jauh lebih mahal daripada manfaatnya.
  useEffect(() => {
    try {
      const t = JSON.parse(localStorage.getItem(KUNCI_BUKA) ?? "[]");
      if (Array.isArray(t)) setDibuka(t.filter((x) => typeof x === "string"));
    } catch { /* biarkan semuanya tertutup */ }
  }, []);

  const lipat = (kunci: string) => {
    setDibuka((lama) => {
      const baru = lama.includes(kunci)
        ? lama.filter((x) => x !== kunci) : [...lama, kunci];
      try { localStorage.setItem(KUNCI_BUKA, JSON.stringify(baru)); }
      catch { /* tidak apa-apa */ }
      return baru;
    });
  };

  /**
   * Butir menu terakhir yang ditekan, sepanjang halaman ini belum dimuat ulang.
   *
   * Tidak disimpan ke mana pun dengan sengaja. Ia memang harus hilang setiap
   * kali halamannya dimuat ulang: layar kerja baru terbuka karena dipilih, dan
   * yang baru datang belum memilih apa pun.
   *
   * Penyedianya duduk di layout akar, bukan di dalam kerangka tiap halaman.
   * Di dalam kerangka, ia terpasang ulang tiap kali pindah layar — dan butir
   * yang baru saja ditekan akan terlupakan persis pada perpindahan yang
   * disebabkannya.
   */
  const [dipilih, setDipilih] = useState<string | null>(null);

  return (
    <KonteksLipat.Provider
      value={{ dibuka, lipat, dipilih, pilih: setDipilih }}>
      {children}
    </KonteksLipat.Provider>
  );
}

/**
 * Rantai kunci rumpun yang menaungi satu lintasan, dari luar ke dalam.
 *
 * Mengembalikan null bila lintasannya bukan alamat sebuah butir menu — layar
 * seperti Pengajuan Komisi, lampiran, atau pratinjau klaim, yang dicapai dari
 * dalam layar lain.
 *
 * Alamatnya dicocokkan persis, bukan lewat awalan. Dicocokkan lewat awalan,
 * /klaim/pratinjau akan terhitung sebagai butir Pengajuan Fee dan ikut
 * ditahan — padahal tidak ada butir menu yang dapat ditekan untuk
 * membukanya, sehingga tautan langsung ke sana berakhir di layar kosong
 * tanpa jalan keluar.
 *
 * Anaknya diperiksa lebih dulu daripada dirinya sendiri, sebab anak dapat
 * berbagi awalan dengan induknya dan urutan yang terbalik membuat rantainya
 * berhenti satu tingkat terlalu dini.
 */
function rantaiRumpun(path: string, daftar: Butir[], atas: string[]):
    string[] | null {
  for (const m of daftar) {
    const kunci = m.href ?? m.label.id;
    const dalam = m.anak?.length
      ? rantaiRumpun(path, m.anak, [...atas, kunci]) : null;
    if (dalam) return dalam;
    if (m.href && path === m.href) return atas;
  }
  return null;
}

/**
 * Bolehkah isi layar ini digambar.
 *
 * Dua syarat, dan keduanya harus terpenuhi:
 *
 * 1. Butir menunya ditekan. Bukan sekadar terlihat — sebab alamat yang sedang
 *    dibuka sudah ada sebelum menunya disentuh, sehingga membuka rumpunnya
 *    saja akan memunculkan isi layar yang tidak pernah dipilih siapa pun.
 * 2. Butir itu masih terlihat, yaitu seluruh rumpun yang menaunginya masih
 *    terbuka. Menutup rumpunnya berarti menutup layarnya.
 *
 * Awalan alamat ikut dihitung pada syarat pertama: yang menekan Pengajuan Fee
 * lalu masuk ke Pengajuan Komisi dari dalam layarnya tetap sedang melihat
 * layar yang ia pilih.
 *
 * Layar yang tidak punya butir menu sama sekali — pratinjau klaim dan
 * sebangsanya, yang dicapai dari dalam layar lain — tidak pernah ditahan:
 * tidak ada butir yang dapat ditekan untuk membukanya.
 */
export function useLayarTampil(path: string) {
  const { dibuka, dipilih } = useContext(KonteksLipat);
  const rantai = rantaiRumpun(path, MENU, []);
  if (rantai === null) return true;
  const ditekan = dipilih !== null
    && (path === dipilih || path.startsWith(dipilih + "/"));
  return ditekan && rantai.every((k) => dibuka.includes(k));
}

export function Nav({ peran }: { peran?: string }) {
  const path = usePathname();
  const { bahasa } = useBahasa();
  const bantu = BANTU[bahasa];
  const { dibuka, lipat, pilih } = useContext(KonteksLipat);

  // Cocok persis, atau induk dari lintasan sekarang. `startsWith` telanjang
  // akan membuat "/klaim" terpilih bersamaan dengan "/klaim/komisi".
  const aktif = (href: string) => path === href || path.startsWith(href + "/");

  /** Apakah rumpun ini memuat layar yang sedang dibuka, sampai ke dasarnya. */
  const memuatAktif = (b: Butir): boolean =>
    (b.anak ?? []).some((a) => (a.href && aktif(a.href)) || memuatAktif(a));

  /**
   * Satu butir menu, beserta anak-anaknya.
   *
   * Memanggil dirinya sendiri, bukan dua penggambar yang masing-masing tahu
   * satu tingkat: sejak Pengajuan Fee masuk ke dalam rumpun, menunya tiga
   * tingkat dalam — dan penggambar yang hanya tahu dua tingkat akan diam-diam
   * membuang Referensi Pengajuan alih-alih mengeluh.
   */
  const gambar = (m: Butir, dalam: boolean): React.ReactNode => {
    const anak = (m.anak ?? []).filter((a) => boleh(a, peran));
    // Rumpun tanpa lintasan sendiri yang seluruh anaknya tersembunyi oleh
    // peran tidak menyisakan apa pun yang dapat ditekan — judulnya saja
    // hanya menggantung sebagai kata yang tidak menuju ke mana-mana.
    if (!m.href && !anak.length) return null;

    const nama = m.label[bahasa];

    // Daun di dalam rumpun: tautan telanjang. Membungkusnya sebagai rumpun
    // berarti ia membawa jarak bawah dan bungkus yang tidak dipakainya.
    if (dalam && !anak.length) {
      return (
        <Link key={m.href} href={m.href!}
              className={aktif(m.href!) ? "active" : ""}
              aria-current={aktif(m.href!) ? "page" : undefined}
              onClick={() => pilih(m.href!)}>
          {nama}
        </Link>
      );
    }

    const kunci = m.href ?? m.label.id;
    const idAnak = `submenu-${kunci.replace(/[^a-zA-Z0-9]+/g, "-")}`;
    /*
     * Terbuka hanya karena ditekan. Sempat dipaksa terbuka juga bila rumpunnya
     * memuat halaman yang sedang dibuka — dan selama tiap rumpun memayungi
     * satu-dua layar saja, aturan itu benar. Begitu seluruh layar kerja pindah
     * ke dalam satu rumpun, syaratnya hampir selalu terpenuhi: rumpunnya
     * praktis tidak pernah tertutup, dan tombolnya kehilangan artinya.
     */
    const terbuka = dibuka.includes(kunci);
    /*
     * Rumpun tertutup yang memuat halaman yang sedang dibuka diberi tanda.
     * Inilah ganti dari pemaksaan itu: yang dibutuhkan orang bukan isi
     * rumpunnya terhampar, melainkan tahu di rumpun mana ia sedang berada —
     * dan satu batang emas di tepi judulnya sudah menjawab itu tanpa membuka
     * apa pun.
     */
    const tandai = !terbuka && memuatAktif(m);

    return (
      <div key={kunci} className={`grup${tandai ? " ada-aktif" : ""}`}>
        {m.href ? (
          /* Punya layarnya sendiri: namanya tetap tautan, dan pelipatnya
             tombol tersendiri di sebelahnya. Menjadikan seluruh barisnya
             pelipat berarti menu ini tidak lagi dapat dibuka dengan
             menekan namanya.

             Cocok persis, bukan `aktif`: Pengajuan Fee punya anak yang
             lintasannya berawalan sama, dan `aktif` akan menyalakan induk
             beserta anaknya sekaligus. */
          <div className="grup-baris">
            <Link href={m.href} className={path === m.href ? "active" : ""}
                  aria-current={path === m.href ? "page" : undefined}
                  onClick={() => pilih(m.href!)}>
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
            {anak.map((a) => gambar(a, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav className="nav">
      {MENU.filter((m) => boleh(m, peran)).map((m) => gambar(m, false))}
    </nav>
  );
}
