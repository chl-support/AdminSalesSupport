"use client";

/**
 * Pratinjau Form Pengajuan, dibuka di jendela tersendiri.
 *
 * Dipakai setelah beberapa fee diajukan sekaligus dari daftar penjualan: satu
 * unit dapat menghasilkan dua sampai empat formulir dalam satu tekan, dan
 * ketiganya perlu dilihat sebelum dicetak.
 *
 * Jendela terpisah, bukan pop-up di dalam layar yang sama, karena yang dibuka
 * adalah dokumen untuk dicetak — dan mencetak dari dalam layar daftar berarti
 * ikut mencetak menu, penyaring, dan seluruh tabel di belakangnya.
 *
 * Tidak memakai useSearchParams: pada Next.js 16 ia menuntut Suspense dan
 * menggagalkan prerender statis halaman ini. Alamatnya dibaca setelah komponen
 * terpasang, yang mana memang saat jendela ini hidup.
 */

import { useCallback, useEffect, useState } from "react";

import { FormPengajuan } from "../form-pengajuan";
import { useKata } from "../../bahasa";
import { MemeriksaSesi } from "../../kerangka";
import { useSesi } from "../../session";

const KATA = {
  id: {
    judul: "Pratinjau Form Pengajuan",
    memuat: "Memuat formulir…",
    galat: "Formulir tidak dapat dibuka",
    kosong: "Tidak ada formulir yang diminta.",
    cetak: "Cetak semua",
    tutup: "Tutup jendela",
    jumlah: (n: number) => `${n} formulir`,
  },
  en: {
    judul: "Submission form preview",
    memuat: "Loading forms…",
    galat: "The forms could not be opened",
    kosong: "No forms were requested.",
    cetak: "Print all",
    tutup: "Close window",
    jumlah: (n: number) => `${n} forms`,
  },
};

export default function PratinjauPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const [klaim, setKlaim] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    const ids = (new URLSearchParams(window.location.search).get("ids") ?? "")
      .split(",").map((x) => x.trim()).filter(Boolean);
    if (!ids.length) { setBusy(false); return; }
    setBusy(true);
    try {
      // Berurutan, bukan serentak: jumlahnya paling banyak empat, dan urutan
      // formulir pada layar harus sama dengan urutan yang diminta — bukan urutan
      // siapa yang kebetulan menjawab lebih dulu.
      const hasil: any[] = [];
      for (const id of ids) {
        const res = await fetch(`/api/claims/${id}`);
        if (res.status === 401) { location.href = "/login"; return; }
        const b = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(b.detail ?? b.title ?? `HTTP ${res.status}`);
        hasil.push(b);
      }
      setKlaim(hasil);
      setGalat(null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  if (memuat || !sesi) return <MemeriksaSesi />;

  return (
    <div className="wrap jendela-pratinjau">
      <div className="row sp jangan-cetak">
        <b style={{ marginRight: "auto" }}>{k.judul}</b>
        {klaim.length > 0 && (
          <span className="pill">{k.jumlah(klaim.length)}</span>
        )}
        <button className="pri" disabled={!klaim.length}
                onClick={() => window.print()}>{k.cetak}</button>
        <button onClick={() => window.close()}>{k.tutup}</button>
      </div>

      {galat && <div className="banner stop"><b>{k.galat}</b>{galat}</div>}
      {busy && <p className="hint">{k.memuat}</p>}
      {!busy && !galat && !klaim.length && <p className="hint">{k.kosong}</p>}

      {klaim.map((c) => (
        <div key={c.id} className="panel sp lembar">
          <FormPengajuan klaim={c} />
        </div>
      ))}
    </div>
  );
}
