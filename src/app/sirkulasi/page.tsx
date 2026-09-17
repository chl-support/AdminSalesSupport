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

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const KATA = {
  id: {
    judul: "Sirkulasi Dokumen",
    pengantar: "Formulir yang sudah dicetak dan sedang beredar untuk " +
               "ditandatangani. Umurnya dihitung sejak berpindah tangan " +
               "terakhir kali.",
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
    nomor: "Nomor klaim", salinan: "Salinan", diTangan: "Di tangan",
    sejak: "Sejak", umur: "Umur", tindakan: "Tindakan",
    hari: (n: number) => `${n} hari`,
    buka: "Buka klaim",
    kosong: "Tidak ada dokumen yang sedang beredar.",
    memuat: "Memuat…",
  },
  en: {
    judul: "Document Workflow",
    pengantar: "Printed forms currently circulating for signature. Age is " +
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
    nomor: "Claim number", salinan: "Copy", diTangan: "Held by",
    sejak: "Since", umur: "Age", tindakan: "Action",
    hari: (n: number) => `${n} days`,
    buka: "Open claim",
    kosong: "No documents are circulating.",
    memuat: "Loading…",
  },
};

type Beredar = {
  id: string; claim_number: string; print_copy_number: number;
  physical_location: string | null; physical_since: string | null;
  age_days: number | null;
};

export default function SirkulasiPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
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
            <tr>
              <th>{k.nomor}</th><th>{k.salinan}</th><th>{k.diTangan}</th>
              <th>{k.sejak}</th>
              <th style={{ textAlign: "right" }}>{k.umur}</th>
              <th style={{ width: 110 }}>{k.tindakan}</th>
            </tr>

            {baris.map((b) => {
              const umur = b.age_days ?? 0;
              return (
                <tr key={b.id}>
                  <td><b>{b.claim_number}</b></td>
                  <td>#{b.print_copy_number}</td>
                  <td>{b.physical_location ?? "—"}</td>
                  <td>
                    {b.physical_since
                      ? String(b.physical_since).slice(0, 10) : "—"}
                  </td>
                  <td className="n">
                    <span className={`pill ${umur >= 14 ? "stop"
                                     : umur >= 7 ? "warn" : "ok"}`}>
                      {b.age_days === null ? "—" : k.hari(umur)}
                    </span>
                  </td>
                  <td>
                    {/* Tindakannya ada pada klaimnya — serah terima, unggah
                        pindaian — jadi layar ini menunjuk ke sana alih-alih
                        menyalin tombolnya dan berisiko berbeda perilaku. */}
                    <Link className="tautan-klaim" href={`/konsol?klaim=${b.id}`}>
                      {k.buka}
                    </Link>
                  </td>
                </tr>
              );
            })}

            {!baris.length && !busy && (
              <tr>
                <td colSpan={6} style={{ color: "var(--mut)" }}>
                  {k.kosong}
                </td>
              </tr>
            )}
            {busy && (
              <tr><td colSpan={6} style={{ color: "var(--mut)" }}>{k.memuat}</td></tr>
            )}
          </tbody></table>
        </div>
      </div>
    </Kerangka>
  );
}
