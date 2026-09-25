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
    diLuar: "Dokumen di luar",
    berkas: (n: number) => `${n} berkas`,
    thNo: "No.", thUnit: "Unit", thJenis: "Jenis Dokumen",
    thMemo: "No. Internal Office Memo", thDari: "Dari",
    thKe: "Ke / Di Tangan", thDistribusi: "Tanggal Distribusi",
    thDiterima: "Tanggal Diterima", thDurasi: "Durasi Proses",
    thStatus: "Status", tindakan: "Tindakan",
    salinanKe: (n: number) => `salinan #${n}`,
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
    diLuar: "Documents out",
    berkas: (n: number) => `${n} files`,
    thNo: "No.", thUnit: "Unit", thJenis: "Document type",
    thMemo: "Internal office memo no.", thDari: "From",
    thKe: "To / held by", thDistribusi: "Distributed on",
    thDiterima: "Received on", thDurasi: "Processing time",
    thStatus: "Status", tindakan: "Action",
    salinanKe: (n: number) => `copy #${n}`,
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
  physical_location: string | null; physical_since: string | null;
  age_days: number | null;
};

export default function SirkulasiPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();
  const [baris, setBaris] = useState<Beredar[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const muat = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/claims/circulating");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setBaris(Array.isArray(b) ? b : []);
      setGalat(null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

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
          <span className="pill">{k.berkas(baris.length)}</span>
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
                  {/* Nomor memo internal belum tersimpan di mana pun: klaim
                      tidak punya medannya, dan memo pada layar Memo Approval
                      adalah surat edaran project, bukan nomor yang menyertai
                      satu berkas yang beredar. */}
                  <td className="belum-ada">—</td>
                  <td>{b.dari ?? "—"}</td>
                  <td>{b.physical_location ?? "—"}</td>
                  <td>
                    {b.physical_since
                      ? String(b.physical_since).slice(0, 10) : "—"}
                  </td>
                  {/* Tanggal diterima belum terpisah dari tanggal distribusi:
                      serah terima tercatat sebagai satu peristiwa, pada satu
                      waktu, tanpa pengakuan terima tersendiri dari yang
                      menerimanya. */}
                  <td className="belum-ada">—</td>
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
