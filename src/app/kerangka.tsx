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

import { useBahasa } from "./bahasa";
import { KabarMenunggu } from "./kabar-menunggu";
import { Logo, LogoProject } from "./logo";
import { Nav, indukDari } from "./nav";
import { BilahPengguna, type Sesi } from "./session";

export function Kerangka(
  { sesi, judul, children, lebar }:
  { sesi: Sesi; judul: React.ReactNode; children: React.ReactNode;
    /** Layar yang tabelnya memang lebar; lihat `.konsol.lebar`. */
    lebar?: boolean },
) {
  const induk = indukDari(usePathname());
  const { bahasa } = useBahasa();

  return (
    <div className={`konsol${lebar ? " lebar" : ""}`}>
      {/* Satu bilah atas selebar halaman: merek di kolom kiri, judul dan
          identitas di kanan, dan satu garis yang menyambung di bawah keduanya.
          Sebelumnya garisnya dua potong — satu di bawah merek, satu di bawah
          judul — pada ketinggian berbeda, sehingga kepala halaman terbaca
          sebagai dua bagian yang tidak sejajar. */}
      <header className="pita">
        <div className="merek">
          {/* Lambangnya saja, lalu nama perusahaan ditulis sebagai teks di
              bawahnya — bukan lambang utuh seperti di halaman masuk. Tulisan
              "CIPTA HARMONI LESTARI" di kaki berkas lambang hanya setinggi
              164 dari 1464 piksel: pada kolom selebar 194px ia menjadi coretan
              setinggi empat piksel. Ditulis sebagai teks, namanya terbaca
              berapa pun kecilnya. */}
          <Logo tinggi={38} hanyaLambang />
          <div className="nama-pt">Cipta Harmoni Lestari</div>
          <div className="nama-sistem">
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

          {/* Nama project di kepala tiap halaman, bukan hanya di pemilihnya:
              seluruh angka pada layar ini milik satu project, dan yang lupa
              project mana yang sedang dibuka akan membaca angka yang benar
              sebagai angka yang salah.

              Di luar bungkus .judul, bukan di dalamnya: bungkus itu menumpuk
              isinya ke bawah, dan lencana project di bawah keterangan halaman
              akan terbaca sebagai bagian dari keterangan itu. */}
          {sesi.project_name && (
            <span className="lencana-proyek"
                  title={[sesi.project_name, sesi.project_company]
                           .filter(Boolean).join(" — ")}>
              {/* Lambangnya, bukan namanya. Lambang tiap project sudah memuat
                  namanya di dalamnya, dan dikenali lebih cepat daripada
                  sebaris tulisan kecil. Namanya tetap ada sebagai judul
                  sembul, untuk yang ragu maupun untuk pembaca layar.

                  Berlaku bagi project mana pun: yang dipakai slug-nya, bukan
                  daftar nama yang harus ditambah tiap ada project baru. Bila
                  berkas lambangnya belum ada, namanya yang ditulis. */}
              <LogoProject slug={sesi.project_slug ?? ""} tinggi={34}
                           alt={sesi.project_name}
                           gantiTeks={sesi.project_name} />
            </span>
          )}
          {/* Identitas di kanan atas: di sanalah orang mencarinya, dan di kaki
              kolom menu ia justru tenggelam di bawah menu terakhir.

              Tanpa tombol bahasa di sebelahnya: pilihannya dibuat di halaman
              masuk, sekali, sebelum orangnya masuk. Konsekuensinya disadari —
              yang salah pilih harus keluar dulu untuk membetulkannya. */}
          <BilahPengguna sesi={sesi} />
        </div>
      </header>

      <div className="badan">
        <aside className="sisi">
          <Nav peran={sesi.role} />
        </aside>
        <main className="isi">{children}</main>
      </div>

      {/* Pemberitahuan sekali-per-masuk tentang dokumen yang menunggu orang
          ini. Dipasang di kerangka, bukan di satu layar: yang masuk mendarat
          di layar yang berbeda-beda menurut apa yang tadi dituju. */}
      <KabarMenunggu sesi={sesi} />
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
