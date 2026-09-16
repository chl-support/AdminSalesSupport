"use client";

/**
 * Navigasi konsol — kolom di sebelah kiri.
 *
 * Sebelumnya berupa deretan mendatar di kepala halaman. Bentuk itu tidak
 * menyisakan tempat untuk susunan bertingkat, padahal Pengajuan Fee memang
 * punya empat jenis di bawahnya: keempatnya harus dapat dituju langsung, bukan
 * lewat satu layar perantara yang isinya hanya empat tombol yang sama.
 *
 * Sengaja tidak dipasang di layout akar: layar tanda tangan agent
 * (/sign/[token]) dan layar pendaftaran spesimen (/daftar-ttd/[token]) dibuka
 * orang luar lewat tautan WhatsApp. Menampilkan menu internal di sana
 * membocorkan struktur sistem sekaligus mengundang klik yang akan berakhir 401.
 * Halaman yang memang bagian dari konsol memanggilnya lewat <Kerangka>.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useBahasa, type Bahasa } from "./bahasa";
import { JENIS, NAMA_EN } from "./klaim/jenis";

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
  {
    href: "/klaim", label: { id: "Pengajuan Fee", en: "Fee Submission" },
    // Keempat jenis, beserta urutannya, diambil dari daftar yang sama dengan
    // yang dipakai layar pengajuan dan perhitungannya. Menuliskannya ulang di
    // sini berarti menu dan formulir dapat berbeda tanpa ada yang menyadari.
    anak: JENIS.map((j) => ({
      href: `/klaim/${j.slug}`,
      label: { id: j.nama, en: NAMA_EN[j.slug] },
    })),
  },
  { href: "/memo", label: { id: "Memo Approval", en: "Approval Memo" } },
  { href: "/sirkulasi",
    label: { id: "Sirkulasi Dokumen", en: "Document Workflow" } },
  { href: "/persetujuan",
    label: { id: "Approval / Persetujuan", en: "Approval Status" } },
  { href: "/laporan",
    label: { id: "Report / Laporan", en: "Marketing Report" } },
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

export function Nav({ peran }: { peran?: string }) {
  const path = usePathname();
  const { bahasa } = useBahasa();
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

        return (
          <div key={m.href ?? m.label.id} className="grup">
            {m.href ? (
              <Link href={m.href} className={path === m.href ? "active" : ""}
                    aria-current={path === m.href ? "page" : undefined}>
                {m.label[bahasa]}
              </Link>
            ) : (
              /* Judul rumpun, bukan tautan. Digambar sebagai teks biasa supaya
                 papan ketik tidak berhenti di atasnya — tidak ada yang terjadi
                 bila ia ditekan. */
              <div className="grup-judul">{m.label[bahasa]}</div>
            )}

            {anak.length > 0 && (
              <div className="anak">
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
