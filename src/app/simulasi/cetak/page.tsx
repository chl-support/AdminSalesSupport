"use client";

/**
 * Pratinjau & cetak Simulasi / NPV, dalam dua bentuk lembar:
 *
 *   - Konsumen: "Simulasi Hitungan Rumah" — data unit, harga, dan jadwal
 *     pembayaran beserta tagihan setelah PPN DTP. Tanpa nilai sekarang:
 *     yang dibaca konsumen adalah berapa dan kapan ia membayar.
 *   - Management: lembar NPV berdampingan — Cash Keras di kiri sebagai
 *     pembanding, cara bayar yang diminta di kanan — lengkap dengan PV,
 *     PPN DTP, dan selisihnya terhadap Cash Keras.
 *
 * Bentuk keduanya disalin dari lembar cetak berkas Simulation TOP,
 * termasuk tanggal berbahasa Inggris dan format rupiah akuntansinya, supaya
 * yang dicetak dari sini sama dengan yang selama ini diterima orang.
 *
 * Dibuka di tab tersendiri dari layar Simulasi / NPV; masukannya dibawa lewat
 * alamat. Angkanya dihitung dengan hitung() yang sama dengan layarnya, jadi
 * yang tercetak tidak dapat berbeda dari yang terlihat di sana.
 *
 * Tidak memakai useSearchParams — pada Next.js 16 ia menuntut Suspense dan
 * menggagalkan prerender statis (lihat juga klaim/pratinjau).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useKata } from "../../bahasa";
import { MemeriksaSesi } from "../../kerangka";
import { useSesi } from "../../session";
import { bentukSkema, hitung, type UnitHarga } from "@/lib/simulasi";
import { LembarKonsumen, LembarManagement, bacaJadwal, namaPdf, tanggalIso, unduhPdf,
         type BarisSunting, type Jenis }
  from "../lembar-cetak";

const KATA = {
  id: {
    konsumen: "Konsumen", management: "Management",
    cetak: "Cetak", tutup: "Tutup",
    unduh: "Unduh PDF", menyusun: "Menyusun PDF…",
    gagalPdf: "PDF tidak dapat disusun. Coba lagi, atau pakai Cetak lalu Simpan sebagai PDF.",
    memuat: "Memuat simulasi…",
    takAda: "Unit atau cara bayar ini tidak ada di pricelist yang berlaku.",
    catatan: "Lembar dicetak pada kertas A4; Konsumen tegak, Management melintang.",
  },
  en: {
    konsumen: "Customer", management: "Management",
    cetak: "Print", tutup: "Close",
    unduh: "Download PDF", menyusun: "Building PDF…",
    gagalPdf: "The PDF could not be built. Try again, or use Print and Save as PDF.",
    memuat: "Loading simulation…",
    takAda: "This unit or payment scheme is not in the price list in force.",
    catatan: "Printed on A4; Customer in portrait, Management in landscape.",
  },
};

type Masukan = {
  jenis: Jenis; kode: string; skema: string; tanggal: string;
  diskon: number; bunga: number;
  /** Jadwal suntingan dari layar Simulasi; null = jadwal bawaan. */
  jadwal: BarisSunting[] | null;
};

// ── Halaman ────────────────────────────────────────────────────────────────

