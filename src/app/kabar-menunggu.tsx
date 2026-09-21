"use client";

/**
 * Pemberitahuan saat masuk: berapa dokumen yang sedang menunggu orang ini.
 *
 * Sampai sekarang dokumen yang dikirim ke tim pajak hanya diam di daftar.
 * Tidak ada apa pun yang memberi tahu tim pajak bahwa ada yang menunggu
 * diverifikasi — yang mengetahuinya hanya yang kebetulan membuka layarnya, dan
 * pekerjaan yang hanya terlihat oleh yang mencarinya tertunda berhari-hari
 * tanpa ada yang tahu.
 *
 * Muncul sekali per masuk, bukan di tiap layar. Penandanya dipasang layar masuk
 * di sessionStorage dan dicabut di sini begitu terbaca: pemberitahuan yang
 * muncul berulang-ulang sepanjang hari akan ditutup tanpa dibaca, dan sesudah
 * itu ia tidak lagi memberi tahu apa pun.
 */

import { useEffect, useState } from "react";

import { useBahasa, useKata } from "./bahasa";
import type { Sesi } from "./session";

/** Penanda "baru saja masuk", dipasang layar masuk sesaat sebelum berpindah. */
export const PENANDA_MASUK = "chl.baru-masuk";

/** Apa yang ditunggu pada tiap status, dari sudut pandang yang menunggunya. */
const TUGAS: Record<string, { id: string; en: string }> = {
  pending_admin_review: {
    id: "menunggu diperiksa sebelum diteruskan ke tim pajak",
    en: "awaiting your review before going to the tax team",
  },
  pending_tax_verification: {
    id: "menunggu verifikasi pajak",
    en: "awaiting tax verification",
  },
  tax_verified: {
    id: "sudah diperiksa tim pajak dan kembali kepada Anda — menunggu tautan " +
        "tanda tangan dikirim ke Sales/Agent",
    en: "checked by the tax team and back with you — awaiting the signature " +
        "link being sent to the Sales/Agent",
  },
  signature_review_required: {
    id: "menunggu tanda tangan diperiksa manual",
    en: "awaiting a manual check of the signature",
  },
  awaiting_scan_upload: {
    id: "menunggu unggahan pindaian dokumen bertanda tangan",
    en: "awaiting the scan of the signed document",
  },
  circulating_head_finance: {
    id: "menunggu tanda tangan Head Finance",
    en: "awaiting the Head of Finance's signature",
  },
  circulating_management: {
    id: "menunggu tanda tangan manajemen",
    en: "awaiting management's signature",
  },
  approved: {
    id: "menunggu penetapan tanggal pembayaran",
    en: "awaiting a payment date",
  },
  awaiting_settlement_date: {
    id: "menunggu tanggal pembayaran",
    en: "awaiting the payment date",
  },
};

const KATA = {
  id: {
    // "Dokumen" hanya bila seluruhnya memang dokumen. Fee yang baru dapat
    // diklaim belum punya dokumen apa pun — menyebutnya dokumen membuat
    // angkanya tidak cocok dengan daftar klaim mana pun yang dibuka sesudahnya.
    judul: (n: number, adaFee: boolean) =>
      adaFee ? `${n} pekerjaan menunggu Anda` : `${n} dokumen menunggu Anda`,
    pengantar: "Pada project yang sedang dibuka:",
    buka: "Lihat dokumennya",
    tutup: "Nanti saja",
    satuan: (n: number) => `${n} dokumen`,
    satuanFee: (n: number) => `${n} fee`,
    siapDiajukan: "sudah dapat diklaim tapi belum diajukan",
  },
  en: {
    judul: (n: number, adaFee: boolean) =>
      adaFee ? `${n} items are waiting for you`
             : `${n} documents are waiting for you`,
    pengantar: "On the project currently open:",
    buka: "Open them",
    tutup: "Later",
    satuan: (n: number) => `${n} documents`,
    satuanFee: (n: number) => `${n} fees`,
    siapDiajukan: "claimable but not yet submitted",
  },
};

type Kabar = {
  jumlah: number;
  layar: string;
  rincian: { status: string; jumlah: number }[];
  /** Fee yang sudah boleh diajukan tapi belum — hanya untuk Admin Sales. */
  dapat_diajukan?: number;
};

export function KabarMenunggu({ sesi }: { sesi: Sesi }) {
  const k = useKata(KATA);
  const { bahasa } = useBahasa();
  const [kabar, setKabar] = useState<Kabar | null>(null);

  useEffect(() => {
    let batal = false;
    try {
      if (sessionStorage.getItem(PENANDA_MASUK) !== "1") return;
    } catch {
      // Penyimpanan sesi ditutup peramban. Tanpa penanda, pemberitahuan ini
      // tidak dapat dibatasi sekali per masuk — lebih baik tidak muncul sama
      // sekali daripada muncul di tiap layar.
      return;
    }
    fetch("/api/claims/menunggu")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Kabar | null) => {
        if (batal || !d) return;
        // Dicabut hanya setelah jawabannya sampai: permintaan yang gagal
        // karena jaringan tidak boleh menghabiskan satu-satunya kesempatan
        // memberi tahu.
        try { sessionStorage.removeItem(PENANDA_MASUK); } catch { /* biar */ }
        if (d.jumlah > 0) setKabar(d);
      })
      .catch(() => { /* pemberitahuan gagal bukan alasan menghalangi layar */ });
    return () => { batal = true; };
  }, [sesi.username]);

  if (!kabar) return null;

  const judul = k.judul(kabar.jumlah, Boolean(kabar.dapat_diajukan));

  return (
    <div className="tirai"
         onMouseDown={(e) => {
           if (e.target === e.currentTarget) setKabar(null);
         }}>
      <div className="popup" role="dialog" aria-modal="true"
           aria-label={judul}>
        <h2 style={{ margin: "0 0 10px" }}>{judul}</h2>
        <p className="pengantar" style={{ marginBottom: 8 }}>{k.pengantar}</p>

        <ul className="daftar-menunggu">
          {/* Paling atas: pekerjaan yang belum punya dokumen sama sekali, dan
              karena itu tidak muncul di daftar klaim mana pun. Yang tidak
              tercatat di mana-mana adalah yang paling mudah terlewat. */}
          {Boolean(kabar.dapat_diajukan) && (
            <li>
              <b>{k.satuanFee(kabar.dapat_diajukan as number)}</b>{" "}
              {k.siapDiajukan}
            </li>
          )}
          {kabar.rincian.map((r) => (
            <li key={r.status}>
              <b>{k.satuan(r.jumlah)}</b>{" "}
              {TUGAS[r.status]?.[bahasa] ?? r.status}
            </li>
          ))}
        </ul>

        {/* Tombol, bukan tautan: bentuk tombol di dalam pop-up sudah diatur
            (.popup > button), dan tautan yang didandani seperti tombol di
            sebelah tombol sungguhan hampir selalu berbeda tinggi sedikit. */}
        <button className="pri" onClick={() => { location.href = kabar.layar; }}>
          {k.buka}
        </button>
        <button onClick={() => setKabar(null)}>{k.tutup}</button>
      </div>
    </div>
  );
}
