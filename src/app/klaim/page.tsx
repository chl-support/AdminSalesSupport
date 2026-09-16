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

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { JENIS, NAMA_EN, RINGKAS_EN } from "./jenis";

const KATA = {
  id: {
    judul: "Ajukan klaim fee",
    pengantar:
      "Pilih jenis fee lebih dulu. Prasyarat pencairan berbeda per jenis, " +
      "jadi daftar penjualan yang dapat diklaim ikut berbeda.",
  },
  en: {
    judul: "Submit a fee claim",
    pengantar:
      "Pick the fee type first. Payout prerequisites differ per type, so the " +
      "list of claimable sales differs too.",
  },
};

export default function PilihJenisPage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);

  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      <div className="pilihan">
        {JENIS.map((j) => (
          <Link key={j.slug} href={`/klaim/${j.slug}`} className="opsi">
            <b>{bahasa === "en" ? NAMA_EN[j.slug] : j.nama}</b>
            <span>{bahasa === "en" ? RINGKAS_EN[j.slug] : j.ringkas}</span>
          </Link>
        ))}
      </div>
    </Kerangka>
  );
}