export default function CetakSimulasiPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);

  const [m, setM] = useState<Masukan | null>(null);
  const [unit, setUnit] = useState<UnitHarga | null | undefined>(undefined);
  const [skemaPl, setSkemaPl] = useState<string[]>([]);
  const [galat, setGalat] = useState<string | null>(null);

  // Masukan dibaca dari alamat setelah terpasang.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const num = (s: string | null, awal: number) => {
      const n = Number(String(s ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : awal;
    };
    setM({
      jenis: q.get("jenis") === "management" ? "management" : "konsumen",
      kode: q.get("kode") ?? "", skema: q.get("skema") ?? "",
      tanggal: q.get("tanggal") ?? "",
      diskon: num(q.get("diskon"), 0), bunga: num(q.get("bunga"), 4.65),
      jadwal: bacaJadwal(q.get("jadwal")),
    });
  }, []);

  useEffect(() => {
    if (!sesi || !m) return;
    (async () => {
      const res = await fetch("/api/pricelist");
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setSkemaPl(b.berlaku?.skema ?? []);
      setUnit((b.berlaku?.unit ?? []).find((u: UnitHarga) => u.kode === m.kode) ?? null);
    })();
  }, [sesi, m]);

  const booking = useMemo(() => {
    const [th, bl, tg] = (m?.tanggal ?? "").split("-").map(Number);
    return th ? new Date(Date.UTC(th, (bl || 1) - 1, tg || 1)) : new Date();
  }, [m]);

  // Satu lembar, satu halaman. Cicilan 30x menghasilkan tiga puluh baris
  // lebih, dan lembar Management melintang tidak lagi muat pada A4. Tinggi
  // lembarnya diukur, lalu dikecilkan seperlunya saat dicetak — "Fit Sheet
  // on One Page" dari Excel, dikerjakan dari sini seperti rekap Overriding.
  const lembarRef = useRef<HTMLDivElement | null>(null);
  const [muat, setMuat] = useState(1);
  const [menyusun, setMenyusun] = useState(false);
  const [galatPdf, setGalatPdf] = useState(false);
  const tunai = skemaPl.find((s) => bentukSkema(s)?.jenis === "cash") ?? "";

  const hasil = useMemo(() => {
    if (!m || !unit || !(unit.harga[m.skema] > 0)) return null;
    return hitung({ unit, skema: m.skema, diskon: m.diskon / 100,
                    bungaKpr: m.bunga / 100, tanggal: booking,
                    jadwalManual: m.jadwal?.map((b) => ({
                      ket: b.ket, tgl: tanggalIso(b.tgl, booking), nilai: b.nilai })) });
  }, [m, unit, booking]);
  const sembunyi = m?.jadwal?.map((b) => b.sembunyi);

  // Sisi kiri lembar Management: Cash Keras pada harga pricelist-nya, tanpa
  // diskon — begitulah lembar pembandingnya di berkas Excel.
  const cash = useMemo(() => {
    if (!unit || !(unit.harga[tunai] > 0)) return null;
    return hitung({ unit, skema: tunai, diskon: 0,
                    bungaKpr: (m?.bunga ?? 0) / 100, tanggal: booking });
  }, [unit, tunai, m, booking]);

  const jenis = m?.jenis ?? "konsumen";

  useLayoutEffect(() => {
    const el = lembarRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    // Tinggi halaman dikurangi margin 10 mm atas-bawah, dalam px CSS.
    const mm = 96 / 25.4;
    const tersedia = (jenis === "management" ? 190 : 277) * mm * 0.98;
    setMuat(Math.min(1, tersedia / el.offsetHeight));
  });

  if (memuat || !sesi) return <MemeriksaSesi />;

  const gantiJenis = (j: Jenis) => {
    if (!m) return;
    const q = new URLSearchParams(location.search);
    q.set("jenis", j);
    history.replaceState(null, "", `?${q}`);
    setM({ ...m, jenis: j });
  };
  const nama = sesi.project_name ?? "";

  return (
    <div className="cetak-sim">
      {/* Arah kertas mengikuti lembarnya: Management melebar ke samping. */}
      <style>{`@page { size: A4 ${jenis === "management" ? "landscape" : "portrait"};
                       margin: 10mm; }`}</style>

      <div className="cetak-sim-alat jangan-cetak">
        <div className="row" style={{ margin: 0 }}>
          <button className={jenis === "konsumen" ? "pri" : undefined}
                  onClick={() => gantiJenis("konsumen")}>{k.konsumen}</button>
          <button className={jenis === "management" ? "pri" : undefined}
                  onClick={() => gantiJenis("management")}>{k.management}</button>
        </div>
        <span className="hint" style={{ margin: 0 }}>{k.catatan}</span>
        <div className="row" style={{ margin: 0 }}>
          <button disabled={!hasil || menyusun}
                  onClick={async () => {
                    const el = lembarRef.current?.firstElementChild as HTMLElement | null;
                    if (!el || !m) return;
                    setMenyusun(true); setGalatPdf(false);
                    try { await unduhPdf(el, jenis, namaPdf(m.kode, m.skema, jenis)); }
                    catch { setGalatPdf(true); }
                    finally { setMenyusun(false); }
                  }}>{menyusun ? k.menyusun : k.unduh}</button>
          <button className="pri" disabled={!hasil}
                  onClick={() => window.print()}>{k.cetak}</button>
          <button onClick={() => window.close()}>{k.tutup}</button>
        </div>
      </div>

      {galatPdf && <div className="banner stop jangan-cetak">{k.gagalPdf}</div>}

      <div ref={lembarRef} className="muat-halaman"
           style={{ ["--muat" as any]: muat }}>
      {galat ? <div className="banner stop">{galat}</div>
        : unit === undefined ? <p className="hint">{k.memuat}</p>
        : !hasil || (jenis === "management" && !cash)
          ? <div className="banner stop">{k.takAda}</div>
        : jenis === "konsumen"
          ? <LembarKonsumen h={hasil} unit={unit!} slug={sesi.project_slug ?? ""}
                            nama={nama} booking={booking}
                            bungaKpr={(m?.bunga ?? 0) / 100} sembunyi={sembunyi} />
          : <LembarManagement h={hasil} cash={cash!} unit={unit!} nama={nama}
                              sembunyi={sembunyi} />}
      </div>
    </div>
  );
}
