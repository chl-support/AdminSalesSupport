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

import { Logo } from "./logo";
import { Nav } from "./nav";
import { BilahPengguna, type Sesi } from "./session";

export function Kerangka(
  { sesi, judul, children }:
  { sesi: Sesi; judul: React.ReactNode; children: React.ReactNode },
) {
  return (
    <div className="konsol">
      {/* Satu bilah atas selebar halaman: merek di kolom kiri, judul dan
          identitas di kanan, dan satu garis yang menyambung di bawah keduanya.
          Sebelumnya garisnya dua potong — satu di bawah merek, satu di bawah
          judul — pada ketinggian berbeda, sehingga kepala halaman terbaca
          sebagai dua bagian yang tidak sejajar. */}
      <header className="pita">
        <div className="merek">
          <Logo tinggi={44} hanyaLambang />
          <div>
            CHL Admin Sales
            <span>KLAIM INSENTIF MARKETING</span>
          </div>
        </div>

        <div className="kepala">
          {judul}
          {/* Identitas di kanan atas: di sanalah orang mencarinya, dan di kaki
              kolom menu ia justru tenggelam di bawah menu terakhir. */}
          <BilahPengguna sesi={sesi} />
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
