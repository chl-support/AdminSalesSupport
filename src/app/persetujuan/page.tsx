"use client";

/**
 * Approval / Persetujuan — rincian dokumen pengajuan.
 *
 * Ke sinilah pengajuan mendarat setelah dibuat dari layar Pengajuan Fee.
 * Sebelumnya layar ini hanya mengalihkan ke konsol klaim, dan pengajuan yang
 * baru dibuat langsung membuka jendela pratinjau — sehingga yang mengajukan
 * empat fee sekaligus mendapat jendela penuh formulir sebelum sempat melihat
 * apa yang barusan ia buat.
 *
 * Yang ditampilkan di sini rinciannya: nomor, jenis, unit, penerima, angka, dan
 * keadaannya. Pratinjau formulirnya ada di kolom paling kanan, dibuka sendiri
 * saat memang mau diperiksa.
 *
 * Tindakan atas klaim — meneruskan, menahan, menyetujui — tetap di konsol.
 * Dua layar yang sama-sama dapat menggerakkan klaim akan berbeda perilaku cepat
 * atau lambat, dan bedanya berupa klaim yang disetujui di satu layar tetapi
 * tidak di layar lain.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { namaJenis } from "../klaim/jenis";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;
const tgl = (v?: string | null) => (v ? String(v).slice(0, 10) : "—");

const KATA = {
  id: {
    judul: "Approval / Persetujuan",
    pengantar: "Rincian dokumen pengajuan pada project ini. Pratinjau " +
               "formulirnya dibuka dari kolom paling kanan.",
    galat: "Data klaim tidak dapat dibaca",
    tampilkan: "Tampilkan", semua: "semua klaim",
    belumJalan: "belum diteruskan", berjalan: "sedang berjalan",
    selesai: "sudah selesai",
    jumlah: (n: number) => `${n} klaim`,
    daftar: "Dokumen pengajuan",
    thNomor: "Nomor", thJenis: "Jenis fee", thUnit: "Unit",
    thPenerima: "Penerima", thBruto: "Bruto", thPph: "PPh",
    thBersih: "Bersih", thStatus: "Status", thDokumen: "Dokumen",
    pratinjau: "Lihat pratinjau",
    kosong: "Belum ada pengajuan pada project ini.",
    memuat: "Memuat…",
  },
  en: {
    judul: "Approval Status",
    pengantar: "Submission details for this project. The form preview opens " +
               "from the rightmost column.",
    galat: "Claim data could not be read",
    tampilkan: "Show", semua: "all claims",
    belumJalan: "not yet forwarded", berjalan: "in progress",
    selesai: "completed",
    jumlah: (n: number) => `${n} claims`,
    daftar: "Submission documents",
    thNomor: "Number", thJenis: "Fee type", thUnit: "Unit",
    thPenerima: "Recipient", thBruto: "Gross", thPph: "Withholding",
    thBersih: "Net", thStatus: "Status", thDokumen: "Document",
    pratinjau: "View preview",
    kosong: "No submissions on this project yet.",
    memuat: "Loading…",
  },
};

/**
 * Di mana dokumennya, dan menunggu apa.
 *
 * Nama status di basis data ditulis untuk mesin — 'pending_tax_verification'
 * tidak memberi tahu siapa pun bahwa berkasnya ada di tim pajak dan yang
 * ditunggu adalah verifikasinya. Yang ditanyakan orang saat membuka layar ini
 * selalu dua hal itu, jadi dua hal itu yang ditulis.
 *
 * Status yang tidak dikenal (misalnya status baru yang belum ditambahkan di
 * sini) jatuh ke namanya sendiri, bukan ke kalimat karangan.
 */
