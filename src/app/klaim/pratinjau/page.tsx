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
import { RekapOverriding } from "../rekap-overriding";
import type { Rekap } from "@/lib/overriding";
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
    cetak: "Cetak Form",
    cetakJudul: "Pilih yang akan dicetak",
    cetakForm: "Form Pengajuan",
    cetakSemua: "Pilih semua", cetakKosongkan: "Kosongkan",
    cetakLampiran: "Lampiran",
    cetakTakTersimpan: "isi tidak tersimpan — tidak dapat dicetak",
    cetakTakAda: "Klaim ini tidak punya lampiran yang berkasnya tersimpan.",
    cetakJalan: "Cetak",
    cetakBatal: "Batal",
    cetakCatatan:
      "Formulir dicetak dari layar ini; lampiran yang dicentang digabung " +
      "menjadi satu PDF dan dibuka di tab tersendiri untuk dicetak. Peramban " +
      "tidak dapat mencetak halaman dan berkas PDF dalam satu perintah.",
    cetakBelumAda: "Centang setidaknya satu yang akan dicetak.",
    mengirim: "Mengirim…",
    jumlah: (n: number) => `${n} formulir`,
    bukanAdmin:
      "Pengiriman ke tim pajak hanya dapat dilakukan Admin Sales. Formulir di " +
      "bawah dapat diperiksa, tetapi tidak dapat dikirim dari sini.",
    berkasGagal: "Berkas tidak dapat dibaca",
    terkirim: (n: number) =>
      `${n} klaim sudah dikirim ke tim pajak. Setelah diverifikasi, klaim ` +
      "kembali ke Pengajuan Fee untuk dikirimkan tautannya kepada Sales/Agent.",
    lampiranTombol: (n: number) => `Pratinjau lampiran (${n})`,
    lampiranKosong: "Belum ada lampiran pada klaim ini.",
    lampiranJudul: "Lampiran klaim",
    lampiranLihat: "Lihat", lampiranUnduh: "Unduh",
    lampiranTakTersimpan: "isi tidak tersimpan",
    lampiranTutup: "Tutup",
    selesaiFullSign: "Dokumen full sign",
    selesaiBukti: "Bukti transfer",
    selesaiTanggal: "Tanggal pembayaran",
  },
  en: {
    judul: "Submission form preview",
    memuat: "Loading forms…",
    galat: "The forms could not be opened",
    galatKirim: "Some claims could not be sent",
    kosong: "No forms were requested.",
    kirim: "Send to Tax",
    cetak: "Print the form",
    cetakJudul: "Choose what to print",
    cetakForm: "Submission form",
    cetakSemua: "Select all", cetakKosongkan: "Clear",
    cetakLampiran: "Attachments",
    cetakTakTersimpan: "contents not stored — cannot be printed",
    cetakTakAda: "This claim has no attachments with stored files.",
    cetakJalan: "Print",
    cetakBatal: "Cancel",
    cetakCatatan:
      "The form prints from this screen; the ticked attachments are merged " +
      "into one PDF and opened in their own tab to print. A browser cannot " +
      "print a page and a PDF file in one command.",
    cetakBelumAda: "Tick at least one thing to print.",
    mengirim: "Sending…",
    jumlah: (n: number) => `${n} forms`,
    bukanAdmin:
      "Only the Sales Admin can send claims to the tax team. The forms below " +
      "can be reviewed, but not sent from here.",
    berkasGagal: "The file could not be read",
    terkirim: (n: number) =>
      `${n} claims sent to the tax team. Once verified, they return to Fee ` +
      "Submission so the link can be sent to the Sales/Agent.",
    lampiranTombol: (n: number) => `Preview attachments (${n})`,
    lampiranKosong: "No attachments on this claim yet.",
    lampiranJudul: "Claim attachments",
    lampiranLihat: "View", lampiranUnduh: "Download",
    lampiranTakTersimpan: "contents not stored",
    lampiranTutup: "Close",
    selesaiFullSign: "Fully signed document",
    selesaiBukti: "Transfer proof",
    selesaiTanggal: "Payment date",
  },
};

