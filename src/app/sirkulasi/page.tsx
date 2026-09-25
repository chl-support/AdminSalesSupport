"use client";

/**
 * Sirkulasi Dokumen — berkas fisik yang sedang beredar.
 *
 * Formulir yang sudah dicetak berpindah tangan: Admin ke Head Finance, Head
 * Finance ke Management, lalu kembali untuk dipindai. Selama beredar ia tidak
 * ada di layar mana pun, dan satu-satunya cara menjawab "dokumen ini di mana"
 * adalah bertanya kepada orang — yang jawabannya bergantung pada ingatan.
 *
 * Layar ini menjawabnya dari catatan: di tangan siapa, sejak kapan, dan sudah
 * berapa lama. Umur dokumen ditonjolkan karena itulah yang menentukan tindakan;
 * yang beredar tiga hari wajar, yang beredar tiga minggu hampir selalu berarti
 * berkasnya tertinggal di satu meja.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useBahasa, useKata } from "../bahasa";
import { namaJenis } from "../klaim/jenis";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const KATA = {
  id: {
    judul: "Sirkulasi Dokumen",
    pengantar: "Perjalanan Tiap Pengajuan Sejak Diajukan Sampai Dibayarkan, " +
               "Dan Di Bagian Mana Waktunya Paling Banyak Terpakai.",
    galat: "Data tidak dapat dibaca",
    muatUlang: "Muat ulang",
    diLuar: "Tabel Sirkulasi Dokumen",
    pLuar: (n: number) => `\u{1F4E4} ${n} Dokumen di Luar`,
    pMasuk: (n: number) => `\u{1F4E5} ${n} Dokumen Masuk`,
    pProses: (n: number) => `\u{1F504} ${n} Dalam Proses`,
    pSelesai: (n: number) => `\u2713 ${n} Selesai`,
    thNo: "No.", thUnit: "Unit", thJenis: "Jenis Dokumen",
    thMemo: "No. Internal Office Memo", thDari: "Dari",
    thKe: "Ke / Di Tangan", thDistribusi: "Tanggal Distribusi",
    thDiterima: "Tanggal Diterima", thDurasi: "Durasi Proses",
    thLama: "Paling Lama di", thStatus: "Status", tindakan: "Tindakan",
    selesaiTanda: "selesai",
    isiMemo: "ketik nomor memo", isiTanggal: "pilih tanggal",
    isiKe: "ketik nama pemegang",
    simpanGagal: "Isian tidak tersimpan",
    hanyaAdmin: "Hanya Admin Sales yang dapat mengisi kolom-kolom ini.",
    keadaan: {
      printed: "Dicetak, siap diedarkan",
      circulating_head_finance: "Di Head Finance",
      circulating_management: "Di Manajemen",
      awaiting_scan_upload: "Kembali, menunggu pindaian",
      // Yang sudah berakhir tidak ada di meja siapa pun. Tanpa baris-baris
      // ini kolom Status jatuh ke pihak yang terakhir memegangnya, sehingga
      // klaim lunas terbaca seolah masih ditunggu.
      paid: "Sudah dibayar",
      completed: "Selesai",
      rejected: "Ditolak",
      cancelled: "Dibatalkan",
      clawback: "Ditarik kembali",
    } as Record<string, string>,
    hari: (n: number) => `${n} hari`,
    buka: "Buka klaim",
    kosong: "Belum ada pengajuan pada project ini.",
    memuat: "Memuat…",
  },
  en: {
    judul: "Document Workflow",
    pengantar: "How long each submission takes from filing to payment, and " +
               "which stage takes the most of it.",
    galat: "The data could not be read",
    muatUlang: "Reload",
    diLuar: "Document circulation table",
    pLuar: (n: number) => `\u{1F4E4} ${n} Out`,
    pMasuk: (n: number) => `\u{1F4E5} ${n} Returned`,
    pProses: (n: number) => `\u{1F504} ${n} In progress`,
    pSelesai: (n: number) => `\u2713 ${n} Done`,
    thNo: "No.", thUnit: "Unit", thJenis: "Document type",
    thMemo: "Internal office memo no.", thDari: "From",
    thKe: "To / held by", thDistribusi: "Distributed on",
    thDiterima: "Received on", thDurasi: "Processing time",
    thLama: "Longest at", thStatus: "Status", tindakan: "Action",
    selesaiTanda: "done",
    isiMemo: "type the memo number", isiTanggal: "pick a date",
    isiKe: "type who holds it",
    simpanGagal: "The entry was not saved",
    hanyaAdmin: "Only Sales Admin can fill these columns.",
    keadaan: {
      printed: "Printed, ready to circulate",
      circulating_head_finance: "With Head Finance",
      circulating_management: "With Management",
      awaiting_scan_upload: "Returned, awaiting scan",
      paid: "Paid",
      completed: "Completed",
      rejected: "Rejected",
      cancelled: "Cancelled",
      clawback: "Clawed back",
    } as Record<string, string>,
    hari: (n: number) => `${n} days`,
    buka: "Open claim",
    kosong: "No submissions on this project yet.",
    memuat: "Loading…",
  },
};

/** Kolom Sirkulasi yang diisi tangan; lihat /api/claims/[id]/sirkulasi. */
type MedanIsian = "office_memo_no" | "received_at"
                | "handed_to" | "distributed_at";

