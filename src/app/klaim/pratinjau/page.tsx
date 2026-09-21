"use client";

/**
 * Pratinjau Form Pengajuan, dibuka di jendela tersendiri.
 *
 * Dipakai setelah beberapa fee diajukan sekaligus dari daftar penjualan: satu
 * unit dapat menghasilkan dua sampai empat formulir dalam satu tekan, dan
 * semuanya perlu diperiksa Admin Sales sebelum berjalan.
 *
 * Jendela ini adalah langkah pemeriksaan itu, bukan sekadar tampilan. Admin
 * Sales membaca tiap formulir, mencentang dokumen yang berkasnya memang ada di
 * tangannya, lalu menekan "Kirim ke Pajak". Sesudah itu klaimnya berpindah ke
 * tim pajak untuk diverifikasi; bila benar, ia kembali ke Admin Sales untuk
 * dikirimkan tautannya kepada Sales/Agent lewat WhatsApp.
 *
 * Tidak memakai useSearchParams: pada Next.js 16 ia menuntut Suspense dan
 * menggagalkan prerender statis halaman ini. Alamatnya dibaca setelah komponen
 * terpasang, yang mana memang saat jendela ini hidup.
 */

import { useCallback, useEffect, useState } from "react";

import { FormPengajuan } from "../form-pengajuan";
import { DOKUMEN, DOKUMEN_KODE, type Jenis } from "../jenis";
import { useKata } from "../../bahasa";
import { MemeriksaSesi } from "../../kerangka";
import { useSesi } from "../../session";

const KATA = {
  id: {
    judul: "Pratinjau Form Pengajuan",
    memuat: "Memuat formulir…",
    galat: "Formulir tidak dapat dibuka",
    galatKirim: "Sebagian klaim tidak dapat dikirim",
    kosong: "Tidak ada formulir yang diminta.",
    kirim: "Kirim ke Pajak",
    mengirim: "Mengirim…",
    jumlah: (n: number) => `${n} formulir`,
    pengantar:
      "Periksa tiap formulir, lalu centang dokumen yang berkasnya sudah ada " +
      "di tangan Anda. Setelah dikirim, klaim berpindah ke tim pajak untuk " +
      "diverifikasi dan kembali ke Anda bila sudah benar.",
    belumLengkap: "Centang seluruh dokumen pada tiap formulir sebelum dikirim.",
    terkirim: (n: number) =>
      `${n} klaim sudah dikirim ke tim pajak. Setelah diverifikasi, klaim ` +
      "kembali ke Pengajuan Fee untuk dikirimkan tautannya kepada Sales/Agent.",
    sudahJalan: "sudah berjalan",
  },
  en: {
    judul: "Submission form preview",
    memuat: "Loading forms…",
    galat: "The forms could not be opened",
    galatKirim: "Some claims could not be sent",
    kosong: "No forms were requested.",
    kirim: "Send to Tax",
    mengirim: "Sending…",
    jumlah: (n: number) => `${n} forms`,
    pengantar:
      "Check each form, then tick the documents you actually hold. Once sent, " +
      "the claim moves to the tax team for verification and comes back to you " +
      "if everything is correct.",
    belumLengkap: "Tick every document on each form before sending.",
    terkirim: (n: number) =>
      `${n} claims sent to the tax team. Once verified, they return to Fee ` +
      "Submission so the link can be sent to the Sales/Agent.",
    sudahJalan: "already under way",
  },
};

