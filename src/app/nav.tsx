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
  href: string;
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
  { href: "/spesimen", label: { id: "Data Marketing", en: "Marketing Data" },
    peran: ["admin_sales", "admin_system"] },
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
  { href: "/konsol", label: { id: "Konsol klaim", en: "Claim console" } },
  { href: "/audit", label: { id: "Jejak audit", en: "Audit trail" } },
  // Administrasi hanya untuk Admin IT. "Ganti sandi saya" tetap dapat
  // dicapai semua peran lewat tautan pada bilah pengguna.
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
    if (m.anak?.some((a) => path === a.href || path.startsWith(a.href + "/"))) {
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
      {MENU.filter((m) => boleh(m, peran)).map((m) => (
        <div key={m.href} className="grup">
          <Link href={m.href} className={path === m.href ? "active" : ""}
                aria-current={path === m.href ? "page" : undefined}>
            {m.label[bahasa]}
          </Link>
          {m.anak && (
            <div className="anak">
              {m.anak.filter((a) => boleh(a, peran)).map((a) => (
                <Link key={a.href} href={a.href}
                      className={aktif(a.href) ? "active" : ""}
                      aria-current={aktif(a.href) ? "page" : undefined}>
                  {a.label[bahasa]}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
