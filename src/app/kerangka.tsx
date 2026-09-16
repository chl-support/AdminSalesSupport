"use client";

/**
 * Kerangka layar konsol: kolom menu di kiri, isi halaman di kanan.
 *
 * Satu tempat, bukan tujuh. Sebelumnya tiap halaman menyusun sendiri kepala
 * halamannya beserta menu dan bilah penggunanya — tujuh salinan dari susunan
 * yang sama, yang berarti setiap penambahan menu harus diingat tujuh kali dan
 * halaman yang terlewat diam-diam kehilangan menunya.
 *
 * Halaman yang dibuka orang luar (tanda tangan agent, pendaftaran spesimen)
 * sengaja tidak memakai kerangka ini.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TombolBahasa, useBahasa } from "./bahasa";
import { Logo } from "./logo";
import { Nav, indukDari } from "./nav";
import { BilahPengguna, type Sesi } from "./session";

export function Kerangka(
  { sesi, judul, children }:
  { sesi: Sesi; judul: React.ReactNode; children: React.ReactNode },
) {
  const induk = indukDari(usePathname());
  const { bahasa } = useBahasa();

  return (
    <div className="konsol">
      {/* Satu bilah atas selebar halaman: merek di kolom kiri, judul dan
          identitas di kanan, dan satu garis yang menyambung di bawah keduanya.
          Sebelumnya garisnya dua potong — satu di bawah merek, satu di bawah
          judul — pada ketinggian berbeda, sehingga kepala halaman terbaca
          sebagai dua bagian yang tidak sejajar. */}
      <header className="pita">
        <div className="merek">
          <Logo tinggi={38} hanyaLambang />
          <div>
            {/* Pemenggalannya ditentukan di sini, sama seperti di halaman
                masuk. Dibiarkan membungkus sendiri pada kolom 194px, namanya
                patah menjadi "CHL Sales Admin / System" — satu kata sendirian
                di baris kedua. */}
            CHL Sales<br />Admin System
          </div>
        </div>

        <div className="kepala">
          <div className="judul">
            {/* Halaman yang merupakan anak dari menu lain menyebut induknya di
                atas judulnya, sekaligus sebagai jalan kembali. "Closing Fee"
                sendirian tidak memberi tahu bahwa ia salah satu dari empat
                jenis di bawah Pengajuan Fee. Halaman yang bukan anak siapa pun
                tidak menampilkan baris ini sama sekali. */}
            {induk && (
              <Link className="induk" href={induk.href}>{induk.label[bahasa]}</Link>
            )}
            {judul}
          </div>

          {/* Identitas di kanan atas: di sanalah orang mencarinya, dan di kaki
              kolom menu ia justru tenggelam di bawah menu terakhir. Pilihan
              bahasa duduk di sebelahnya — yang salah pilih sebelum masuk tidak
              perlu keluar dulu untuk membetulkannya. */}
          <div className="kanan-atas">
            <TombolBahasa />
            <BilahPengguna sesi={sesi} />
          </div>
        </div>
      </header>

      <div className="badan">
        <aside className="sisi">
          <Nav peran={sesi.role} />
        </aside>
        <main className="isi">{children}</main>
      </div>
    </div>
  );
}

/** Layar "memeriksa sesi", supaya tidak ditulis ulang di tiap halaman. */
export function MemeriksaSesi() {
  return (
    <div className="wrap narrow">
      <p className="hint" style={{ marginTop: 40 }}>Memeriksa sesi…</p>
    </div>
  );
}
