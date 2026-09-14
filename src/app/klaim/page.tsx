"use client";

/**
 * Langkah 1: memilih jenis fee yang akan diklaim.
 *
 * Jenisnya dipilih lebih dulu, bukan belakangan, karena jenis itulah yang
 * menentukan unit mana yang boleh diklaim — prasyarat pencairan berbeda per
 * jenis (BR-01 sampai BR-04). Menampilkan seluruh penjualan lebih dulu lalu
 * menyaringnya kemudian akan memperlihatkan baris yang tidak pernah bisa
 * diklaim, dan membuat tombol yang selalu ditolak.
 */

import Link from "next/link";

import { Nav } from "../nav";
import { BilahPengguna, useSesi } from "../session";
import { JENIS } from "./jenis";

export default function PilihJenisPage() {
  const { sesi, memuat } = useSesi();

  if (memuat || !sesi) {
    return (
      <div className="wrap narrow">
        <p className="hint" style={{ marginTop: 40 }}>Memeriksa sesi…</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Ajukan klaim fee</h1>
          <p>
            Pilih jenis fee lebih dulu. Prasyarat pencairan berbeda per jenis,
            jadi daftar penjualan yang dapat diklaim ikut berbeda.
          </p>
        </div>
        <div className="row" style={{ marginBottom: 0, alignItems: "flex-end" }}>
          <Nav />
          <BilahPengguna sesi={sesi} />
        </div>
      </header>

      <div className="pilihan">
        {JENIS.map((j) => (
          <Link key={j.slug} href={`/klaim/${j.slug}`} className="opsi">
            <b>{j.nama}</b>
            <span>{j.ringkas}</span>
            <span className="syarat">{j.prasyarat}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
