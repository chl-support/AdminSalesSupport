"use client";

/**
 * Pengajuan Fee.
 *
 * Layar ini tidak lagi menampilkan empat kartu jenis fee. Kartu itu satu layar
 * perantara yang isinya hanya empat tombol, dan jenisnya toh harus dipilih
 * sekali lagi bila orangnya salah pilih — jadi pilihannya dipindahkan ke dalam
 * layar datanya sendiri, sebagai daftar pilihan yang dapat diganti tanpa
 * kembali ke mana pun.
 *
 * Yang tersisa di sini hanya pengalihan ke jenis pertama. Alamat /klaim tetap
 * hidup karena menu menunjuk ke sana dan orang menyimpannya sebagai penanda.
 */

import { useEffect } from "react";

import { MemeriksaSesi } from "../kerangka";
import { JENIS } from "./jenis";

export default function PengajuanFeePage() {
  useEffect(() => { location.replace(`/klaim/${JENIS[0].slug}`); }, []);
  return <MemeriksaSesi />;
}
