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

import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

type Beredar = {
  id: string; claim_number: string; print_copy_number: number;
  physical_location: string | null; physical_since: string | null;
  age_days: number | null;
};

export default function SirkulasiPage() {
  const { sesi, memuat } = useSesi();
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
        <h1>Sirkulasi Dokumen</h1>
        <p>
          Formulir yang sudah dicetak dan sedang beredar untuk ditandatangani.
          Umurnya dihitung sejak berpindah tangan terakhir kali.
        </p>
      </div>
    }>

      {galat && (
        <div className="banner stop"><b>Data tidak dapat dibaca</b>{galat}</div>
      )}

      <div className={`banner ${lama ? "stop" : sedang ? "warn" : "info"} sp`}>
        <b>
          {baris.length} dokumen beredar
          {lama ? ` · ${lama} lebih dari dua minggu` : ""}
          {sedang ? ` · ${sedang} lebih dari seminggu` : ""}
        </b>
        {lama
          ? "Yang beredar lebih dari dua minggu hampir selalu berarti berkasnya " +
            "tertinggal di satu meja, bukan sedang dibaca."
          : "Dokumen yang sudah kembali dan dipindai tidak lagi tampil di sini."}
      </div>

      <div className="row sp">
        <button onClick={() => void muat()} disabled={busy}>Muat ulang</button>
      </div>

      <div className="panel">
        <h2>
          Dokumen di luar
          <span className="pill">{baris.length} berkas</span>
        </h2>

        <div className="tscroll">
          <table><tbody>
            <tr>
              <th>Nomor klaim</th><th>Salinan</th><th>Di tangan</th>
              <th>Sejak</th><th style={{ textAlign: "right" }}>Umur</th>
              <th style={{ width: 110 }}>Tindakan</th>
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
                      {b.age_days === null ? "—" : `${umur} hari`}
                    </span>
                  </td>
                  <td>
                    {/* Tindakannya ada pada klaimnya — serah terima, unggah
                        pindaian — jadi layar ini menunjuk ke sana alih-alih
                        menyalin tombolnya dan berisiko berbeda perilaku. */}
                    <Link className="tautan-klaim" href={`/konsol?klaim=${b.id}`}>
                      Buka klaim
                    </Link>
                  </td>
                </tr>
              );
            })}

            {!baris.length && !busy && (
              <tr>
                <td colSpan={6} style={{ color: "var(--mut)" }}>
                  Tidak ada dokumen yang sedang beredar.
                </td>
              </tr>
            )}
            {busy && (
              <tr><td colSpan={6} style={{ color: "var(--mut)" }}>Memuat…</td></tr>
            )}
          </tbody></table>
        </div>
      </div>
    </Kerangka>
  );
}