type Beredar = {
  id: string; claim_number: string; print_copy_number: number;
  claim_type: string; status: string; unit_code: string | null;
  dari: string | null;
  office_memo_no: string | null; received_at: string | null;
  handed_to: string | null; distributed_at: string | null;
  physical_location: string | null; physical_since: string | null;
  age_days: number | null;
  /** Hari sejak diajukan sampai dibayar — atau sampai hari ini bila belum. */
  durasi_hari: number;
  selesai: boolean;
  tgl_bayar: string | null;
  /** Langkah yang paling banyak memakan waktu, beserta lamanya. */
  tertahan: { hari: number; pihak: { id: string; en: string } } | null;
  /** Langkah yang sedang berjalan, disebut sebagaimana layar Approval. */
  kini: { pihak: { id: string; en: string };
          kerja: { id: string; en: string } } | null;
};

export default function SirkulasiPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();
  /**
   * Kedua kolom yang diisi tangan hanya dapat diubah Admin Sales, sama seperti
   * yang boleh menggerakkan dokumennya — endpoint-nya pun menolak peran lain.
   * Peran lain tetap membacanya, sebab isinya memang untuk dibaca.
   */
  const bolehIsi = ["admin_sales", "admin_system"].includes(sesi?.role ?? "");
  /** Baris yang isiannya sedang dikirim, supaya isiannya tidak ditulis ganda. */
  const [simpan, setSimpan] = useState<string | null>(null);
  const [baris, setBaris] = useState<Beredar[]>([]);
  /** Empat hitungan pada bilah panel; lihat KELOMPOK di sisi server. */
  const [hitung, setHitung] = useState(
    { luar: 0, masuk: 0, proses: 0, selesai: 0 });
  const [galat, setGalat] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const muat = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/claims/circulating");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setBaris(Array.isArray(b?.baris) ? b.baris : []);
      if (b?.hitung) setHitung(b.hitung);
      setGalat(null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  /**
   * Simpan salah satu isian tangan pada satu baris.
   *
   * Dikirim saat isiannya ditinggalkan, bukan pada tiap ketukan: satu
   * permintaan per huruf akan membanjiri jalur yang sama dan membuat urutan
   * tibanya menentukan isi akhirnya.
   *
   * Yang tidak berubah tidak dikirim sama sekali — membuka isian lalu
   * meninggalkannya begitu saja bukan penyuntingan, dan jejak audit tidak
   * perlu mencatatnya.
   */
  const simpanIsian = async (
    b: Beredar, medan: MedanIsian, nilai: string,
  ) => {
    const lama = (b[medan] ?? "") as string;
    if (nilai.trim() === lama.trim()) return;
    setSimpan(b.id); setGalat(null);
    try {
      const res = await fetch(`/api/claims/${b.id}/sirkulasi`, {
        method: "POST", headers: { "content-type": "application/json" },
        // Hanya medan yang berubah yang dikirim. Mengirim keempatnya setiap
        // kali membuat pembetulan satu kolom menulis ulang tiga kolom lain
        // dengan salinan layar yang mungkin sudah usang.
        body: JSON.stringify({ [medan]: nilai }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(`${k.simpanGagal} — ${j.detail ?? `HTTP ${res.status}`}`);
        await muat();
        return;
      }
      // Baris ini saja yang disegarkan; memuat ulang seluruh tabel akan
      // memindahkan baris lain di bawah jari yang sedang mengetik.
      setBaris((lama) => lama.map((x) => x.id === b.id
        ? { ...x, office_memo_no: j.office_memo_no, handed_to: j.handed_to,
            received_at: j.received_at, distributed_at: j.distributed_at }
        : x));
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setSimpan(null); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      {galat && (
        <div className="banner stop"><b>{k.galat}</b>{galat}</div>
      )}

      <div className="row sp">
        <button onClick={() => void muat()} disabled={busy}>{k.muatUlang}</button>
      </div>

      <div className="panel">
        <h2>
          {k.diLuar}
          {/* Empat kelompok yang tidak tumpang tindih — satu klaim hanya
              masuk satu di antaranya. Urutannya mengikuti perjalanan
              dokumennya: keluar, kembali, sedang dikerjakan, tuntas. */}
          <span className="pil-sirkulasi">
            <span className="pill">{k.pLuar(hitung.luar)}</span>
            <span className="pill">{k.pMasuk(hitung.masuk)}</span>
            <span className="pill">{k.pProses(hitung.proses)}</span>
            <span className="pill ok">{k.pSelesai(hitung.selesai)}</span>
          </span>
        </h2>

        <div className="tscroll">
          <table className="tabel-sirkulasi"><tbody>
            {/* Kolomnya mengikuti Tabel Sirkulasi Dokumen yang dipakai
                kantor, dengan urutan yang sama. Dua di antaranya belum punya
                sumber datanya — lihat selnya masing-masing. */}
            <tr>
              <th style={{ width: 44 }}>{k.thNo}</th>
              <th>{k.thUnit}</th>
              <th>{k.thJenis}</th>
              <th>{k.thMemo}</th>
              <th>{k.thDari}</th>
              <th>{k.thKe}</th>
              <th>{k.thDistribusi}</th>
              <th>{k.thDiterima}</th>
              <th>{k.thDurasi}</th>
              <th>{k.thLama}</th>
              <th>{k.thStatus}</th>
              <th style={{ width: 110 }}>{k.tindakan}</th>
            </tr>

            {baris.map((b, i) => (
                <tr key={b.id}>
                  <td className="n">{i + 1}</td>
                  <td><b>{b.unit_code ?? "—"}</b></td>
                  <td>{namaJenis(b.claim_type as any, bahasa)}</td>
                  {/* Nomor memo internal terbit di luar sistem ini, jadi ia
                      diisi tangan. Yang tidak berhak mengisinya tetap
                      membacanya — isinya memang untuk dibaca. */}
                  <td>
                    {bolehIsi ? (
                      <input className="isi-sirkulasi" type="text"
                             defaultValue={b.office_memo_no ?? ""}
                             placeholder={k.isiMemo}
                             disabled={simpan === b.id}
                             onBlur={(e) => void simpanIsian(
                               b, "office_memo_no", e.target.value)}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") e.currentTarget.blur();
                             }} />
                    ) : b.office_memo_no ?? <span className="belum-ada">—</span>}
                  </td>
                  <td>{b.dari ?? "—"}</td>
                  {/* Kepada siapa berkasnya diserahkan dan kapan. Keduanya
                      punya bayangannya di sistem — physical_location dan
                      physical_since — tetapi bayangan itu hanya terisi bila
                      serah terimanya dicatat lewat layar Approval, sedangkan
                      berkas yang diantar langsung ke meja orang tidak pernah
                      melewatinya. Yang tercatat sistem tetap ditawarkan
                      sebagai bayangan pada isiannya, jadi yang mengetik tidak
                      kehilangan apa yang sudah diketahui. */}
                  <td>
                    {bolehIsi ? (
                      <input className="isi-sirkulasi" type="text"
                             defaultValue={b.handed_to ?? ""}
                             placeholder={b.physical_location ?? k.isiKe}
                             disabled={simpan === b.id}
                             onBlur={(e) => void simpanIsian(
                               b, "handed_to", e.target.value)}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") e.currentTarget.blur();
                             }} />
                    ) : b.handed_to ?? b.physical_location
                        ?? <span className="belum-ada">—</span>}
                  </td>
                  <td>
                    {bolehIsi ? (
                      <input className="isi-sirkulasi" type="date"
                             defaultValue={b.distributed_at ?? ""}
                             title={k.isiTanggal}
                             disabled={simpan === b.id}
                             onBlur={(e) => void simpanIsian(
                               b, "distributed_at", e.target.value)} />
                    ) : b.distributed_at
                        ?? <span className="belum-ada">—</span>}
                  </td>
                  {/* Tanggal diterima hanya diketahui yang menyerahkan
                      berkasnya: serah terima tercatat sebagai satu peristiwa
                      pada satu waktu, tanpa pengakuan terima tersendiri. Jadi
                      ia pun diisi tangan. */}
                  <td>
                    {bolehIsi ? (
                      <input className="isi-sirkulasi" type="date"
                             defaultValue={b.received_at ?? ""}
                             title={k.isiTanggal}
                             disabled={simpan === b.id}
                             onBlur={(e) => void simpanIsian(
                               b, "received_at", e.target.value)} />
                    ) : b.received_at ?? <span className="belum-ada">—</span>}
                  </td>
                  {/* Durasi sejak diajukan, bukan sejak perpindahan terakhir.
                      Yang ditanyakan kantor "berkas ini sudah berapa lama",
                      dan jawabannya bukan lama di meja terakhir — dokumen
                      yang tiga bulan tertahan di pajak lalu berpindah kemarin
                      akan menjawab "1 hari" bila dihitung dari perpindahan.

                      Yang sudah dibayar tidak diberi warna peringatan: ia
                      memang pernah berjalan lama, tetapi tidak lagi menunggu
                      siapa pun. */}
                  <td className="n">
                    <span className={`pill ${b.selesai ? "ok"
                                     : b.durasi_hari >= 14 ? "stop"
                                     : b.durasi_hari >= 7 ? "warn" : ""}`}>
                      {k.hari(b.durasi_hari)}
                    </span>
                    {b.selesai && (
                      <div className="meta">{k.selesaiTanda}</div>
                    )}
                  </td>
                  {/* Di bagian mana waktunya paling banyak terpakai. Inilah
                      yang menjawab "kenapa lama" — kolom Status hanya
                      menjawab "sedang di mana", dan keduanya kerap berbeda
                      jauh. */}
                  <td>
                    {b.tertahan ? (
                      <>
                        {b.tertahan.pihak[bahasa]}
                        <div className="meta">{k.hari(b.tertahan.hari)}</div>
                      </>
                    ) : "—"}
                  </td>
                  <td>
                    {k.keadaan[b.status] ??
                     (b.kini ? b.kini.pihak[bahasa] : b.status)}
                    {!k.keadaan[b.status] && b.kini && (
                      <div className="meta">{b.kini.kerja[bahasa]}</div>
                    )}
                  </td>
                  <td>
                    {/* Tindakannya ada pada klaimnya — serah terima, unggah
                        pindaian — jadi layar ini menunjuk ke sana alih-alih
                        menyalin tombolnya dan berisiko berbeda perilaku. */}
                    <Link className="tautan-klaim" href={`/persetujuan?klaim=${b.id}`}>
                      {k.buka}
                    </Link>
                  </td>
                </tr>
            ))}

            {!baris.length && !busy && (
              <tr>
                <td colSpan={12} style={{ color: "var(--mut)" }}>
                  {k.kosong}
                </td>
              </tr>
            )}
            {busy && (
              <tr><td colSpan={12} style={{ color: "var(--mut)" }}>{k.memuat}</td></tr>
            )}
          </tbody></table>
        </div>
      </div>
    </Kerangka>
  );
}
