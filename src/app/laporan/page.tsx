"use client";

/**
 * Report / Laporan — unduhan laporan Closing Fee, Reward & Komisi.
 *
 * Sebelumnya layar ini memuat tiga laporan: Laporan Master, rekap pembayaran
 * per periode, dan rekonsiliasi bank. Ketiganya dihapus atas permintaan yang
 * memakainya, diganti satu laporan yang bentuknya mengikuti berkas yang sudah
 * beredar di lapangan — 56 kolom, empat seksi, baris TOTAL berformula.
 *
 * Endpoint kedua laporan yang lain sengaja tidak ikut dihapus. Yang diminta
 * adalah laporannya tidak lagi muncul di sini; menghapus endpoint-nya sekalian
 * akan mematikan alamat yang mungkin sudah dipakai di tempat lain, dan itu
 * bukan sesuatu yang dapat dikembalikan oleh yang memakainya.
 *
 * Tidak ada tombol yang menulis apa pun di layar ini. Laporan adalah cara
 * melihat data klaim; yang keliru diperbaiki pada klaimnya, bukan pada
 * laporannya — dan menyediakan jalan pintas untuk itu di sini akan membuat
 * angka pada laporan berbeda dari angka pada klaim yang menghasilkannya.
 */

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const KATA = {
  id: {
    judul: "Report / Laporan",
    pengantar: (p: string) =>
      `Rekap Dan Unduhan Data Klaim Project ${p}. Laporan Bersifat Read-Only ` +
      "Dan Tidak Dapat Diedit; Setiap Koreksi Dilakukan Pada Data Klaim.",
    masterJudul: "CLOSING FEE, REWARD & KOMISI",
    masterIsi: "Seluruh unit beserta konsumen, closing fee, reward, komisi, " +
               "pajak, dan overiding-nya dalam satu workbook Excel. Barisnya " +
               "terbagi empat seksi — BATAL UNIT, (Pindah Unit ke Unit lain), " +
               "MANAGEMENT (NO CLOSING FEE, REWARD & KOMISI), dan CLOSING " +
               "FEE, REWARD & KOMISI. Baris TOTAL-nya berformula, jadi " +
               "angkanya ikut berubah bila Anda menyaring sendiri di Excel.",
    masterUnduh: "Unduh Laporan (.xlsx)",
  },
  en: {
    judul: "Marketing Report",
    pengantar: (p: string) =>
      `Summaries and downloads of Project ${p}'s claim data. Reports are ` +
      "read-only and cannot be edited; every correction is made on the " +
      "claim data.",
    masterJudul: "CLOSING FEE, REWARD & KOMISI",
    masterIsi: "Every unit with its buyer, closing fee, reward, commission, " +
               "tax and overriding in one Excel workbook. The rows are split " +
               "into four sections — BATAL UNIT, (Pindah Unit ke Unit lain), " +
               "MANAGEMENT (NO CLOSING FEE, REWARD & KOMISI), and CLOSING " +
               "FEE, REWARD & KOMISI. The TOTAL row carries formulas, so the " +
               "figures follow along when you filter it yourself in Excel.",
    masterUnduh: "Download the report (.xlsx)",
  },
};

export default function LaporanPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);

  if (memuat || !sesi) return <MemeriksaSesi />;

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar(sesi.project_name ?? "—")}</p>
      </div>
    }>
      <div className="panel">
        <div className="form-blok">
          <h3>{k.masterJudul}</h3>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            {k.masterIsi}
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            <a className="tombol-klaim" href="/api/reports/master-report">
              {k.masterUnduh}
            </a>
          </div>
        </div>
      </div>
    </Kerangka>
  );
}