export default function PratinjauPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const [klaim, setKlaim] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);
  /** Centang dokumen, berkunci "<klaim>:<nama dokumen>". */
  const [ceklis, setCeklis] = useState<Record<string, boolean>>({});

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

  /** Dokumen yang wajib dicentang untuk satu klaim. */
  const wajib = (c: any): string[] => DOKUMEN[c.claim_type as Jenis] ?? [];

  /** Klaim yang masih berupa draft — yang lain sudah berjalan, tidak dikirim lagi. */
  const masihDraft = klaim.filter((c) => c.status === "draft");

  const lengkap = masihDraft.length > 0 &&
    masihDraft.every((c) => wajib(c).every((d) => ceklis[`${c.id}:${d}`]));

  /**
   * Kirim ke tim pajak.
   *
   * Tiga langkah per klaim, berurutan: catat dokumen yang dicentang, ajukan,
   * lalu teruskan ke pajak. Gate-nya ditegakkan server — `submit` menolak klaim
   * yang checklist dokumennya belum lengkap — jadi pencatatan dokumen harus
   * benar-benar selesai lebih dulu, bukan dikirim bersamaan.
   */
  const kirimKePajak = async () => {
    setKirim(true); setGalat(null); setKabar(null);
    const gagal: string[] = [];
    let berhasil = 0;
    try {
      for (const c of masihDraft) {
        try {
          const daftar = wajib(c);
          for (let i = 0; i < daftar.length; i++) {
            if (!ceklis[`${c.id}:${daftar[i]}`]) continue;
            // Satu baris checklist dapat mewakili beberapa kode dokumen —
            // lihat DOKUMEN_KODE. Yang dicatat adalah kodenya, karena itulah
            // yang ditagih server saat klaimnya diajukan.
            const kode = DOKUMEN_KODE[c.claim_type as Jenis]?.[i] ?? [daftar[i]];
            for (const item of kode) {
              const r = await fetch(`/api/claims/${c.id}/documents`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ checklist_item: item }),
              });
              if (r.status === 401) { location.href = "/login"; return; }
            }
          }
          const s1 = await fetch(`/api/claims/${c.id}/submit`, { method: "POST" });
          const b1 = await s1.json().catch(() => ({}));
          if (!s1.ok) throw new Error(b1.detail ?? b1.title ?? `HTTP ${s1.status}`);

          const s2 = await fetch(`/api/claims/${c.id}/admin-review`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: "forward_to_tax" }),
          });
          const b2 = await s2.json().catch(() => ({}));
          if (!s2.ok) throw new Error(b2.detail ?? b2.title ?? `HTTP ${s2.status}`);
          berhasil++;
        } catch (e: any) {
          gagal.push(`${c.claim_number}: ${String(e?.message ?? e)}`);
        }
      }
      if (gagal.length) setGalat(`${k.galatKirim} — ${gagal.join(" · ")}`);
      if (berhasil) setKabar(k.terkirim(berhasil));
      await muat();
    } finally { setKirim(false); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  return (
    <div className="wrap jendela-pratinjau">
      <div className="row sp jangan-cetak">
        <b style={{ marginRight: "auto" }}>{k.judul}</b>
        {klaim.length > 0 && (
          <span className="pill">{k.jumlah(klaim.length)}</span>
        )}
        {/* Satu tombol saja. Jendela ini langkah pemeriksaan, dan tombol tutup
            di sebelah tombol kirim mengundang jendela ditutup sebelum
            klaimnya berjalan ke mana pun. */}
        <button className="pri" disabled={!lengkap || kirim}
                onClick={() => void kirimKePajak()}>
          {kirim ? k.mengirim : k.kirim}
        </button>
      </div>

      {galat && <div className="banner stop"><b>{k.galat}</b>{galat}</div>}
      {kabar && <div className="banner ok">{kabar}</div>}
      {busy && <p className="hint">{k.memuat}</p>}
      {!busy && !galat && !klaim.length && <p className="hint">{k.kosong}</p>}

      {klaim.length > 0 && (
        <div className="banner info jangan-cetak">
          <b>{k.pengantar}</b>
          {!lengkap && masihDraft.length > 0 ? k.belumLengkap : ""}
        </div>
      )}

      {klaim.map((c) => (
        <div key={c.id} className="panel sp lembar">
          {c.status !== "draft" && (
            <div className="row jangan-cetak" style={{ marginBottom: 8 }}>
              <span className="pill ok">
                {c.claim_number} · {c.status} — {k.sudahJalan}
              </span>
            </div>
          )}
          <FormPengajuan
            klaim={c}
            ceklis={c.status === "draft"
              ? Object.fromEntries(wajib(c).map(
                  (d) => [d, Boolean(ceklis[`${c.id}:${d}`])]))
              : undefined}
            onCeklis={c.status === "draft"
              ? (item, dicentang) => setCeklis((lama) => (
                  { ...lama, [`${c.id}:${item}`]: dicentang }))
              : undefined} />
        </div>
      ))}
    </div>
  );
}
