"use client";

/**
 * Referensi Pengajuan — memo yang menjadi dasar pengajuan fee.
 *
 * Satu layar, dua bagian. Di atas kotak seret-dan-lepas yang menerima
 * beberapa berkas memo sekaligus; tiap berkas dibaca sendiri — teksnya bila
 * ada, OCR bila pindaian — lalu tersimpan sebagai memo beserta rincian
 * tabel skemanya. Di bawahnya seluruh baris rincian itu berdiri sebagai satu
 * rekapitulasi: nomor memo, tanggal, perihal, periode program, skema,
 * kategori, nilai komisi, keterangan.
 *
 * Baris hasil bacaan berhenti sebagai USULAN. OCR salah baca satu digit tanpa
 * memberi tanda apa pun, dan angka pada kolom ini menentukan berapa uang
 * keluar — jadi ia baru menjadi acuan setelah ada orang yang memeriksanya dan
 * menekan "Berlakukan". Di sanalah barisnya diterjemahkan menjadi skema
 * insentif, jalur yang sudah dipakai seluruh perhitungan.
 *
 * Yang menolak pengajuan bukan layar ini melainkan kuncinya — setelan
 * `skema_wajib`. Selama menyala, klaim tanpa skema yang berlaku pada tanggal
 * kontraknya tidak dapat dihitung sama sekali. Kuncinya dibuka dan ditutup
 * Admin IT, untuk keadaan yang memang tidak dapat menunggu memonya.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../../bahasa";
import { bedahSkema, type BarisSkema } from "@/lib/memo-skema";
import { KATEGORI_JENIS, namaKategori } from "@/lib/kategori";
import { bacaPindaian, kataTeksPdf, type Kemajuan } from "../../memo/ocr";
import { pasangBerkas, periksaUkuran, perluDipecah, titipBerkas }
  from "../../memo/kirim";
import { Kerangka, MemeriksaSesi } from "../../kerangka";
import { useSesi } from "../../session";
import { namaJenis } from "../jenis";

const JENIS = ["closing_fee", "commission", "cash_reward",
               "continuity_reward", "overriding"] as const;

const KATA = {
  id: {
    judul: "Referensi Pengajuan",
    pengantar:
      "Memo Yang Menjadi Dasar Pengajuan Fee. Baris Yang Sudah Diberlakukan " +
      "Menjadi Acuan Nilai; Yang Belum, Belum Mengikat Apa Pun.",
    galat: "Tidak dapat dikerjakan",
    unggahJudul: "UNGGAH MEMO",
    seret: "Seret berkas memo ke sini",
    seretLagi: "atau pilih dari komputer — boleh beberapa sekaligus",
    pilih: "Pilih berkas",
    jenisBerkas: "PDF, gambar, Excel, atau Word — maksimal 10 MB per berkas",
    membaca: (n: string) => `Membaca ${n}…`,
    ocrSiap: "Menyiapkan pembaca tulisan…",
    ocrGambar: (h: number, d: number) => `Menggambar halaman ${h} dari ${d}…`,
    ocrBaca: (p: number) => `Membaca tulisan… ${p}%`,
    menitip: (p: number) => `Mengirim berkas… ${p}%`,
    menyimpan: (n: string) => `Menyimpan ${n}…`,
    selesai: (n: number, b: number) =>
      `${n} memo tersimpan, ${b} baris skema terbaca.`,
    sebagian: (n: number, g: number) =>
      `${n} memo tersimpan, ${g} berkas gagal.`,
    takAdaBaris:
      "Berkasnya tersimpan, tetapi tabel skemanya tidak terbaca. Buka Memo " +
      "Approval untuk memeriksa dan membetulkannya.",

    tabel: "Ringkasan Memo",
    kNo: "No.", kNoMemo: "No. Memo", kTanggal: "Tanggal", kPerihal: "Perihal",
    kPeriode: "Periode Program", kSkema: "Skema", kKategori: "Kategori",
    kNilai: "Nilai Komisi", kKeterangan: "Keterangan",
    kKeadaan: "Keadaan", kTindakan: "Tindakan",
    usulan: "Usulan", berlaku: "Berlaku",
    kosong: "Belum ada memo pada project ini. Unggah memonya di atas.",
    memuat: "Memuat…",
    berlakukan: "Berlakukan", cabut: "Nonaktifkan",
    pBerlaku: (n: number) => `✓ ${n} baris berlaku`,
    pUsulan: (n: number) => `⏳ ${n} baris usulan`,

    kunciJudul: "Kunci pengajuan fee",
    kunciOn:
      "Menyala. Pengajuan fee yang tidak dinaungi memo berlaku pada tanggal " +
      "kontraknya tidak dapat dijalankan.",
    kunciOff:
      "Longgar. Pengajuan tetap dapat dijalankan memakai skema terdekat " +
      "walau memonya belum berlaku, dan klaimnya ditandai pada jejak audit.",
    kunciAdmin:
      "Kunci ini hanya dapat diubah oleh Admin IT. Memberlakukan memo " +
      "pada tabel di bawah tetap dapat dilakukan oleh Admin Sales.",
    kunciNyalakan: "Kunci", kunciLonggarkan: "Longgarkan",
    kunciBerubah: (on: boolean): string =>
      on ? "Kunci dinyalakan." : "Kunci dilonggarkan.",

    dJudul: "Berlakukan baris rujukan",
    dPengantar:
      "Periksa angkanya terhadap memo aslinya sebelum diberlakukan. Yang " +
      "ditulis di sini yang dipakai menghitung, bukan hasil bacaan mesin.",
    dBaris: "Baris memo", dJenis: "Jenis fee", dKategori: "Kategori penerima",
    dCara: "Cara hitung", dPersen: "Persentase (%)",
    dNominal: "Nominal tetap (Rp)", dBersih: "Nominal ini nilai bersih",
    dDasar: "Dasar perhitungan",
    dInclude: "Nilai kontrak (include PPN)",
    dExclude: "Nilai kontrak (exclude PPN)",
    dDari: "Berlaku dari", dSampai: "Berlaku sampai",
    dPersenPilih: "Persentase", dNominalPilih: "Nominal tetap",
    dSimpan: "Berlakukan", dBatal: "Batal",
    dTanggalWajib: "Berlaku dari harus diisi.",
    berlakuKabar: "Baris diberlakukan sebagai skema insentif.",
    cabutKabar: "Baris dinonaktifkan; kembali menjadi usulan.",
    cabutTanya: "Nonaktifkan pemberlakuan baris ini?",
  },
  en: {
    judul: "Submission Reference",
    pengantar:
      "The memos fee submissions rest on. Rows already in force set the " +
      "rates; rows not yet in force bind nothing.",
    galat: "This could not be done",
    unggahJudul: "UPLOAD MEMOS",
    seret: "Drag memo files here",
    seretLagi: "or pick them from your computer — several at once is fine",
    pilih: "Choose files",
    jenisBerkas: "PDF, image, Excel or Word — 10 MB per file at most",
    membaca: (n: string) => `Reading ${n}…`,
    ocrSiap: "Preparing the text reader…",
    ocrGambar: (h: number, d: number) => `Rendering page ${h} of ${d}…`,
    ocrBaca: (p: number) => `Reading text… ${p}%`,
    menitip: (p: number) => `Uploading… ${p}%`,
    menyimpan: (n: string) => `Saving ${n}…`,
    selesai: (n: number, b: number) =>
      `${n} memos saved, ${b} scheme rows read.`,
    sebagian: (n: number, g: number) => `${n} memos saved, ${g} files failed.`,
    takAdaBaris:
      "The file was saved, but its scheme table could not be read. Open Memo " +
      "Approval to check and correct it.",

    tabel: "Memo Summary",
    kNo: "No.", kNoMemo: "Memo no.", kTanggal: "Date", kPerihal: "Subject",
    kPeriode: "Programme period", kSkema: "Scheme", kKategori: "Category",
    kNilai: "Commission value", kKeterangan: "Remarks",
    kKeadaan: "State", kTindakan: "Action",
    usulan: "Proposed", berlaku: "In force",
    kosong: "No memos on this project yet. Upload them above.",
    memuat: "Loading…",
    berlakukan: "Put in force", cabut: "Deactivate",
    pBerlaku: (n: number) => `✓ ${n} rows in force`,
    pUsulan: (n: number) => `⏳ ${n} proposed rows`,

    kunciJudul: "Fee submission lock",
    kunciOn:
      "On. A fee submission not covered by a memo in force on its contract " +
      "date cannot be run.",
    kunciOff:
      "Loose. Submissions still run on the nearest scheme even when no memo " +
      "is in force, and the claim is flagged in the audit trail.",
    kunciAdmin:
      "Only IT Admin can change this lock. Putting a memo in force in " +
      "the table below remains open to Sales Admin.",
    kunciNyalakan: "Lock", kunciLonggarkan: "Loosen",
    kunciBerubah: (on: boolean): string =>
      on ? "Lock turned on." : "Lock loosened.",

    dJudul: "Put a reference row in force",
    dPengantar:
      "Check the figures against the memo itself first. What is typed here " +
      "is what the calculation uses — not what the machine read.",
    dBaris: "Memo row", dJenis: "Fee type", dKategori: "Recipient category",
    dCara: "How it is computed", dPersen: "Percentage (%)",
    dNominal: "Flat amount (Rp)", dBersih: "This amount is the net figure",
    dDasar: "Calculation basis",
    dInclude: "Contract value (incl. VAT)",
    dExclude: "Contract value (excl. VAT)",
    dDari: "In force from", dSampai: "In force until",
    dPersenPilih: "Percentage", dNominalPilih: "Flat amount",
    dSimpan: "Put in force", dBatal: "Cancel",
    dTanggalWajib: "\"In force from\" is required.",
    berlakuKabar: "The row is now an incentive scheme.",
    cabutKabar: "Withdrawn; the row is a proposal again.",
    cabutTanya: "Withdraw this row from force?",
  },
};

type Baris = {
  id: string; memo_id: string;
  no_memo: string | null; tanggal: string | null; perihal: string | null;
  periode_awal: string | null; periode_akhir: string | null;
  skema: string; kategori: string | null; nilai: string | null;
  keterangan: string | null;
  scheme_id: string | null;
  diberlakukan_oleh: string | null; diberlakukan_pada: string | null;
  claim_type: string | null; recipient_role: string | null;
  percentage: string | null; flat_amount: string | null;
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
               "Agustus", "September", "Oktober", "November", "Desember"];

const tglPanjang = (v?: string | null) => {
  if (!v) return "—";
  const [th, bl, hr] = v.slice(0, 10).split("-").map(Number);
  if (!th || !bl || !hr) return v.slice(0, 10);
  return `${hr} ${BULAN[bl - 1] ?? bl} ${th}`;
};

/** "1 Jan 2026 – 31 Mar 2026", atau tanda pisah bila keduanya kosong. */
const periode = (a?: string | null, b?: string | null) =>
  !a && !b ? "—" : `${tglPanjang(a)} – ${b ? tglPanjang(b) : "seterusnya"}`;