/**
 * Kabari jendela yang membuka pratinjau ini, lalu jendela ini menutup diri.
 *
 * Setelah "Kirim ke Pajak" tidak ada lagi yang dapat dikerjakan di sini:
 * formulirnya sudah berjalan, dan yang tertinggal hanyalah jendela berisi
 * dokumen yang tidak lagi dapat diubah. Yang perlu tahu bahwa kirimannya
 * berhasil adalah layar Approval / Persetujuan di baliknya — layar itu yang
 * memuat ulang daftarnya dan memunculkan pemberitahuannya.
 *
 * Mengembalikan false bila pembukanya tidak ada (pratinjau dibuka langsung
 * lewat alamatnya). Jendela itu tidak ditutup: menutupnya berarti kabar
 * berhasilnya hilang tanpa pernah terbaca siapa pun.
 */
/** Isi berkas sebagai data URL, bentuk yang diterima /api/claims/:id/documents. */
function keBase64(berkas: File): Promise<string> {
  return new Promise((selesai, gagal) => {
    const baca = new FileReader();
    baca.onload = () => selesai(String(baca.result ?? ""));
    baca.onerror = () => gagal(baca.error ?? new Error("gagal membaca berkas"));
    baca.readAsDataURL(berkas);
  });
}

function kabarkanPembuka(jumlah: number): boolean {
  try {
    const pembuka = window.opener as Window | null;
    if (!pembuka || pembuka.closed) return false;
    pembuka.postMessage(
      { dari: "pratinjau-klaim", terkirimKePajak: jumlah },
      window.location.origin,
    );
    return true;
  } catch {
    // Pembuka dari asal lain — tidak dapat dijangkau, dan tidak perlu.
    return false;
  }
}

/**
 * Keadaan sesudah tanda tangan Sales/Agent diterima.
 *
 * Pada keadaan ini jendela ini bukan lagi langkah pengiriman: klaimnya sudah
 * berjalan, dan yang dikerjakan Admin Sales adalah memeriksa ulang lalu
 * mencetak formulirnya untuk diedarkan dan ditandatangani di atas kertas.
 * "Kirim ke Pajak" di situ menawarkan pekerjaan yang sudah selesai dikerjakan.
 */
/** Tanggal ISO menjadi bentuk yang dibaca orang: 23/09/2026. */
function tglPanjang(iso: string) {
  const [t, b, h] = String(iso).slice(0, 10).split("-");
  return h && b && t ? `${h}/${b}/${t}` : String(iso);
}

/**
 * Lampiran yang menandai sebuah klaim selesai, menurut kode checklist-nya.
 *
 * Kodenya ditulis endpoint yang menyimpannya — full-sign dan pembayaran —
 * bukan ditebak dari nama berkasnya, yang dipilih orang yang mengunggah.
 */
const ITEM_PENTING = ["dokumen_full_sign", "bukti_transfer"];

