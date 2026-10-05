"use client";

/**
 * Report / Laporan — Closing Fee, Reward & Komisi.
 *
 * Sebelumnya layar ini memuat tiga laporan: Laporan Master, rekap pembayaran
 * per periode, dan rekonsiliasi bank. Ketiganya dihapus atas permintaan yang
 * memakainya, diganti satu laporan yang bentuknya mengikuti berkas yang sudah
 * beredar di lapangan — 56 kolom, empat seksi, baris TOTAL.
 *
 * Isinya ditampilkan di layar, bukan hanya disediakan sebagai unduhan. Laporan
 * yang hanya bisa diunduh memaksa siapa pun yang ingin memeriksa satu angka
 * mengunduh berkas, membuka Excel, dan mencari barisnya — untuk sesuatu yang
 * sudah ada di layar sebelah. Susunan kolomnya pun sama persis dengan
 * unduhannya, termasuk kepala empat barisnya, supaya keduanya dapat dibaca
 * berdampingan tanpa perlu mencocokkan kolom lebih dulu.
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

import { Fragment, useCallback, useEffect, useState } from "react";

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { KEPALA, KOLOM_ANGKA, KOLOM_PERSEN, KOLOM_TERAKHIR, LEBAR }
  from "@/lib/report-susunan";

const KATA = {
  id: {
    judul: "Report / Laporan",
    pengantar: (p: string) =>
      `Rekap Dan Unduhan Data Klaim Project ${p}. Laporan Bersifat Read-Only ` +
      "Dan Tidak Dapat Diedit; Setiap Koreksi Dilakukan Pada Data Klaim.",
    galat: "Laporan tidak dapat dibaca",
    masterJudul: "CLOSING FEE, REWARD & KOMISI",
    masterIsi: "Seluruh unit beserta konsumen, closing fee, reward, komisi, " +
               "pajak, dan overiding-nya dalam satu workbook Excel. Barisnya " +
               "terbagi empat seksi — BATAL UNIT, (Pindah Unit ke Unit lain), " +
               "MANAGEMENT (NO CLOSING FEE, REWARD & KOMISI), dan CLOSING " +
               "FEE, REWARD & KOMISI. Baris TOTAL-nya berformula, jadi " +
               "angkanya ikut berubah bila Anda menyaring sendiri di Excel.",
    masterUnduh: "Unduh Laporan (.xlsx)",
    memuat: "Memuat laporan…",
    total: "TOTAL",
    kosong: "Belum ada unit pada project ini.",
    perBaris: (n: number) => `${n} baris`,
    geser: "Tabelnya lebih lebar dari layar — geser ke samping untuk melihat " +
           "kolom berikutnya.",
  },
  en: {
    judul: "Marketing Report",
    pengantar: (p: string) =>
      `Summaries and downloads of Project ${p}'s claim data. Reports are ` +
      "read-only and cannot be edited; every correction is made on the " +
      "claim data.",
    galat: "The report could not be read",
    masterJudul: "CLOSING FEE, REWARD & KOMISI",
    masterIsi: "Every unit with its buyer, closing fee, reward, commission, " +
               "tax and overriding in one Excel workbook. The rows are split " +
               "into four sections — BATAL UNIT, (Pindah Unit ke Unit lain), " +
               "MANAGEMENT (NO CLOSING FEE, REWARD & KOMISI), and CLOSING " +
               "FEE, REWARD & KOMISI. The TOTAL row carries formulas, so the " +
               "figures follow along when you filter it yourself in Excel.",
    masterUnduh: "Download the report (.xlsx)",
    memuat: "Loading the report…",
    total: "TOTAL",
    kosong: "This project has no units yet.",
    perBaris: (n: number) => `${n} rows`,
    geser: "The table is wider than the screen — scroll sideways for the " +
           "remaining columns.",
  },
};

type Baris = { no: number; sel: Record<number, string> };
type Seksi = { label: string; baris: Baris[] };
type Rincian = { as_of: string; seksi: Seksi[]; total: Record<number, string> };

/**
 * Lebar kolom Excel menjadi lebar piksel.
 *
 * Satu satuan lebar Excel kira-kira selebar satu angka pada huruf bakunya.
 * Perbandingan antarkolomnya yang dipertahankan, bukan ukuran mutlaknya:
 * kolom Keterangan yang di Excel empat kali selebar kolom Unit harus tetap
 * terlihat empat kali selebar di sini.
 */
