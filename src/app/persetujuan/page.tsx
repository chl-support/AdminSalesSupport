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
 * Satu tindakan memang ada di sini: mengirim tautan tanda tangan ke
 * Sales/Agent, di dalam kolom Status, hanya untuk Admin Sales. Tempatnya
 * memang di sini — yang dikirim adalah dokumen yang barusan dibaca pada baris
 * itu, dan sebelumnya tombolnya berada di layar Pengajuan Fee, satu layar
 * sebelum dokumennya ada.
 *
 * Tindakan lain atas klaim — meneruskan, menahan, menyetujui — tetap di konsol.
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

/** "2026-09-21" menjadi "21/09/2026", sebagaimana tertulis pada acuannya. */
const tglPendek = (v?: string | null) => {
  const [y, b, h] = String(v ?? "").slice(0, 10).split("-");
  return y && b && h ? `${h}/${b}/${y}` : "—";
};

/**
 * "Diajukan oleh" sebagaimana diminta: nama orangnya, dengan nama masuknya
 * di dalam kurung. Nama lengkapnya dapat hilang bila akunnya sudah dihapus —
 * yang tersisa nama masuknya saja, dan itu tetap lebih berarti daripada
 * kolom kosong.
 */
const pengaju = (c: any) => {
  const nama = c.diajukan_oleh_nama, masuk = c.diajukan_oleh;
  if (!masuk) return "—";
  return nama ? `${nama} (${masuk})` : masuk;
};

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
    thNo: "No.", thTanggal: "Tanggal Pengajuan", thPerihal: "Perihal/Topik",
    thKategori: "Kategori", thPenerima: "Penerima",
    thPengaju: "Diajukan Oleh, (user login)", thBruto: "Jumlah Komisi",
    thPpn: "PPN", thPph: "PPh", thBersih: "Komisi Yang Dibayarkan",
    thStatus: "Status", thDokumen: "Tindakan",
    katInhouse: "Sales Inhouse", katAgent: "Agent",
    pratinjau: "Lihat pratinjau",
    kosong: "Belum ada pengajuan pada project ini.",
    memuat: "Memuat…",
    kabarJudul: "Dokumen sudah dikirim ke tim pajak",
    kabarIsi: (n: number) =>
      `${n} dokumen pengajuan sudah dikirim ke tim pajak untuk diverifikasi. ` +
      "Bila sudah benar, dokumennya kembali ke Anda untuk dikirimkan " +
      "tautannya kepada Sales/Agent lewat WhatsApp.",
    kabarTutup: "Tutup",
    waKirim: "Kirim tautan WA", waMengirim: "Mengirim…",
    waUlang: "Kirim ulang tautan",
    waTanpaHp: "No. HP penerima belum tercatat",
    waTerbit: (hp: string) => `Tautan terbit untuk ${hp}.`,
    waBukaWa: "Buka WhatsApp", waSalin: "Salin tautan",
    waTersalin: "Tautan tersalin.",
    waKode: "Kode verifikasi:",
    waKodeCatatan: "Sampaikan kode lewat jalur terpisah dari tautannya.",
    waGagal: "Tautan tidak dapat diterbitkan",
    waJudul: "Tautan tanda tangan untuk Sales/Agent",
    waLihat: "Lihat tautannya",
    waAlamat: "Alamat tautan",
    waTutup: "Tutup",
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
    thNo: "No.", thTanggal: "Submitted on", thPerihal: "Subject / topic",
    thKategori: "Category", thPengaju: "Submitted by (login)",
    thPpn: "VAT", katInhouse: "In-house sales", katAgent: "Agent",
    thPenerima: "Recipient", thBruto: "Commission amount",
    thPph: "Withholding",
    thBersih: "Commission paid", thStatus: "Status", thDokumen: "Action",
    pratinjau: "View preview",
    kosong: "No submissions on this project yet.",
    memuat: "Loading…",
    kabarJudul: "Sent to the tax team",
    kabarIsi: (n: number) =>
      `${n} submission documents were sent to the tax team for verification. ` +
      "Once correct, they come back to you so the link can be sent to the " +
      "Sales/Agent over WhatsApp.",
    kabarTutup: "Close",
    waKirim: "Send WhatsApp link", waMengirim: "Sending…",
    waUlang: "Re-send the link",
    waTanpaHp: "The recipient has no phone number on record",
    waTerbit: (hp: string) => `Link issued for ${hp}.`,
    waBukaWa: "Open WhatsApp", waSalin: "Copy the link",
    waTersalin: "Link copied.",
    waKode: "Verification code:",
    waKodeCatatan: "Give the code through a channel separate from the link.",
    waGagal: "The link could not be issued",
    waJudul: "Signature link for the Sales/Agent",
    waLihat: "Show the link",
    waAlamat: "Link address",
    waTutup: "Close",
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

