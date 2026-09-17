"use client";

/**
 * Alamat lama: daftar penjualan untuk satu jenis fee.
 *
 * Keempat jenis kini berdiri pada baris yang sama di /klaim, jadi halaman ini
 * tidak punya isi tersendiri lagi. Tetap ada sebagai pengalih, bukan dihapus:
 * tautan lama ke /klaim/closing_fee masih tersimpan di riwayat peramban dan
 * penanda orang, dan alamat yang mati akan berakhir sebagai halaman kosong yang
 * tidak menjelaskan apa pun.
 */

import { useEffect } from "react";

import { MemeriksaSesi } from "../../kerangka";

export default function JenisLamaPage() {
  useEffect(() => { location.replace("/klaim"); }, []);
  return <MemeriksaSesi />;
}
