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
    pengantar: "Dokumen Yang Sedang Beredar Untuk Ditandatangani. Durasi " +
               "Dihitung Sejak Perpindahan Terakhir.",
    galat: "Data tidak dapat dibaca",
    beredar: (n: number) => `${n} dokumen beredar`,
    duaMinggu: (n: number) => ` · ${n} lebih dari dua minggu`,
    seminggu: (n: number) => ` · ${n} lebih dari seminggu`,
    peringatan: "Yang beredar lebih dari dua minggu hampir selalu berarti " +
                "berkasnya tertinggal di satu meja, bukan sedang dibaca.",
    tenang: "Dokumen yang sudah kembali dan dipindai tidak lagi tampil di sini.",
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
    thStatus: "Status", tindakan: "Tindakan",
    salinanKe: (n: number) => `salinan #${n}`,
    isiMemo: "ketik nomor memo", isiTanggal: "pilih tanggal",
    simpanGagal: "Isian tidak tersimpan",
    hanyaAdmin: "Hanya Admin Sales yang dapat mengisi kedua kolom ini.",
    keadaan: {
      printed: "Dicetak, siap diedarkan",
      circulating_head_finance: "Di Head Finance",
      circulating_management: "Di Manajemen",
      awaiting_scan_upload: "Kembali, menunggu pindaian",
    } as Record<string, string>,
    hari: (n: number) => `${n} hari`,
    buka: "Buka klaim",
    kosong: "Tidak ada dokumen yang sedang beredar.",
    memuat: "Memuat…",
  },
  en: {
    judul: "Document Workflow",
    pengantar: "Documents currently circulating for signature. Duration is " +
               "counted from the last hand-over.",
    galat: "The data could not be read",
    beredar: (n: number) => `${n} documents circulating`,
    duaMinggu: (n: number) => ` · ${n} over two weeks`,
    seminggu: (n: number) => ` · ${n} over a week`,
    peringatan: "Anything circulating for more than two weeks almost always " +
                "means the file is sitting on someone's desk, not being read.",
    tenang: "Documents already returned and scanned no longer appear here.",
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
    thStatus: "Status", tindakan: "Action",
    salinanKe: (n: number) => `copy #${n}`,
    isiMemo: "type the memo number", isiTanggal: "pick a date",
    simpanGagal: "The entry was not saved",
    hanyaAdmin: "Only Sales Admin can fill these two columns.",
    keadaan: {
      printed: "Printed, ready to circulate",
      circulating_head_finance: "With Head Finance",
      circulating_management: "With Management",
      awaiting_scan_upload: "Returned, awaiting scan",
    } as Record<string, string>,
    hari: (n: number) => `${n} days`,
    buka: "Open claim",
    kosong: "No documents are circulating.",
    memuat: "Loading…",
  },
};

type Beredar = {
  id: string; claim_number: string; print_copy_number: number;
  claim_type: string; status: string; unit_code: string | null;
  dari: string | null;
  office_memo_no: string | null; received_at: string | null;
  physical_location: string | null; physical_since: string | null;
  age_days: number | null;
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
    b: Beredar, medan: "office_memo_no" | "received_at", nilai: string,
  ) => {
    const lama = (b[medan] ?? "") as string;
    if (nilai.trim() === lama.trim()) return;
    setSimpan(b.id); setGalat(null);
    try {
      const res = await fetch(`/api/claims/${b.id}/sirkulasi`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          office_memo_no: medan === "office_memo_no" ? nilai : b.office_memo_no,
          received_at: medan === "received_at" ? nilai : b.received_at,
        }),
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
        ? { ...x, office_memo_no: j.office_memo_no, received_at: j.received_at }
        : x));
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setSimpan(null); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  // Tiga golongan umur, bukan satu angka: yang dibaca orang bukan "9 hari"
  // melainkan "sudah terlalu lama".
  const lama = baris.filter((b) => (b.age_days ?? 0) >= 14).length;
  const sedang = baris.filter((b) => (b.age_days ?? 0) >= 7 &&
                                     (b.age_days ?? 0) < 14).length;

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

      <div className={`banner ${lama ? "stop" : sedang ? "warn" : "info"} sp`}>
        <b>
          {k.beredar(baris.length)}
          {lama ? k.duaMinggu(lama) : ""}
          {sedang ? k.seminggu(sedang) : ""}
        </b>
        {lama ? k.peringatan : k.tenang}
      </div>

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
          <table><tbody>
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
              <th style={{ textAlign: "right" }}>{k.thDurasi}</th>
              <th>{k.thStatus}</th>
              <th style={{ width: 110 }}>{k.tindakan}</th>
            </tr>

            {baris.map((b, i) => {
              const umur = b.age_days ?? 0;
              return (
                <tr key={b.id}>
                  <td className="n">{i + 1}</td>
                  {/* Nomor klaim dan salinan keberapa tidak lagi punya
                      kolomnya sendiri pada acuan ini, tetapi keduanya yang
                      dipakai orang untuk memastikan berkas yang dipegang
                      memang berkas yang dicari — jadi keduanya tetap terbaca,
                      kecil di bawah kode unitnya. */}
                  <td>
                    <b>{b.unit_code ?? "—"}</b>
                    <div className="meta">
                      {b.claim_number} · {k.salinanKe(b.print_copy_number)}
                    </div>
                  </td>
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
                  <td>{b.physical_location ?? "—"}</td>
                  <td>
                    {b.physical_since
                      ? String(b.physical_since).slice(0, 10) : "—"}
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
                  <td className="n">
                    <span className={`pill ${umur >= 14 ? "stop"
                                     : umur >= 7 ? "warn" : "ok"}`}>
                      {b.age_days === null ? "—" : k.hari(umur)}
                    </span>
                  </td>
                  <td>{k.keadaan[b.status] ?? b.status}</td>
                  <td>
                    {/* Tindakannya ada pada klaimnya — serah terima, unggah
                        pindaian — jadi layar ini menunjuk ke sana alih-alih
                        menyalin tombolnya dan berisiko berbeda perilaku. */}
                    <Link className="tautan-klaim" href={`/persetujuan?klaim=${b.id}`}>
                      {k.buka}
                    </Link>
                  </td>
                </tr>
              );
            })}

            {!baris.length && !busy && (
              <tr>
                <td colSpan={11} style={{ color: "var(--mut)" }}>
                  {k.kosong}
                </td>
              </tr>
            )}
            {busy && (
              <tr><td colSpan={11} style={{ color: "var(--mut)" }}>{k.memuat}</td></tr>
            )}
          </tbody></table>
        </div>
      </div>
    </Kerangka>
  );
}
