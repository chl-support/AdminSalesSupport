"use client";

/**
 * Pemilih berkas yang berbahasa sama dengan halamannya.
 *
 * <input type="file"> menuliskan sendiri "Choose file" dan "No file chosen".
 * Dua kalimat itu datang dari peramban, bukan dari halaman — tidak ada
 * atribut maupun aturan gaya yang dapat menggantinya, dan pada layar yang
 * seluruhnya berbahasa Indonesia keduanya terbaca sebagai bagian yang belum
 * selesai dikerjakan.
 *
 * Yang dapat diganti hanyalah yang terlihat: input-nya disembunyikan di dalam
 * <label>, dan labelnya yang tampil — memakai bentuk tombol .tombol-berkas
 * yang sudah dipakai layar lain, supaya ia tidak terbaca sebagai jenis
 * kendali yang baru. Isinya tidak berubah: berkas yang sama dipilih dengan
 * cara yang sama, dan peristiwa onChange yang diterima pemanggil juga sama.
 */

import { useState } from "react";
import { useKata } from "./bahasa";

const KATA = {
  id: {
    pilih: "Pilih file",
    kosong: "Belum ada file dipilih",
    banyak: (n: number) => `${n} file dipilih`,
  },
  en: {
    pilih: "Choose file",
    kosong: "No file chosen",
    banyak: (n: number) => `${n} files chosen`,
  },
};

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>,
                  "type" | "hidden"> & {
  /** Nama berkasnya tidak ditampilkan — dipakai bila pemanggilnya sudah
      menampilkannya sendiri, supaya tidak tertulis dua kali. */
  tanpaNama?: boolean;
};

export function PilihBerkas(
  { className = "", style, onChange, tanpaNama = false, ...sisa }: Props,
) {
  const [nama, setNama] = useState("");
  const k = useKata(KATA);
  return (
    <span className={`pilih-berkas ${className}`.trim()} style={style}>
      <label className="tombol-berkas">
        {k.pilih}
        <input type="file" hidden {...sisa}
               onChange={(e) => {
                 // Dibaca kembali dari input sesudah penanganan pemanggilnya
                 // berjalan, bukan dari apa yang baru saja dipilih: beberapa
                 // layar sengaja mengosongkan input-nya supaya berkas yang
                 // sama dapat dipilih dua kali berturut-turut, dan pemilih
                 // bawaan peramban pun ikut kosong karenanya.
                 const input = e.currentTarget;
                 onChange?.(e);
                 const dipilih = [...(input.files ?? [])];
                 setNama(dipilih.length === 0 ? ""
                         : dipilih.length === 1 ? dipilih[0].name
                         : k.banyak(dipilih.length));
               }} />
      </label>
      {!tanpaNama && (
        <span className="nama-berkas">{nama || k.kosong}</span>
      )}
    </span>
  );
}