/**
 * Nomor untuk tautan wa.me, yang hanya menerima bentuk internasional.
 *
 * "08121234800" dikirim apa adanya akan membuka percakapan ke nomor yang tidak
 * ada. Awalan 0 diganti 62; yang sudah berawalan 62 atau +62 dibiarkan.
 */
function nomorWa(hp?: string | null): string {
  const bersih = String(hp ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  return bersih.startsWith("0") ? `62${bersih.slice(1)}` : bersih;
}

/**
 * Keadaan yang menunggu tautan tanda tangan dikirim.
 *
 * Yang sudah terkirim ikut, bukan hanya yang belum: tautannya berlaku terbatas
 * dan tidak tersimpan di mana pun setelah layar ditutup, jadi baris yang
 * kehilangan tombolnya begitu ditekan membawa serta tautan yang baru terbit —
 * sebelum sempat dibuka atau disalin.
 *
 * "Menunggu tanda tangan" pun ikut. Sales/Agent sudah membuka tautannya tetapi
 * belum menandatangani, dan pada keadaan itu tombolnya dulu hilang: tautannya
 * tidak dapat diperlihatkan lagi maupun diterbitkan ulang, sehingga klaimnya
 * menggantung di situ tanpa satu pun jalan untuk menindaklanjuti.
 */
const MENUNGGU_TAUTAN = ["tax_verified", "signature_link_sent",
                         "awaiting_signature"];

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
  const [kabar, setKabar] = useState<string | null>(null);
  const [saring, setSaring] = useState<Saring>("semua");
  /** Jumlah klaim yang baru saja dikirim ke pajak dari jendela pratinjau. */
  const [terkirim, setTerkirim] = useState<number | null>(null);
  /** Tautan yang sudah terbit pada layar ini, berkunci id klaim. */
  const [tautan, setTautan] = useState<Record<string, any>>({});
  const [mengirim, setMengirim] = useState<string | null>(null);
  /**
   * Klaim yang tautannya sedang diperlihatkan.
   *
   * Tautan, tombol WhatsApp, dan kodenya dulu digambar di dalam sel Status.
   * Sel itu lalu setinggi lima baris dan selebar alamat tautannya, dan satu
   * baris yang membengkak melebarkan seluruh tabel — sembilan kolom lain ikut
   * menanggung ruang yang hanya dibutuhkan satu sel.
   */
  const [lihatTautan, setLihatTautan] = useState<string | null>(null);

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

  /**
   * Kabar dari jendela pratinjau.
   *
   * Jendela itu menutup diri begitu kirimannya berhasil, dan kabarnya ikut
   * tertutup bersamanya. Layar ini yang menampungnya: daftarnya dimuat ulang
   * supaya kolom Status menunjukkan keadaan barunya, dan pemberitahuannya
   * muncul di sini.
   *
   * Asal pesannya diperiksa. Tanpa itu, halaman mana pun yang sempat membuka
   * layar ini dapat mengirim pesan serupa dan memunculkan pemberitahuan palsu.
   */
  useEffect(() => {
    const dengar = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const pesan = e.data as { dari?: string; terkirimKePajak?: number } | null;
      if (!pesan || pesan.dari !== "pratinjau-klaim") return;
      const n = Number(pesan.terkirimKePajak);
      if (!Number.isFinite(n) || n <= 0) return;
      setTerkirim(n);
      void muat();
    };
    window.addEventListener("message", dengar);
    return () => window.removeEventListener("message", dengar);
  }, [muat]);

  /**
   * Terbitkan tautan tanda tangan, lalu siapkan pesan WhatsApp-nya.
   *
   * Yang dibuka bukan WhatsApp-nya langsung: tautannya ditampilkan lebih dulu
   * supaya Admin Sales melihat ke nomor mana ia akan terkirim. Kodenya sengaja
   * tidak ikut ke dalam pesan — kode dan tautan pada satu pesan yang sama
   * membuat siapa pun yang meneruskan pesan itu ikut membawa keduanya.
   */
  const kirimTautan = async (c: any) => {
    setMengirim(c.id); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/claims/${c.id}/signature-requests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: "{}" });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(`${k.waGagal} — ${b.detail ?? b.title ?? res.status}`);
        return;
      }
      setTautan((lama) => ({ ...lama, [c.id]: b }));
      setLihatTautan(c.id);
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setMengirim(null); }
  };

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
      {kabar && <div className="banner ok">{kabar}</div>}

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

        <div className="tscroll persetujuan">
          <table className="tabel-penjualan"><tbody>
            <tr>
              <th className="sel-no">{k.thNo}</th>
              <th>{k.thTanggal}</th>
              <th>{k.thPerihal}</th>
              <th>{k.thKategori}</th>
              <th className="sel-penerima">{k.thPenerima}</th>
              <th>{k.thPengaju}</th>
              <th>{k.thBruto}</th>
              <th>{k.thPpn}</th>
              <th>{k.thPph}</th>
              <th>{k.thBersih}</th>
              <th className="sel-keadaan">{k.thStatus}</th>
              <th style={{ width: 140 }}>{k.thDokumen}</th>
            </tr>

            {terlihat.map((c, i) => (
              <tr key={c.id}>
                <td className="sel-no">{i + 1}</td>
                <td>
                  {tglPendek(c.created_at)}
                  {/* Nomor klaim dan unitnya tidak punya kolom sendiri lagi,
                      tetapi tidak dibuang: nomor itulah yang dipakai menyebut
                      klaim ini di seluruh layar lain, dan tanpa unitnya satu
                      penerima dengan dua klaim serupa tidak dapat dibedakan. */}
                  <span className="sisip">
                    {c.claim_number}
                    {c.unit?.code ? ` · ${c.unit.code}` : ""}
                  </span>
                </td>
                <td>{namaJenis(c.claim_type, bahasa)}</td>
                <td>{c.marketing?.marketing_type === "agent" ? k.katAgent
                     : c.marketing?.marketing_type === "inhouse" ? k.katInhouse
                     : "—"}</td>
                <td className="sel-penerima">{c.marketing?.full_name ?? "—"}</td>
                <td>{pengaju(c)}</td>
                <td className="n">{rp(c.gross_amount)}</td>
                <td className="n">{rp(c.vat)}</td>
                <td className="n">{rp(c.withholding_tax)}</td>
                <td className="n"><b>{rp(c.net_amount)}</b></td>
                <td className="sel-keadaan">
                  <span className={`pill ${SELESAI.includes(c.status) ? "ok"
                                   : DIAM.includes(c.status) ? "warn" : ""}`}>
                    {keadaan(c.status, bahasa)[0]}
                  </span>
                  <div className="menunggu">{keadaan(c.status, bahasa)[1]}</div>

                  {/* Pengiriman tautan ke Sales/Agent, di dalam kolom Status
                      dan hanya untuk Admin Sales — merekalah yang berhubungan
                      dengan Sales/Agent, dan endpoint-nya pun menolak peran
                      lain. Muncul hanya pada baris yang memang sedang menunggu
                      tautannya; pada baris lain kolom ini tetap keterangan
                      keadaan, bukan deretan tombol yang tak dapat ditekan. */}
                  {/* Tautan yang sudah terbit pada layar ini tetap dapat
                      dibuka, berapa pun statusnya sekarang — termasuk setelah
                      Sales/Agent membukanya dan klaimnya berpindah ke
                      "menunggu tanda tangan". Sebelumnya tombolnya ikut hilang
                      pada perpindahan itu: tautannya masih berlaku, masih
                      ditunggu tanda tangannya, tetapi tidak ada lagi yang
                      dapat memperlihatkannya — statusnya menggantung tanpa
                      satu pun jalan untuk menindaklanjuti.

                      Dibuka kembali, bukan diterbitkan ulang: menerbitkan
                      ulang menggugurkan tautan yang sudah ada di tangan
                      Sales/Agent. */}
                  {sesi.role === "admin_sales" &&
                   (MENUNGGU_TAUTAN.includes(c.status) || tautan[c.id]) && (
                    <div className="row" style={{ margin: "6px 0 0", gap: 6 }}>
                      {MENUNGGU_TAUTAN.includes(c.status) && (
                        c.marketing?.phone ? (
                          <button disabled={mengirim !== null}
                                  onClick={() => void kirimTautan(c)}>
                            {mengirim === c.id ? k.waMengirim
                              : c.status === "tax_verified" ? k.waKirim
                              : k.waUlang}
                          </button>
                        ) : (
                          <div className="menunggu"
                               style={{ color: "var(--stop)" }}>
                            {k.waTanpaHp}
                          </div>
                        )
                      )}
                      {tautan[c.id] && (
                        <button className="tautan"
                                onClick={() => setLihatTautan(c.id)}>
                          {k.waLihat}
                        </button>
                      )}
                    </div>
                  )}
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
                <td colSpan={12} style={{ color: "var(--mut)" }}>{k.kosong}</td>
              </tr>
            )}
            {busy && (
              <tr>
                <td colSpan={12} style={{ color: "var(--mut)" }}>{k.memuat}</td>
              </tr>
            )}
          </tbody></table>
        </div>
      </div>

      {/* Tautannya diperlihatkan di pop-up, bukan di dalam selnya: alamat
          tautan sepanjang tujuh puluh karakter di dalam sel tabel melebarkan
          kolomnya, dan kolom yang melebar mendorong sembilan kolom lainnya. */}
      {lihatTautan && tautan[lihatTautan] && (() => {
        const t = tautan[lihatTautan];
        const c = klaim.find((x) => x.id === lihatTautan);
        const alamat = `${window.location.origin}/sign/${t.token}`;
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget) setLihatTautan(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.waJudul} style={{ maxWidth: 420 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.waJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 10px" }}>
                <b>{c?.claim_number}</b> ·{" "}
                {c?.marketing?.full_name ?? "—"} ·{" "}
                {k.waTerbit(t.masked_phone)}
              </p>

              <div className="lbl">{k.waAlamat}</div>
              <div className="alamat-tautan">{alamat}</div>

              <div className="row" style={{ margin: "10px 0" }}>
                <a className="tombol-klaim kecil"
                   href={`https://wa.me/${nomorWa(c?.marketing?.phone)}` +
                         `?text=${encodeURIComponent(`${t.message}\n${alamat}`)}`}
                   target="_blank" rel="noreferrer">{k.waBukaWa}</a>
                <button onClick={() => {
                  navigator.clipboard?.writeText(alamat);
                  setKabar(k.waTersalin);
                }}>{k.waSalin}</button>
              </div>

              <div style={{ fontSize: 12.5 }}>
                {k.waKode} <b>{t.otp_demo}</b>
              </div>
              <p className="hint" style={{ textAlign: "left", margin: "4px 0 0" }}>
                {k.waKodeCatatan}
              </p>

              <button onClick={() => setLihatTautan(null)}>{k.waTutup}</button>
            </div>
          </div>
        );
      })()}

      {/* Pemberitahuan setelah jendela pratinjau menutup diri. Dibuat sebagai
          pop-up, bukan banner: jendela yang tiba-tiba hilang dari layar adalah
          perubahan besar, dan yang menekan "Kirim ke Pajak" perlu tahu bahwa
          hilangnya itu memang karena kirimannya berhasil. */}
      {terkirim !== null && (
        <div className="tirai"
             onMouseDown={(e) => {
               if (e.target === e.currentTarget) setTerkirim(null);
             }}>
          <div className="popup" role="dialog" aria-modal="true"
               aria-label={k.kabarJudul}>
            <h2 style={{ margin: "0 0 10px" }}>{k.kabarJudul}</h2>
            <p className="pengantar">{k.kabarIsi(terkirim)}</p>
            <button className="pri" onClick={() => setTerkirim(null)}>
              {k.kabarTutup}
            </button>
          </div>
        </div>
      )}
    </Kerangka>
  );
}
