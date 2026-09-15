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

import { Nav } from "./nav";
import { BilahPengguna, type Sesi } from "./session";

export function Kerangka(
  { sesi, judul, children }:
  { sesi: Sesi; judul: React.ReactNode; children: React.ReactNode },
) {
  return (
    <div className="konsol">
      <aside className="sisi">
        <div className="merek">
          Klaim Insentif
          <span>BIO District</span>
        </div>
        <Nav peran={sesi.role} />
        <BilahPengguna sesi={sesi} />
      </aside>

      <main className="isi">
        <header className="top">{judul}</header>
        {children}
      </main>
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