const px = (lebar: number) => Math.round(lebar * 7);

/**
 * Lebar kolom persen, yang dilebarkan sedikit dari ukuran Excel-nya.
 *
 * Di berkasnya kolom ini selebar 7,7 — cukup untuk "86,50%" tetapi kurang
 * beberapa piksel untuk "100,00%", sehingga tanda persennya turun ke baris
 * kedua dan satu angka terbaca seolah dua baris. Excel menyembunyikan
 * kekurangan itu dengan menampilkan ####; di layar, melebarkannya sedikit
 * lebih jujur daripada memotong angkanya.
 *
 * Hanya di layar. Lebar pada berkas unduhannya tidak diubah — berkas itu
 * dibaca berdampingan dengan berkas yang sudah beredar.
 */
const LEBAR_PERSEN = 64;

const persen = new Set(KOLOM_PERSEN);

const lebarKolom = (kolom: number) => persen.has(kolom)
  ? Math.max(px(LEBAR[kolom - 1]), LEBAR_PERSEN)
  : px(LEBAR[kolom - 1]);

/** Kolom yang isinya angka dirapatkan ke kanan, sama seperti di Excel. */
const angka = new Set(KOLOM_ANGKA);

const KOLOM = Array.from({ length: KOLOM_TERAKHIR }, (_, i) => i + 1);

/**
 * Kolom yang tidak ikut bergeser saat tabelnya digulir ke samping.
 *
 * Yang diminta tetap terlihat adalah No., Konsumen, dan Unit — tetapi
 * ketiganya tidak berdampingan: Tanggal Kontrak dan Tanggal Batal duduk di
 * antara No. dan Konsumen. Yang dibekukan karenanya kolom pertama sampai
 * kelima sekaligus. Membekukan tiga kolom yang terpisah berarti kolom keempat
 * dan kelima harus dipindahkan ke depan, dan urutan kolom laporan ini tidak
 * boleh berubah; sedangkan membiarkan Tanggal bergeser di bawah Konsumen yang
 * diam akan membuat dua kolom saling menindih.
 *
 * Berkas Excel-nya pun membekukan lima kolom yang sama — panel bekunya
 * disetel pada xSplit 5 — jadi layar dan unduhannya berhenti di tempat yang
 * sama.
 */
const BEKU = 5;

/**
 * Jarak tiap kolom dari tepi kiri tabel, untuk menempelkan kolom beku.
 *
 * Dihitung dari lebarKolom(), bukan langsung dari lebar Excel-nya: kolom beku
 * ditempelkan pada jarak yang dihitung di sini, dan bila perhitungannya
 * memakai lebar yang berbeda dari lebar yang benar-benar dipakai colgroup,
 * kolom beku akan meleset — meleset sedikit pun ia menutupi kolom sebelahnya.
 */
const KIRI: number[] = (() => {
  const hasil: number[] = [];
  let jumlah = 0;
  for (let i = 1; i <= KOLOM_TERAKHIR; i++) { hasil.push(jumlah); jumlah += lebarKolom(i); }
  return hasil;
})();

/** Sifat satu sel data: beku bila di kolom depan, rata kanan bila angka. */
const selData = (kolom: number) => {
  const b = beku(kolom);
  const kelas = [b.className, angka.has(kolom) ? "n" : null]
    .filter(Boolean).join(" ");
  return { ...b, className: kelas || undefined };
};