const SESUDAH_TTD = [
  "signed", "crosscheck_in_progress", "ready_to_print", "printed",
  "circulating_head_finance", "circulating_management", "awaiting_scan_upload",
  "approved", "awaiting_settlement_date", "partially_paid", "paid", "completed",
];

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
  /** Berkas yang dilampirkan, berkunci sama dengan centangnya. */
  const [berkas, setBerkas] = useState<Record<string, File>>({});
  /**
   * Dokumen full sign dan bukti transfernya, masing-masing dengan sebutan
   * yang dibaca orang — bukan kode checklist-nya.
   */
  const dokPenting = (c: any): [string, any][] =>
    ITEM_PENTING.flatMap((item) => {
      const d = (c?.documents ?? []).find((x: any) => x.checklist_item === item);
      if (!d) return [];
      return [[item === "dokumen_full_sign" ? k.selesaiFullSign : k.selesaiBukti,
               d] as [string, any]];
    });

  /** Dialog cetak: klaim yang sedang disiapkan cetakannya. */
  const [siapCetakDialog, setSiapCetakDialog] = useState<string | null>(null);
  /** Pilihan dalam dialog cetak: formulirnya, dan lampiran mana saja. */
  const [cetakForm, setCetakForm] = useState(true);
  const [cetakDok, setCetakDok] = useState<Record<string, boolean>>({});

  /**
   * Klaim yang daftar lampirannya sedang dibuka.
   *
   * Daftarnya dulu digambar sebagai blok LAMPIRAN di dalam formulir. Formulir
   * itu salinan dari cetakan yang dipakai kantor, dan cetakan itu tidak punya
   * blok lampiran — sepuluh baris berisi nama berkas yang sama menumpang di
   * dokumen yang akan ditandatangani, lalu ikut tercetak bersamanya.
   */
  const [lihatLampiran, setLihatLampiran] = useState<string | null>(null);
  /**
   * Rekap Overriding per klaim Overriding yang terbuka.
   *
   * Overriding tidak punya lembar per unit — dokumennya satu tabel per
   * periode untuk satu Sales Manager. Rekapnya diambil terpisah karena ia
   * membaca seluruh unit milik orang itu, bukan hanya unit klaim ini, dan
   * membawanya serta pada setiap pemuatan daftar klaim berarti mengangkut
   * tabel itu untuk klaim jenis lain yang tidak memerlukannya.
   */
  const [rekap, setRekap] = useState<Record<string, Rekap>>({});

  /** Hanya Admin Sales yang mengirim klaim ke tim pajak — lihat /api/.../submit. */
  const bolehKirim = sesi?.role === "admin_sales";

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

  // Rekap Overriding menyusul setelah klaimnya terbaca. Gagalnya tidak
  // menghentikan layar: yang hilang hanya tabelnya, dan formulir jenis lain
  // di jendela yang sama tetap tercetak.
  useEffect(() => {
    for (const c of klaim) {
      if (c.claim_type !== "overriding" || rekap[c.id]) continue;
      void (async () => {
        try {
          const r = await fetch(`/api/claims/${c.id}/rekap-overriding`);
          if (!r.ok) return;
          const b = await r.json();
          setRekap((lama) => ({ ...lama, [c.id]: b }));
        } catch { /* biar — lihat alasannya di atas */ }
      })();
    }
  }, [klaim, rekap]);

  /** Dokumen yang wajib dicentang untuk satu klaim. */
  const wajib = (c: any): string[] => DOKUMEN[c.claim_type as Jenis] ?? [];

  /** Klaim yang masih berupa draft — checklist dokumennya diisi di sini. */
  const masihDraft = klaim.filter((c) => c.status === "draft");

  /**
   * Klaim yang belum sampai ke tim pajak.
   *
   * Termasuk yang sudah diajukan tetapi belum diteruskan. "Kirim ke Pajak"
   * dua langkah; bila yang kedua gagal — jaringan putus, jendela tertutup —
   * klaimnya berhenti di "menunggu diteruskan ke Pajak", dan sebelumnya
   * tombolnya tidak muncul lagi untuk klaim itu sama sekali. Satu-satunya
   * tempat penerusan itu dapat dilakukan adalah layar konsol, yang butir
   * menunya sudah dibuang — jadi klaimnya benar-benar buntu.
   */
  const belumKePajak = klaim.filter(
    (c) => c.status === "draft" || c.status === "pending_admin_review");

  /** Ada klaim yang sudah lewat tanda tangan — formulirnya siap dicetak. */
  const siapCetak = klaim.some((c) => SESUDAH_TTD.includes(c.status));

  /**
   * Checklist dokumennya sudah lengkap untuk yang akan dikirim.
   *
   * Yang dinilai hanya draft: klaim yang sudah diajukan melewati pemeriksaan
   * checklist itu saat diajukan, dan dokumennya sudah tercatat. Tanpa satu pun
   * draft di jendela ini — hanya yang tersangkut di "menunggu diteruskan" —
   * tidak ada yang perlu dicentang, dan tombolnya harus tetap dapat ditekan.
   */
  const lengkap = belumKePajak.length > 0 &&
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
      for (const c of belumKePajak) {
        try {
          const daftar = wajib(c);
          for (let i = 0; i < daftar.length; i++) {
            if (!ceklis[`${c.id}:${daftar[i]}`]) continue;
            // Satu baris checklist dapat mewakili beberapa kode dokumen —
            // lihat DOKUMEN_KODE. Yang dicatat adalah kodenya, karena itulah
            // yang ditagih server saat klaimnya diajukan.
            const kode = DOKUMEN_KODE[c.claim_type as Jenis]?.[i] ?? [daftar[i]];
            const lampir = berkas[`${c.id}:${daftar[i]}`];
            // Berkasnya menempel pada kode pertama baris itu. Satu baris
            // checklist dapat mewakili tiga kode sekaligus; mengirim berkas
            // yang sama tiga kali berarti tiga salinan isi yang sama di basis
            // data, dan tiga baris lampiran untuk satu berkas.
            for (let j = 0; j < kode.length; j++) {
              const muatan: Record<string, string> = { checklist_item: kode[j] };
              if (lampir && j === 0) {
                muatan.file_name = lampir.name;
                muatan.content_type = lampir.type || "application/octet-stream";
                muatan.content_base64 = await keBase64(lampir);
              }
              const r = await fetch(`/api/claims/${c.id}/documents`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(muatan),
              });
              if (r.status === 401) { location.href = "/login"; return; }
              if (!r.ok) {
                const b = await r.json().catch(() => ({}));
                throw new Error(b.detail ?? b.title ?? `HTTP ${r.status}`);
              }
            }
          }
          // "Kirim ke Pajak" dua langkah: ajukan, lalu teruskan. Yang sudah
          // melewati langkah pertama tidak mengulanginya — /submit hanya
          // menerima klaim berstatus draft, dan mengulangnya atas klaim yang
          // sudah diajukan berakhir dengan "perpindahan tidak diizinkan".
          //
          // Keadaan itu nyata: langkah pertama berhasil lalu yang kedua gagal
          // — jaringan putus, jendela tertutup — dan klaimnya berhenti di
          // "menunggu diteruskan ke Pajak". Tanpa perkecualian ini, menekan
          // tombolnya lagi selalu gagal pada langkah yang sudah selesai, dan
          // klaim itu tidak punya jalan lain ke tim pajak sama sekali.
          if (c.status !== "pending_admin_review") {
            const s1 = await fetch(`/api/claims/${c.id}/submit`, { method: "POST" });
            const b1 = await s1.json().catch(() => ({}));
            if (!s1.ok) throw new Error(b1.detail ?? b1.title ?? `HTTP ${s1.status}`);
          }

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
      // Seluruhnya berhasil: jendela ini selesai. Bila ada yang gagal ia tetap
      // terbuka — daftar yang gagal ada di sini, dan hanya di sini.
      if (berhasil && !gagal.length && kabarkanPembuka(berhasil)) window.close();
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
        {/* Satu tombol saja, dan tombolnya mengikuti keadaan klaimnya.
            Selama masih draft, yang dikerjakan di jendela ini adalah
            mengirimnya ke tim pajak. Sesudah tanda tangan Sales/Agent diterima
            dan klaimnya kembali ke Admin Sales untuk pemeriksaan ulang, yang
            dikerjakan adalah mencetak formulirnya — jadi itulah yang ditawarkan
            tombolnya.

            Tanpa tombol tutup di sebelahnya: tombol tutup mengundang jendela
            ditutup sebelum klaimnya berjalan ke mana pun. */}
        {bolehKirim && belumKePajak.length > 0 && (
          <button className="pri" disabled={!lengkap || kirim}
                  onClick={() => void kirimKePajak()}>
            {kirim ? k.mengirim : k.kirim}
          </button>
        )}
        {bolehKirim && !belumKePajak.length && siapCetak && (
          <button className="pri" onClick={() => {
            // Satu klaim per jendela pratinjau pada alur cetak; yang pertama
            // sudah lewat tanda tangan itulah yang disiapkan cetakannya.
            const c = klaim.find((x) => SESUDAH_TTD.includes(x.status));
            if (!c) return;
            setCetakForm(true);
            setCetakDok(Object.fromEntries((c.documents ?? [])
              .filter((d: any) => d.has_content)
              .map((d: any) => [d.id, true])));
            setSiapCetakDialog(c.id);
          }}>
            {k.cetak}
          </button>
        )}
      </div>

      {galat && <div className="banner stop"><b>{k.galat}</b>{galat}</div>}
      {kabar && <div className="banner ok">{kabar}</div>}
      {busy && <p className="hint">{k.memuat}</p>}
      {!busy && !galat && !klaim.length && <p className="hint">{k.kosong}</p>}

      {klaim.length > 0 && !bolehKirim && (
        <div className="banner warn jangan-cetak">{k.bukanAdmin}</div>
      )}

      {klaim.map((c) => (
        <div key={c.id} className="panel sp lembar">
          {/* Overriding dicetak sebagai Detail Perhitungan per periode, bukan
              sebagai lembar per unit — lihat @/lib/overriding. Selama rekapnya
              belum terbaca, yang tampil keterangan singkat, bukan formulir
              jenis lain yang kebetulan lebih dulu ada. */}
          {c.claim_type === "overriding" ? (
            rekap[c.id]
              ? <RekapOverriding rekap={rekap[c.id]} />
              : <p className="hint">{k.memuat}</p>
          ) : (
          <FormPengajuan
            klaim={c}
            ceklis={c.status === "draft" && bolehKirim
              ? Object.fromEntries(wajib(c).map(
                  (d) => [d, Boolean(ceklis[`${c.id}:${d}`])]))
              : undefined}
            onCeklis={c.status === "draft" && bolehKirim
              ? (item, dicentang) => setCeklis((lama) => (
                  { ...lama, [`${c.id}:${item}`]: dicentang }))
              : undefined}
            berkas={Object.fromEntries(wajib(c).map(
              (d) => [d, berkas[`${c.id}:${d}`]?.name ?? ""]))}
            onBerkas={c.status === "draft" && bolehKirim
              ? (item, pilihan) => {
                  setBerkas((lama) => {
                    const baru = { ...lama };
                    if (pilihan) baru[`${c.id}:${item}`] = pilihan;
                    else delete baru[`${c.id}:${item}`];
                    return baru;
                  });
                  // Memilih berkas berarti berkasnya ada di tangan — centangnya
                  // ikut, supaya tidak ada berkas terlampir pada baris yang
                  // justru tidak ikut terkirim.
                  if (pilihan) {
                    setCeklis((lama) => (
                      { ...lama, [`${c.id}:${item}`]: true }));
                  }
                }
              : undefined} />
          )}

          {/* Dokumen full sign, bukti transfer, dan tanggal uang keluar:
              tiga hal yang dicari orang ketika menengok klaim yang sudah
              selesai. Berdiri langsung di layar ini, bukan hanya di dalam
              daftar lampiran — yang menekan "Tinjau Dokumen" menekan satu
              tombol untuk melihat ketiganya, dan menyembunyikannya di balik
              tombol kedua berarti ia harus tahu lebih dulu bahwa ketiganya
              ada di sana.

              Hanya muncul bila memang sudah ada isinya; pada klaim yang masih
              berjalan, bloknya tidak menempati layar sama sekali. */}
          {(dokPenting(c).length > 0 || c.tanggal_bayar) && (
            <div className="ringkas-selesai jangan-cetak"
                 style={{ margin: "10px 0 0" }}>
              {dokPenting(c).map(([sebutan, d]: any) => (
                <div className="baris" key={d.id}>
                  <span className="lbl">{sebutan}</span>
                  {d.has_content ? (
                    <span className="meta">
                      <a href={`/api/claims/${c.id}/documents/${d.id}?pratinjau=1`}
                         target="_blank" rel="noreferrer">
                        {k.lampiranLihat}
                      </a>
                      <a className="unduh"
                         href={`/api/claims/${c.id}/documents/${d.id}`}>
                        {k.lampiranUnduh}
                      </a>
                    </span>
                  ) : (
                    <span className="meta">{k.lampiranTakTersimpan}</span>
                  )}
                </div>
              ))}
              {c.tanggal_bayar && (
                <div className="baris">
                  <span className="lbl">{k.selesaiTanggal}</span>
                  <span className="nilai">
                    {tglPanjang(c.tanggal_bayar)}
                    {c.rujukan_bayar ? ` · ${c.rujukan_bayar}` : ""}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Lampiran selengkapnya diperiksa dari sini, di luar formulirnya,
              lewat tombol yang tidak ikut tercetak. */}
          <div className="row jangan-cetak" style={{ margin: "10px 0 0" }}>
            <button onClick={() => setLihatLampiran(c.id)}>
              {k.lampiranTombol(
                (c.documents ?? []).filter((d: any) => d.file_name).length)}
            </button>
          </div>
        </div>
      ))}

      {/* Dialog cetak. Yang dicetak dipilih lebih dulu — formulirnya, dan
          lampiran mana saja — supaya sekali cetak dapat menghasilkan berkas
          lengkap, bukan formulir saja yang lalu disusul delapan kali cetak
          lampiran satu per satu. */}
      {siapCetakDialog && (() => {
        const c = klaim.find((x) => x.id === siapCetakDialog);
        const daftar = (c?.documents ?? []).filter((d: any) => d.file_name);
        const terpilih = Object.entries(cetakDok)
          .filter(([, v]) => v).map(([id]) => id);
        const adaPilihan = cetakForm || terpilih.length > 0;
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget) setSiapCetakDialog(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.cetakJudul} style={{ maxWidth: 520 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.cetakJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 10px" }}>
                <b>{c?.claim_number}</b>
              </p>

              <ul className="pilih-cetak">
                <li>
                  <label className="ceklis-pilih">
                    <input type="checkbox" checked={cetakForm}
                           onChange={(e) => setCetakForm(e.target.checked)} />
                    <span><b>{k.cetakForm}</b></span>
                  </label>
                </li>
              </ul>

              <div className="lbl" style={{ marginTop: 10 }}>
                {k.cetakLampiran}
              </div>
              {daftar.length ? (
                <>
                  {/* Dua pilihan bulat, bukan dua tautan bergaris bawah.
                      Tautan di atas daftar centang terbaca sebagai "menuju ke
                      suatu tempat"; bulatan yang salah satunya terisi
                      menyatakan keadaan daftarnya sekarang — seluruhnya
                      tercentang, atau tidak satu pun. */}
                  {(() => {
                    const punyaIsi = daftar.filter((d: any) => d.has_content);
                    const dicentang = punyaIsi
                      .filter((d: any) => cetakDok[d.id]).length;
                    return (
                      <ul className="pilih-cetak ringkas">
                        <li>
                          <label className="ceklis-pilih">
                            <input type="radio" name="cetak-lampiran"
                                   checked={punyaIsi.length > 0 &&
                                            dicentang === punyaIsi.length}
                                   onChange={() => setCetakDok(
                                     Object.fromEntries(punyaIsi
                                       .map((d: any) => [d.id, true])))} />
                            <span>{k.cetakSemua}</span>
                          </label>
                        </li>
                        <li>
                          <label className="ceklis-pilih">
                            <input type="radio" name="cetak-lampiran"
                                   checked={dicentang === 0}
                                   onChange={() => setCetakDok({})} />
                            <span>{k.cetakKosongkan}</span>
                          </label>
                        </li>
                      </ul>
                    );
                  })()}
                  <ul className="pilih-cetak" style={{ marginTop: 6 }}>
                    {daftar.map((d: any) => (
                      <li key={d.id}>
                        <label className="ceklis-pilih">
                          <input type="checkbox" disabled={!d.has_content}
                                 checked={Boolean(cetakDok[d.id])}
                                 onChange={(e) => setCetakDok((lama) => (
                                   { ...lama, [d.id]: e.target.checked }))} />
                          <span>
                            {d.file_name}
                            <span className="meta"> · {d.checklist_item}</span>
                            {!d.has_content && (
                              <><br /><span className="meta">
                                {k.cetakTakTersimpan}
                              </span></>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="hint" style={{ textAlign: "left" }}>
                  {k.cetakTakAda}
                </p>
              )}

              <p className="hint" style={{ textAlign: "left", margin: "10px 0 0" }}>
                {adaPilihan ? k.cetakCatatan : k.cetakBelumAda}
              </p>

              <button className="pri" disabled={!adaPilihan}
                      onClick={() => {
                        setSiapCetakDialog(null);
                        // Lampirannya lebih dulu: jendela barunya dibuka
                        // langsung dari tekanan tombol ini, sementara
                        // window.print() menahan jalannya halaman sampai
                        // dialog cetak peramban ditutup.
                        if (terpilih.length) {
                          // Bukan PDF-nya langsung: yang dibuka adalah halaman
                          // yang membungkusnya dan meminta dialog cetaknya
                          // muncul sendiri. PDF yang dibuka apa adanya berhenti
                          // sebagai tab yang menunggu Ctrl+P tanpa mengatakannya.
                          window.open(
                            `/klaim/lampiran?klaim=${c!.id}` +
                            `&ids=${terpilih.join(",")}`, "_blank");
                        }
                        if (cetakForm) setTimeout(() => window.print(), 200);
                      }}>
                {k.cetakJalan}
              </button>
              <button onClick={() => setSiapCetakDialog(null)}>
                {k.cetakBatal}
              </button>
            </div>
          </div>
        );
      })()}

      {lihatLampiran && (() => {
        const c = klaim.find((x) => x.id === lihatLampiran);
        const daftar = (c?.documents ?? []).filter((d: any) => d.file_name);
        return (
          <div className="tirai"
               onMouseDown={(e) => {
                 if (e.target === e.currentTarget) setLihatLampiran(null);
               }}>
            <div className="popup" role="dialog" aria-modal="true"
                 aria-label={k.lampiranJudul} style={{ maxWidth: 520 }}>
              <h2 style={{ margin: "0 0 4px" }}>{k.lampiranJudul}</h2>
              <p className="pengantar" style={{ margin: "0 0 10px" }}>
                <b>{c?.claim_number}</b>
              </p>

              {/* Dokumen yang sudah lengkap tanda tangannya, bukti transfernya,
                  dan tanggal uang keluar: tiga hal yang dicari orang ketika
                  menengok sebuah klaim yang sudah selesai. Ketiganya dulu
                  tenggelam di antara lampiran lain, berjudul nama berkas dan
                  kode checklist-nya — tidak ada yang menyebut mana yang
                  dokumen finalnya dan mana pindaian biasa. */}
              {(dokPenting(c).length > 0 || c?.tanggal_bayar) && (
                <div className="ringkas-selesai">
                  {dokPenting(c).map(([sebutan, d]: any) => (
                    <div className="baris" key={d.id}>
                      <span className="lbl">{sebutan}</span>
                      {d.has_content ? (
                        <span className="meta">
                          <a href={`/api/claims/${c.id}/documents/${d.id}?pratinjau=1`}
                             target="_blank" rel="noreferrer">
                            {k.lampiranLihat}
                          </a>
                          <a className="unduh"
                             href={`/api/claims/${c.id}/documents/${d.id}`}>
                            {k.lampiranUnduh}
                          </a>
                        </span>
                      ) : (
                        <span className="meta">{k.lampiranTakTersimpan}</span>
                      )}
                    </div>
                  ))}
                  {c?.tanggal_bayar && (
                    <div className="baris">
                      <span className="lbl">{k.selesaiTanggal}</span>
                      <span className="nilai">
                        {tglPanjang(c.tanggal_bayar)}
                        {c.rujukan_bayar ? ` · ${c.rujukan_bayar}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {daftar.length ? (
                <ul className="lampiran">
                  {daftar.map((d: any) => (
                    <li key={d.id}>
                      <span>
                        {d.file_name}
                        {d.size_bytes
                          ? ` · ${Math.max(1, Math.round(d.size_bytes / 1024))} KB`
                          : ""}
                        <br />
                        <span className="meta">{d.checklist_item}</span>
                      </span>
                      {/* Yang isinya tersimpan dapat dibuka; yang hanya berupa
                          catatan nama ditulis apa adanya, tanpa tautan yang
                          akan berakhir pada galat. */}
                      <span className="meta">
                        {d.has_content ? (
                          <>
                            <a href={`/api/claims/${c.id}/documents/${d.id}?pratinjau=1`}
                               target="_blank" rel="noreferrer">
                              {k.lampiranLihat}
                            </a>
                            <a className="unduh"
                               href={`/api/claims/${c.id}/documents/${d.id}`}>
                              {k.lampiranUnduh}
                            </a>
                          </>
                        ) : k.lampiranTakTersimpan}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint" style={{ textAlign: "left" }}>
                  {k.lampiranKosong}
                </p>
              )}

              <button onClick={() => setLihatLampiran(null)}>
                {k.lampiranTutup}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