/** Persen dari pecahan desimal tersimpan: "0.025" menjadi "2,5%". */
const persenTampil = (v?: string | null) => {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `${(n * 100).toLocaleString("id-ID", { maximumFractionDigits: 4 })}%`;
};

const rupiah = (v?: string | null) => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? `Rp ${n.toLocaleString("id-ID")}` : null;
};

/** Angka persen yang tertulis pada memo, untuk mengisi awal isian dialog. */
function persenDariNilai(nilai?: string | null): string {
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(nilai ?? "");
  return m ? m[1].replace(".", ",") : "";
}

/** Nominal rupiah yang tertulis pada memo, bila bukan persen. */
function nominalDariNilai(nilai?: string | null): string {
  if (!nilai || /%/.test(nilai)) return "";
  const m = /(\d[\d.]{5,})/.exec(nilai.replace(/\s/g, ""));
  return m ? m[1].replace(/\./g, "") : "";
}

export default function ReferensiPengajuanPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();

  const [baris, setBaris] = useState<Baris[]>([]);
  const [kunci, setKunci] = useState(false);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [kemajuan, setKemajuan] = useState<string | null>(null);
  const [seret, setSeret] = useState(false);
  /** Baris yang sedang diperiksa di dialog pemberlakuan. */
  const [dialog, setDialog] = useState<Baris | null>(null);

  const bolehBerlaku = ["admin_sales", "admin_system"]
    .includes(sesi?.role ?? "");
  const bolehKunci = sesi?.role === "admin_system";

  const muat = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/rujukan");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setBaris(Array.isArray(b?.baris) ? b.baris : []);
      setKunci(Boolean(b?.kunci));
      setGalat(null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  /**
   * Satu berkas: dibaca, lalu disimpan sebagai memo beserta rincian skemanya.
   *
   * Dijalankan berurutan, bukan serentak. OCR memakai seluruh inti prosesor
   * yang ada, dan lima berkas yang dibaca bersamaan membuat kelimanya selesai
   * lebih lambat daripada satu per satu — sambil membuat peramban berhenti
   * menjawab sama sekali.
   */
  const prosesBerkas = async (f: File): Promise<number> => {
    setKemajuan(k.membaca(f.name));

    // Berkas besar dititipkan sepotong demi sepotong; yang menyeberang
    // sesudahnya hanya pengenalnya, jadi satu memo sekali saja lewat jaringan.
    let titipan: string | null = null;
    if (perluDipecah(f)) {
      titipan = await titipBerkas(f, ({ terkirim, dari }) =>
        setKemajuan(k.menitip(Math.round((terkirim / dari) * 100))));
    }

    const fdBaca = new FormData();
    pasangBerkas(fdBaca, f, titipan);
    const resBaca = await fetch("/api/memos/baca",
                                { method: "POST", body: fdBaca });
    if (resBaca.status === 401) { location.href = "/login"; return 0; }
    const hasil = await resBaca.json().catch(() => ({}));
    if (!resBaca.ok) {
      throw new Error(hasil.detail ?? hasil.title ?? `HTTP ${resBaca.status}`);
    }
    const kolom = hasil.kolom ?? {};

    // Berkas Excel dibaca di peladen, sel demi sel: di dalamnya kolom masih
    // berupa kolom, jadi tidak ada yang perlu dibedah maupun ditebak, dan
    // yang muncul di ringkasan persis yang tertulis di lembarnya.
    let rinci: BarisSkema[] =
      Array.isArray(hasil.skema) ? (hasil.skema as BarisSkema[]) : [];

    // Sisanya dibedah dari kotak letak tiap kata. Dua sumbernya, dan
    // yang murah dicoba lebih dulu: PDF yang lahir digital sudah membawa
    // huruf beserta koordinatnya, sehingga OCR di sana hanya menebak ulang
    // apa yang sudah tertulis — belasan detik, dengan kesalahan baca.
    // Pindaian tidak punya lapisan itu, dan baru di sanalah OCR dijalankan.
    if (!rinci.length) rinci = bedahSkema((await kataTeksPdf(f)).kata);
    if (!rinci.length) {
      const pindai = await bacaPindaian(f, (m: Kemajuan) => {
        if (m.tahap === "menyiapkan") setKemajuan(k.ocrSiap);
        else if (m.tahap === "menggambar")
          setKemajuan(k.ocrGambar(m.halaman ?? 1, m.dari ?? 1));
        else if (m.tahap === "membaca") setKemajuan(k.ocrBaca(m.persen ?? 0));
      });
      rinci = bedahSkema(pindai.kata);
    }

    setKemajuan(k.menyimpan(f.name));
    const fd = new FormData();
    pasangBerkas(fd, f, titipan);
    fd.append("judul", kolom.judul ?? f.name);
    for (const [medan, nilai] of Object.entries({
      nomor: kolom.nomor, tanggal_memo: kolom.tanggal_memo,
      berlaku_dari: kolom.berlaku_dari, berlaku_sampai: kolom.berlaku_sampai,
      dari: kolom.dari, kepada: kolom.kepada,
      nilai_skema: kolom.nilai_skema, dokumen_wajib: kolom.dokumen_wajib,
      diajukan_oleh: kolom.diajukan_oleh,
      diketahui_oleh: kolom.diketahui_oleh,
      disetujui_oleh: kolom.disetujui_oleh,
    })) {
      if (typeof nilai === "string" && nilai.trim()) fd.append(medan, nilai);
    }
    if (rinci.length) fd.append("skema", JSON.stringify(rinci));

    const res = await fetch("/api/memos", { method: "POST", body: fd });
    if (res.status === 401) { location.href = "/login"; return 0; }
    const b = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(b.detail ?? b.title ?? `HTTP ${res.status}`);
    return rinci.length;
  };

  const terima = async (daftar: File[]) => {
    if (!daftar.length) return;
    setBusy(true); setGalat(null); setKabar(null);
    let tersimpan = 0, barisBaru = 0;
    const gagal: string[] = [];
    try {
      for (const f of daftar) {
        // Ukurannya diperiksa sebelum apa pun dikirim: menolak di sini
        // menyebut nama berkasnya, sedangkan menolak di server menyebut
        // permintaan yang tidak dikenali siapa pun.
        const salah = periksaUkuran(f);
        if (salah) { gagal.push(`${f.name}: ${salah}`); continue; }
        try {
          barisBaru += await prosesBerkas(f);
          tersimpan++;
        } catch (e: any) {
          gagal.push(`${f.name}: ${String(e?.message ?? e)}`);
        }
      }
      setKemajuan(null);
      if (gagal.length) setGalat(gagal.join(" · "));
      if (tersimpan) {
        setKabar(gagal.length ? k.sebagian(tersimpan, gagal.length)
                              : k.selesai(tersimpan, barisBaru));
        if (!barisBaru) setGalat(k.takAdaBaris);
      }
      await muat();
    } finally { setBusy(false); setKemajuan(null); }
  };

  const ubahKunci = async (nyala: boolean) => {
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "skema_wajib", value: String(nyala) }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      setKunci(nyala);
      setKabar(k.kunciBerubah(nyala));
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  const cabut = async (b: Baris) => {
    if (!confirm(k.cabutTanya)) return;
    setBusy(true); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/rujukan/${b.id}`, { method: "DELETE" });
      if (res.status === 401) { location.href = "/login"; return; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(j.detail ?? `HTTP ${res.status}`); return; }
      setKabar(k.cabutKabar);
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  const jumlahBerlaku = baris.filter((b) => b.scheme_id).length;

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>
      {galat && <div className="banner stop"><b>{k.galat}</b>{galat}</div>}
      {kabar && <div className="banner ok">{kabar}</div>}

      {/* Kunci berdiri di atas, bukan di kaki layar: ia yang menentukan apakah
          seluruh daftar di bawahnya mengikat atau sekadar catatan. */}
      <div className={`banner ${kunci ? "ok" : "warn"} sp`}>
        <b>{k.kunciJudul}</b>
        {kunci ? k.kunciOn : k.kunciOff}
        {bolehKunci ? (
          <div className="row" style={{ marginTop: 8 }}>
            <button disabled={busy} onClick={() => void ubahKunci(!kunci)}>
              {kunci ? k.kunciLonggarkan : k.kunciNyalakan}
            </button>
          </div>
        ) : (
          <div className="meta" style={{ marginTop: 6 }}>{k.kunciAdmin}</div>
        )}
      </div>

      <div className="panel sp">
        <h2>{k.unggahJudul}</h2>
        {/* Seret-dan-lepas, dan tetap ada tombolnya: yang memakai papan ketik
            atau pembaca layar tidak dapat menyeret apa pun. */}
        <label className={`kotak-seret${seret ? " aktif" : ""}`}
               onDragOver={(e) => { e.preventDefault(); setSeret(true); }}
               onDragLeave={() => setSeret(false)}
               onDrop={(e) => {
                 e.preventDefault(); setSeret(false);
                 void terima([...e.dataTransfer.files]);
               }}>
          <b>{k.seret}</b>
          <span>{k.seretLagi}</span>
          <span className="tombol-berkas">{k.pilih}</span>
          <input type="file" multiple hidden disabled={busy}
                 onChange={(e) => {
                   const daftar = [...(e.target.files ?? [])];
                   e.target.value = "";
                   void terima(daftar);
                 }} />
          <span className="meta">{k.jenisBerkas}</span>
        </label>
        {kemajuan && <p className="hint" style={{ textAlign: "left" }}>
          {kemajuan}
        </p>}
      </div>

      <div className="panel">
        <h2>
          {k.tabel}
          <span className="pil-sirkulasi">
            <span className="pill ok">{k.pBerlaku(jumlahBerlaku)}</span>
            <span className="pill">
              {k.pUsulan(baris.length - jumlahBerlaku)}
            </span>
          </span>
        </h2>

        <div className="tscroll">
          <table className="tabel-rujukan"><tbody>
            <tr>
              <th style={{ width: 40 }}>{k.kNo}</th>
              <th>{k.kNoMemo}</th>
              <th>{k.kTanggal}</th>
              <th>{k.kPerihal}</th>
              <th>{k.kPeriode}</th>
              <th>{k.kSkema}</th>
              <th>{k.kKategori}</th>
              <th>{k.kNilai}</th>
              <th>{k.kKeterangan}</th>
              <th>{k.kKeadaan}</th>
              {bolehBerlaku && <th style={{ width: 150 }}>{k.kTindakan}</th>}
            </tr>

            {baris.map((b, i) => (
              <tr key={b.id}>
                <td className="n">{i + 1}</td>
                <td>{b.no_memo ?? "—"}</td>
                <td>{tglPanjang(b.tanggal)}</td>
                <td>{b.perihal ?? "—"}</td>
                <td>{periode(b.periode_awal, b.periode_akhir)}</td>
                <td>{b.skema}</td>
                <td>{b.kategori ?? "—"}</td>
                <td>{b.nilai ?? "—"}</td>
                <td>{b.keterangan ?? "—"}</td>
                {/* Yang sudah berlaku menyebut angka yang BENAR-BENAR dipakai
                    menghitung, bukan angka pada memonya: keduanya boleh
                    berbeda bila yang memberlakukan membetulkan bacaan OCR,
                    dan yang perlu diketahui pembaca angka yang dipakai. */}
                <td>
                  {b.scheme_id ? (
                    <>
                      <span className="pill ok">{k.berlaku}</span>
                      <div className="meta">
                        {b.claim_type ? namaJenis(b.claim_type as any, bahasa)
                                      : "—"}
                        {b.recipient_role
                          ? ` · ${namaKategori(b.recipient_role, bahasa)}` : ""}
                      </div>
                      <div className="meta">
                        {persenTampil(b.percentage)
                         ?? rupiah(b.flat_amount) ?? "—"}
                      </div>
                    </>
                  ) : <span className="pill">{k.usulan}</span>}
                </td>
                  {/* Keduanya berdiri berdampingan, dan yang tidak berlaku
                      pada baris ini dimatikan — bukan dihilangkan. Tombol
                      yang muncul-hilang membuat orang mencari-cari di mana
                      sebuah baris dinonaktifkan; yang mati di tempatnya
                      sudah mengatakan bahwa barisnya memang belum berlaku. */}
                {bolehBerlaku && (
                  <td className="tindakan-rujukan">
                    <button className="pri" disabled={busy || !!b.scheme_id}
                            onClick={() => { setDialog(b); setGalat(null); }}>
                      {k.berlakukan}
                    </button>
                    <button disabled={busy || !b.scheme_id}
                            onClick={() => void cabut(b)}>
                      {k.cabut}
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {!baris.length && !busy && (
              <tr>
                <td colSpan={bolehBerlaku ? 11 : 10}
                    style={{ color: "var(--mut)" }}>{k.kosong}</td>
              </tr>
            )}
            {busy && !baris.length && (
              <tr><td colSpan={bolehBerlaku ? 11 : 10}
                      style={{ color: "var(--mut)" }}>{k.memuat}</td></tr>
            )}
          </tbody></table>
        </div>
      </div>

      {dialog && (
        <DialogBerlaku baris={dialog} k={k} bahasa={bahasa}
                       tutup={() => setDialog(null)}
                       selesai={async () => {
                         setDialog(null);
                         setKabar(k.berlakuKabar);
                         await muat();
                       }}
                       galat={setGalat} />
      )}
    </Kerangka>
  );
}

/**
 * Dialog pemeriksaan sebelum sebuah baris menjadi tarif.
 *
 * Isiannya diisi awal dari yang terbaca pada memo — jenis fee ditebak dari
 * judul tabelnya, persentase dari nilainya, masa berlaku dari periode
 * programnya — tetapi seluruhnya dapat diubah. Tebakan yang tidak dapat
 * dibantah adalah tebakan yang menjadi angka pembayaran tanpa ada yang
 * pernah menyetujuinya.
 */
function DialogBerlaku({ baris, k, bahasa, tutup, selesai, galat }: {
  baris: any; k: any; bahasa: "id" | "en";
  tutup: () => void; selesai: () => Promise<void>;
  galat: (s: string | null) => void;
}) {
  const teks = `${baris.skema} ${baris.kategori ?? ""}`.toLowerCase();
  // Urutannya bukan selera: judul tabel memo lazim menyebut dua hal sekaligus
  // — "Skema Komisi & Reward Sales Inhouse" — dan yang dicocokkan lebih dulu
  // yang menang. Komisi karena itu diperiksa sebelum reward, sebab tabel
  // berjudul demikian hampir selalu berisi komisi.
  const tebakJenis =
    /overid|overrid/.test(teks) ? "overriding"
    : /closing/.test(teks) ? "closing_fee"
    : /continuity/.test(teks) ? "continuity_reward"
    : /komisi|commission/.test(teks) ? "commission"
    : /reward/.test(teks) ? "cash_reward"
    : "commission";
  const tebakKategori =
    /agent/.test(teks) ? "agent"
    : /manager/.test(teks) ? "sales_manager_inhouse"
    : /koordinator|coordinator/.test(teks) ? "sales_coordinator"
    : /markom/.test(teks) ? "markom"
    : /bgb/.test(teks) ? "bgb"
    : "sales_inhouse";

  const [jenis, setJenis] = useState(tebakJenis);
  const [kategori, setKategori] = useState(tebakKategori);
  const [cara, setCara] = useState(
    persenDariNilai(baris.nilai) || !nominalDariNilai(baris.nilai)
      ? "persen" : "nominal");
  const [persen, setPersen] = useState(persenDariNilai(baris.nilai));
  const [nominalIsi, setNominalIsi] = useState(nominalDariNilai(baris.nilai));
  const [bersih, setBersih] = useState(false);
  const [dasar, setDasar] = useState("contract_value_incl_vat");
  const [dari, setDari] = useState(baris.periode_awal ?? "");
  const [sampai, setSampai] = useState(baris.periode_akhir ?? "");
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  const simpan = async () => {
    if (!dari) { setPesan(k.dTanggalWajib); return; }
    setBusy(true); setPesan(null); galat(null);
    try {
      const res = await fetch(`/api/rujukan/${baris.id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claim_type: jenis,
          recipient_role: kategori,
          overriding_level: jenis === "overriding" ? kategori : null,
          basis: dasar,
          percentage: cara === "persen" ? persen : null,
          flat_amount: cara === "nominal" ? nominalIsi : null,
          flat_amount_is_net: cara === "nominal" && bersih,
          effective_from: dari,
          effective_to: sampai || null,
        }),
      });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setPesan(b.detail ?? `HTTP ${res.status}`); return; }
      await selesai();
    } catch (e: any) {
      setPesan(String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  return (
    <div className="popup-latar"
         onClick={(e) => { if (e.target === e.currentTarget && !busy) tutup(); }}>
      <div className="popup" role="dialog" aria-modal="true"
           style={{ maxWidth: 560 }}>
        <div className="popup-kepala">
          <h3>{k.dJudul}</h3>
          <button className="tautan" onClick={tutup} disabled={busy}>✕</button>
        </div>

        <div className="popup-isi">
          <p className="hint" style={{ textAlign: "left", margin: "0 0 12px" }}>
            {k.dPengantar}
          </p>
          {pesan && <div className="banner stop">{pesan}</div>}

          <div className="lbl">{k.dBaris}</div>
          <p style={{ margin: "2px 0 12px" }}>
            <b>{baris.skema}</b>
            <br />{baris.kategori ?? "—"} — {baris.nilai ?? "—"}
            {baris.keterangan ? <><br />
              <span className="meta">{baris.keterangan}</span></> : null}
          </p>

          <div className="filters rapat">
            <div>
              <div className="lbl">{k.dJenis}</div>
              <select value={jenis} onChange={(e) => setJenis(e.target.value)}>
                {JENIS.map((j) => (
                  <option key={j} value={j}>{namaJenis(j as any, bahasa)}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="lbl">{k.dKategori}</div>
              <select value={kategori}
                      onChange={(e) => setKategori(e.target.value)}>
                {(KATEGORI_JENIS[jenis] ?? []).map((kd) => (
                  <option key={kd} value={kd}>{namaKategori(kd, bahasa)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="filters rapat" style={{ marginTop: 10 }}>
            <div>
              <div className="lbl">{k.dCara}</div>
              <select value={cara} onChange={(e) => setCara(e.target.value)}>
                <option value="persen">{k.dPersenPilih}</option>
                <option value="nominal">{k.dNominalPilih}</option>
              </select>
            </div>
            <div>
              <div className="lbl">
                {cara === "persen" ? k.dPersen : k.dNominal}
              </div>
              {cara === "persen" ? (
                <input value={persen} inputMode="decimal"
                       onChange={(e) => setPersen(e.target.value)} />
              ) : (
                <input value={nominalIsi} inputMode="numeric"
                       onChange={(e) => setNominalIsi(e.target.value)} />
              )}
            </div>
          </div>

          {cara === "nominal" && (
            <label className="row" style={{ marginTop: 8, gap: 6 }}>
              <input type="checkbox" checked={bersih}
                     onChange={(e) => setBersih(e.target.checked)} />
              <span>{k.dBersih}</span>
            </label>
          )}

          <div className="lbl" style={{ marginTop: 12 }}>{k.dDasar}</div>
          <select value={dasar} onChange={(e) => setDasar(e.target.value)}>
            <option value="contract_value_incl_vat">{k.dInclude}</option>
            <option value="contract_value_excl_vat">{k.dExclude}</option>
          </select>

          <div className="filters rapat" style={{ marginTop: 12 }}>
            <div>
              <div className="lbl">{k.dDari}</div>
              <input type="date" value={dari}
                     onChange={(e) => setDari(e.target.value)} />
            </div>
            <div>
              <div className="lbl">{k.dSampai}</div>
              <input type="date" value={sampai} min={dari || undefined}
                     onChange={(e) => setSampai(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="popup-kaki">
          <div className="row">
            <button className="pri" disabled={busy} onClick={() => void simpan()}>
              {k.dSimpan}
            </button>
            <button disabled={busy} onClick={tutup}>{k.dBatal}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