const KEADAAN: Record<string, { id: [string, string]; en: [string, string] }> = {
  draft: {
    id: ["Di Admin Sales", "Menunggu diperiksa lalu dikirim ke tim pajak"],
    en: ["With Sales Admin", "Awaiting review, then sending to the tax team"],
  },
  submitted: {
    id: ["Di Admin Sales", "Menunggu diteruskan ke tim pajak"],
    en: ["With Sales Admin", "Awaiting forwarding to the tax team"],
  },
  pending_admin_review: {
    id: ["Di Admin Sales", "Menunggu diperiksa Admin Sales"],
    en: ["With Sales Admin", "Awaiting the Sales Admin's review"],
  },
  pending_tax_verification: {
    id: ["Di tim pajak", "Menunggu verifikasi tim pajak"],
    en: ["With the tax team", "Awaiting tax verification"],
  },
  tax_verified: {
    id: ["Kembali di Admin Sales", "Menunggu tautan tanda tangan dikirim ke Sales/Agent"],
    en: ["Back with Sales Admin", "Awaiting the signature link being sent to Sales/Agent"],
  },
  signature_link_sent: {
    id: ["Di Sales/Agent", "Menunggu tautan tanda tangan dibuka"],
    en: ["With Sales/Agent", "Awaiting the signature link being opened"],
  },
  awaiting_signature: {
    id: ["Di Sales/Agent", "Menunggu tanda tangan"],
    en: ["With Sales/Agent", "Awaiting the signature"],
  },
  signature_review_required: {
    id: ["Di Admin Sales", "Menunggu tanda tangan diperiksa manual"],
    en: ["With Sales Admin", "Awaiting a manual check of the signature"],
  },
  signed: {
    id: ["Di Admin Sales", "Menunggu pemeriksaan silang"],
    en: ["With Sales Admin", "Awaiting the cross-check"],
  },
  crosscheck_in_progress: {
    id: ["Di Admin Sales", "Menunggu pemeriksaan silang selesai"],
    en: ["With Sales Admin", "Awaiting the cross-check to finish"],
  },
  ready_to_print: {
    id: ["Di Admin Sales", "Menunggu dicetak"],
    en: ["With Sales Admin", "Awaiting printing"],
  },
  printed: {
    id: ["Di Admin Sales", "Menunggu diedarkan ke Head Finance"],
    en: ["With Sales Admin", "Awaiting circulation to the Head of Finance"],
  },
  circulating_head_finance: {
    id: ["Di Head Finance", "Menunggu tanda tangan Head Finance"],
    en: ["With the Head of Finance", "Awaiting the Head of Finance's signature"],
  },
  circulating_management: {
    id: ["Di Manajemen", "Menunggu tanda tangan manajemen"],
    en: ["With Management", "Awaiting management's signature"],
  },
  awaiting_scan_upload: {
    id: ["Di Admin Sales", "Menunggu unggahan pindaian dokumen bertanda tangan"],
    en: ["With Sales Admin", "Awaiting the scan of the signed document"],
  },
  approved: {
    id: ["Di Finance", "Menunggu penetapan tanggal pembayaran"],
    en: ["With Finance", "Awaiting a payment date"],
  },
  awaiting_settlement_date: {
    id: ["Di Finance", "Menunggu tanggal pembayaran"],
    en: ["With Finance", "Awaiting the payment date"],
  },
  partially_paid: {
    id: ["Di Finance", "Dibayar sebagian, menunggu pelunasan"],
    en: ["With Finance", "Partly paid, awaiting settlement"],
  },
  paid: {
    id: ["Di Finance", "Sudah dibayar, menunggu ditutup"],
    en: ["With Finance", "Paid, awaiting closing"],
  },
  completed: {
    id: ["Selesai", "Tidak menunggu apa pun"],
    en: ["Completed", "Nothing outstanding"],
  },
  returned: {
    id: ["Kembali ke Admin Sales", "Menunggu diperbaiki lalu diajukan ulang"],
    en: ["Back with Sales Admin", "Awaiting correction and resubmission"],
  },
  rejected: {
    id: ["Ditolak", "Tidak berjalan lagi"],
    en: ["Rejected", "No longer moving"],
  },
  cancelled: {
    id: ["Dibatalkan", "Tidak berjalan lagi"],
    en: ["Cancelled", "No longer moving"],
  },
  clawback: {
    id: ["Penarikan kembali", "Menunggu penyelesaian penarikan dana"],
    en: ["Clawback", "Awaiting the clawback to be settled"],
  },
};