/** Sifat sel beku: menempel pada jarak kolomnya sendiri dari tepi kiri. */
const beku = (kolom: number) => kolom <= BEKU
  // Kolom beku terakhir diberi garis tegak: tanpa itu, tidak ada yang
  // memberi tahu di mana bagian yang diam berakhir dan bagian yang bergeser
  // dimulai, dan kolom yang lewat di belakangnya terbaca seolah bersambung.
  ? { className: kolom === BEKU ? "beku beku-tepi" : "beku",
      style: { left: KIRI[kolom - 1] } }
  : {};

export default function LaporanPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);

  const [rincian, setRincian] = useState<Rincian | null>(null);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const ambil = useCallback(async () => {
    setBusy(true); setGalat(null);
    try {
      const res = await fetch("/api/reports/master-report?format=rincian");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setRincian(b);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (sesi) void ambil(); }, [sesi, ambil]);

  if (memuat || !sesi) return <MemeriksaSesi />;

  const jumlahBaris = (rincian?.seksi ?? [])
    .reduce((n, s) => n + s.baris.length, 0);

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar(sesi.project_name ?? "—")}</p>
      </div>
    }>
      {galat && (
        <div className="banner stop"><b>{k.galat}</b>{galat}</div>
      )}

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

        {busy && !rincian && (
          <p className="hint" style={{ padding: "0 14px 14px" }}>{k.memuat}</p>
        )}

        {rincian && (
          <>
            <p className="hint" style={{ padding: "0 14px", textAlign: "left" }}>
              {k.perBaris(jumlahBaris)} · {k.geser}
            </p>
            <div className="tscroll">
              <table className="tabel-laporan">
                <colgroup>
                  {KOLOM.map((c) => (
                    <col key={c} style={{ width: lebarKolom(c) }} />
                  ))}
                </colgroup>
                <thead>
                  {[5, 6, 7, 8].map((r) => (
                    <tr key={r}>
                      {KEPALA
                        .filter(([, r1]) => r1 === r)
                        .sort((a, b) => a[2] - b[2])
                        .map(([teks, r1, c1, r2, c2]) => (
                          <th key={`${r1}:${c1}`}
                              rowSpan={r2 - r1 + 1} colSpan={c2 - c1 + 1}
                              {...beku(c1)}>
                            {/* "Luas (m2)" ditulis dengan angka dua
                                superskrip, sama seperti pada unduhannya —
                                satuan meter persegi, bukan huruf m diikuti
                                angka 2. */}
                            {teks === "Luas (m2)"
                              ? <>Luas (m<sup>2</sup>)</> : teks}
                          </th>
                        ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {rincian.seksi.map((s) => (
                    <Fragment key={s.label}>
                      <tr className="seksi-laporan">
                        {/* Selnya membentang selebar seluruh tabel, jadi ia
                            tidak dapat menempel di tepi kiri: sel yang sudah
                            memenuhi barisnya tidak punya ruang untuk bergeser
                            terhadap barisnya sendiri. Yang ditempelkan
                            tulisannya. */}
                        <td colSpan={KOLOM_TERAKHIR}>
                          <span className="label-seksi">{s.label}</span>
                        </td>
                      </tr>
                      {s.baris.map((b) => (
                        <tr key={`${s.label}:${b.no}`}>
                          {KOLOM.map((c) => (
                            <td key={c} {...selData(c)}>
                              {c === 1 ? b.no : (b.sel[c] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  <tr className="total-laporan">
                    <td colSpan={4} className="beku" style={{ left: 0 }}>
                      {k.total}
                    </td>
                    {KOLOM.slice(4).map((c) => (
                      <td key={c} {...selData(c)}>{rincian.total[c] ?? ""}</td>
                    ))}
                  </tr>
                  {!jumlahBaris && (
                    <tr>
                      <td colSpan={KOLOM_TERAKHIR} style={{ color: "var(--mut)" }}>
                        {k.kosong}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Kerangka>
  );
}
