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

import { useCallback, useEffect, useLayoutEffect, useRef, useState }
  from "react";

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
    masterUnduh: "Unduh Laporan (.xlsx)",
    memuat: "Memuat laporan…",
    total: "TOTAL",
    kosong: "Belum ada unit pada project ini.",
  },
  en: {
    judul: "Marketing Report",
    pengantar: (p: string) =>
      `Summaries and downloads of Project ${p}'s claim data. Reports are ` +
      "read-only and cannot be edited; every correction is made on the " +
      "claim data.",
    galat: "The report could not be read",
    masterJudul: "CLOSING FEE, REWARD & KOMISI",
    masterUnduh: "Download the report (.xlsx)",
    memuat: "Loading the report…",
    total: "TOTAL",
    kosong: "This project has no units yet.",
  },
};

type Baris = { no: number; sel: Record<number, string> };
type Seksi = { label: string; baris: Baris[] };
type Rincian = {
  as_of: string; jumlah: number; seksi: Seksi[];
  total: Record<number, string>;
};

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

/** Kolom nomor urut. */
const K_NO = 1;

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
  const kelas = [b.className, kolom === K_NO ? "sel-no" : null,
                 angka.has(kolom) ? "n" : null]
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

  // Jarak tiap baris kepala dari puncak tabel, diukur dari layarnya sendiri.
  //
  // Tidak dipatok angka: tinggi baris kepala bergantung pada berapa baris
  // tulisan yang muat di kolom tersempitnya, dan itu berubah menurut ukuran
  // huruf yang dipakai peramban maupun perbesaran layar. Angka yang dipatok
  // akan tepat pada satu mesin dan meleset pada mesin berikutnya — melesetnya
  // berupa baris kepala yang saling menindih beberapa piksel.
  const kepalaRef = useRef<HTMLTableSectionElement>(null);
  const [atasKepala, setAtasKepala] = useState<number[]>([0, 0, 0, 0]);
  const [tinggiKepala, setTinggiKepala] = useState(0);

  // Seksi yang pitanya sedang ditempelkan — hanya satu pada satu saat.
  //
  // Memisahkan tiap seksi menjadi tbody sendiri sudah cukup pada peramban yang
  // menghitung batas gerak baris menempel terhadap tubuh tabelnya. Yang
  // menghitungnya terhadap seluruh tabel tidak pernah melepas satu pita pun,
  // dan keempatnya menumpuk di puncak: pita seksi yang barisnya sudah lama
  // lewat tetap tertahan di sana, menutupi baris seksi yang sedang dibaca.
  //
  // Maka yang menempel ditentukan di sini, bukan diserahkan pada peramban:
  // satu pita, yang seksinya sedang melintasi garis bawah kepala. Menumpuk
  // menjadi mustahil, bukan sekadar tidak terjadi.
  const gulirRef = useRef<HTMLDivElement>(null);
  const [seksiMenempel, setSeksiMenempel] = useState(0);
  // Jarak pita yang sedang menempel dari puncak. Biasanya tepat di bawah
  // kepala; menjelang pergantian seksi ia bergerak naik, didorong keluar oleh
  // pita seksi berikutnya — lihat perhitungannya di bawah.
  const [atasPita, setAtasPita] = useState(0);

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

  useLayoutEffect(() => {
    const ukur = () => {
      const baris = kepalaRef.current?.rows;
      if (!baris?.length) return;
      const jarak: number[] = [];
      let jumlah = 0;
      for (const b of Array.from(baris)) {
        jarak.push(jumlah);
        jumlah += b.getBoundingClientRect().height;
      }
      setAtasKepala(jarak);
      setTinggiKepala(jumlah);
    };
    ukur();
    window.addEventListener("resize", ukur);
    return () => window.removeEventListener("resize", ukur);
  }, [rincian]);

  useEffect(() => {
    const g = gulirRef.current;
    if (!g || !rincian) return;
    let rangka = 0;
    const hitung = () => {
      rangka = 0;
      const batas = g.getBoundingClientRect().top + tinggiKepala;
      const badan = g.querySelectorAll<HTMLTableSectionElement>("tbody[data-seksi]");
      let aktif = 0;
      badan.forEach((b, i) => {
        const r = b.getBoundingClientRect();
        // Seksi yang sedang melintasi garis bawah kepala: puncaknya sudah
        // lewat garis itu, dan kakinya belum.
        if (r.top <= batas + 1 && r.bottom > batas) aktif = i;
      });
      setSeksiMenempel(aktif);

      // Serah terima antarpita. Tanpa ini, pita yang menempel tetap diam di
      // tempatnya sampai detik pergantian, dan pita seksi berikutnya lewat
      // menimpanya separuh-separuh — dua nama seksi terbaca bertumpuk pada
      // satu pita. Yang lama didorong naik persis sejauh pita berikutnya
      // sudah masuk, sehingga ia keluar tepat ketika penggantinya tiba.
      const pita = badan[aktif]?.querySelector<HTMLTableRowElement>("tr");
      const berikut = badan[aktif + 1];
      const tinggiPita = pita?.getBoundingClientRect().height ?? 0;
      let atas = tinggiKepala;
      if (berikut && tinggiPita) {
        const jarak = berikut.getBoundingClientRect().top - batas;
        if (jarak < tinggiPita) atas = tinggiKepala - (tinggiPita - jarak);
      }
      setAtasPita(atas);
    };
    // Dihitung pada rangka gambar berikutnya, bukan pada tiap kejadian gulir:
    // menggulir membangkitkan kejadian jauh lebih sering daripada layar
    // digambar ulang, dan mengukur pada tiap kejadian membuat gulirannya
    // tersendat pada tabel sepanjang ini.
    const saatGulir = () => {
      if (!rangka) rangka = requestAnimationFrame(hitung);
    };
    hitung();
    g.addEventListener("scroll", saatGulir, { passive: true });
    return () => {
      g.removeEventListener("scroll", saatGulir);
      if (rangka) cancelAnimationFrame(rangka);
    };
  }, [rincian, tinggiKepala]);

  if (memuat || !sesi) return <MemeriksaSesi />;

  // Baris cadangan tidak ikut dihitung: tabel yang hanya berisi baris kosong
  // tetaplah project yang belum punya unit.
  const jumlahBaris = rincian?.jumlah ?? 0;

  /**
   * Sifat satu sel kepala: menempel di puncak menurut barisnya, dan menempel
   * di tepi kiri pula bila ia salah satu kolom depan.
   *
   * Sel pojok — yang beku pada kedua arah — perlu lapisan paling atas: ia
   * dilewati baik oleh kolom yang bergeser mendatar maupun oleh baris yang
   * bergulir tegak, dan yang paling bawah di antara ketiganya akan tertimpa.
   */
  const bekuKepala = (kolom: number, barisKepala: number) => {
    const sisi = beku(kolom);
    const atas = atasKepala[barisKepala - 5] ?? 0;
    return {
      className: ["beku-atas", sisi.className].filter(Boolean).join(" "),
      style: { ...(sisi.style ?? {}), top: atas },
    };
  };

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
        {/* Judul dan tombol unduhnya duduk pada satu baris. Dipisah menjadi
            dua blok, kepala panel ini menyita tinggi layar untuk dua kata dan
            satu tombol — padahal yang dicari orang di layar ini tabelnya. */}
        <div className="form-blok">
          <h3 className="kepala-laporan">
            <span>{k.masterJudul}</span>
            <a className="unduh-laporan" href="/api/reports/master-report">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round"
                   aria-hidden="true">
                <path d="M12 3v12" /><path d="m7 11 5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
              {k.masterUnduh}
            </a>
          </h3>
        </div>

        {busy && !rincian && (
          <p className="hint" style={{ padding: "0 14px 14px" }}>{k.memuat}</p>
        )}

        {rincian && (
          <>
            {/* Wadah gulirnya sendiri, mendatar dan tegak. .tscroll hanya
                menggulir mendatar, sehingga gulir tegaknya ikut halaman — dan
                kepala tabel yang dibekukan pada halaman akan melayang menutupi
                kepala layar di atasnya. */}
            <div className="gulir-laporan" ref={gulirRef}>
              <table className="tabel-laporan">
                <colgroup>
                  {KOLOM.map((c) => (
                    <col key={c} style={{ width: lebarKolom(c) }} />
                  ))}
                </colgroup>
                <thead ref={kepalaRef}>
                  {[5, 6, 7, 8].map((r) => (
                    <tr key={r}>
                      {KEPALA
                        .filter(([, r1]) => r1 === r)
                        .sort((a, b) => a[2] - b[2])
                        .map(([teks, r1, c1, r2, c2]) => (
                          <th key={`${r1}:${c1}`}
                              rowSpan={r2 - r1 + 1} colSpan={c2 - c1 + 1}
                              {...bekuKepala(c1, r1)}>
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
                {/* Tiap seksi berdiri sebagai tbody-nya sendiri.
                    Pita seksi menempel di bawah kepala, dan sebuah baris yang
                    menempel hanya dapat bergeser di dalam tubuh tabel yang
                    memuatnya. Disatukan dalam satu tbody, keempat pita
                    menempel pada titik yang sama dan bertumpuk — pita BATAL
                    UNIT tetap tertahan di puncak padahal barisnya sudah lama
                    lewat, lalu tertimpa pita seksi berikutnya, dan baris di
                    bawahnya tertutup. Dipisah, tiap pita menyingkir begitu
                    seksinya habis, digantikan pita seksi yang sedang dibaca. */}
                {rincian.seksi.map((s, i) => (
                  <tbody key={s.label} data-seksi={i}>
                    <tr className={i === seksiMenempel
                                     ? "seksi-laporan menempel" : "seksi-laporan"}
                        style={{ top: i === seksiMenempel ? atasPita : undefined }}>
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
                  </tbody>
                ))}
                <tbody>
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