function keadaan(status: string, bahasa: "id" | "en"): [string, string] {
  return KEADAAN[status]?.[bahasa] ?? [status, ""];
}

/** Keadaan yang dianggap belum bergerak ke mana pun. */
const DIAM = ["draft", "submitted", "pending_admin_review"];
const SELESAI = ["completed", "paid", "rejected", "cancelled", "clawback"];

type Saring = "semua" | "diam" | "jalan" | "selesai";

export default function PersetujuanPage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);
  const [klaim, setKlaim] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [saring, setSaring] = useState<Saring>("semua");

  const muat = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/claims");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setKlaim(Array.isArray(b) ? b : []);
      setGalat(null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  if (memuat || !sesi) return <MemeriksaSesi />;

  const terlihat = klaim.filter((c) => {
    if (saring === "diam") return DIAM.includes(c.status);
    if (saring === "selesai") return SELESAI.includes(c.status);
    if (saring === "jalan") {
      return !DIAM.includes(c.status) && !SELESAI.includes(c.status);
    }
    return true;
  });

  return (
    <Kerangka sesi={sesi} lebar judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      {galat && <div className="banner stop"><b>{k.galat}</b>{galat}</div>}

      <div className="panel sp">
        <div className="filters">
          <div>
            <div className="lbl">{k.tampilkan}</div>
            <select value={saring}
                    onChange={(e) => setSaring(e.target.value as Saring)}>
              <option value="semua">{k.semua}</option>
              <option value="diam">{k.belumJalan}</option>
              <option value="jalan">{k.berjalan}</option>
              <option value="selesai">{k.selesai}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          {k.daftar}
          <span className="pill">{k.jumlah(terlihat.length)}</span>
        </h2>

        <div className="tscroll">
          <table className="tabel-penjualan"><tbody>
            <tr>
              <th>{k.thNomor}</th>
              <th>{k.thJenis}</th>
              <th>{k.thUnit}</th>
              <th className="sel-penerima">{k.thPenerima}</th>
              <th>{k.thBruto}</th>
              <th>{k.thPph}</th>
              <th>{k.thBersih}</th>
              <th className="sel-keadaan">{k.thStatus}</th>
              <th style={{ width: 140 }}>{k.thDokumen}</th>
            </tr>

            {terlihat.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.claim_number}</b><br />
                  <span style={{ color: "var(--mut)" }}>
                    {tgl(c.created_at)}
                  </span>
                </td>
                <td>{namaJenis(c.claim_type, bahasa)}</td>
                <td className="sel-unit">{c.unit?.code ?? "—"}</td>
                <td className="sel-penerima">{c.marketing?.full_name ?? "—"}</td>
                <td className="n">{rp(c.gross_amount)}</td>
                <td className="n">{rp(c.withholding_tax)}</td>
                <td className="n"><b>{rp(c.net_amount)}</b></td>
                <td className="sel-keadaan">
                  <span className={`pill ${SELESAI.includes(c.status) ? "ok"
                                   : DIAM.includes(c.status) ? "warn" : ""}`}>
                    {keadaan(c.status, bahasa)[0]}
                  </span>
                  <div className="menunggu">{keadaan(c.status, bahasa)[1]}</div>
                </td>
                {/* Pratinjau dibuka di jendela tersendiri, sama seperti dari
                    layar Pengajuan Fee: yang dibuka adalah dokumen untuk
                    diperiksa dan dicetak, dan mencetaknya dari dalam layar ini
                    berarti ikut mencetak menu dan seluruh tabelnya. */}
                <td>
                  <button onClick={() => window.open(
                            `/klaim/pratinjau?ids=${c.id}`, "_blank")}>
                    {k.pratinjau}
                  </button>
                </td>
              </tr>
            ))}

            {!terlihat.length && !busy && (
              <tr>
                <td colSpan={9} style={{ color: "var(--mut)" }}>{k.kosong}</td>
              </tr>
            )}
            {busy && (
              <tr>
                <td colSpan={9} style={{ color: "var(--mut)" }}>{k.memuat}</td>
              </tr>
            )}
          </tbody></table>
        </div>
      </div>
    </Kerangka>
  );
}
