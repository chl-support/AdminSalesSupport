"use client";

/**
 * Pendaftaran tanda tangan — sisi Admin.
 *
 * Satu layar untuk tiga pertanyaan yang selalu datang bersamaan: siapa yang
 * belum punya spesimen, siapa yang sedang merekam, dan siapa yang menunggu
 * diperiksa. Memisahkannya menjadi tiga layar berarti yang menunggu diperiksa
 * terlewat, dan klaim orang itu terus jatuh ke pemeriksaan manual tanpa ada yang
 * tahu sebabnya.
 *
 * Yang menyetujui baseline bukan orang yang membuatnya. Persetujuan dilakukan di
 * sini, setelah seluruh goresannya benar-benar dilihat — bukan disimpulkan dari
 * angka konsistensi saja.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { SEMUA_KATEGORI, namaKategori } from "@/lib/kategori";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

type Baris = {
  id: string; full_name: string; marketing_type: string; status: string;
  category: string | null;
  phone: string | null; agency_name: string | null; spesimen: number;
  spesimen_lama: number;
  baseline_specimen_set_id: string | null;
  punya_ktp: boolean; reference_signature_source: string | null;
  reference_signature_at: string | null;
  sesi_token: string | null; sesi_state: string | null;
  captured: number | null; target: number | null; consistency: number | null;
  sesi_set_id: string | null; expires_at: string | null;
  sesi_ktp_at: string | null; revision_reason: string | null;
  sesi_otp: string | null; sesi_otp_terverifikasi: boolean | null;
};

const PILL: Record<string, string> = {
  active: "ok", pending_review: "warn", rejected: "stop",
};

const KATA = {
  id: {
    judul: "Spesimen Tanda Tangan",
    pengantar:
      "Spesimen Tanda Tangan Didaftarkan Satu Kali Dan Menjadi Acuan " +
      "Seterusnya. Tautan Pendaftaran Hanya Tersedia Bagi Yang Belum " +
      "Terdaftar Atau Memerlukan Pembaruan.",
    takBerwenangJudul: "Peran Anda tidak berwenang atas pendaftaran tanda tangan",
    takBerwenangIsi:
      "Hanya Admin Sales dan Admin IT yang dapat menerbitkan tautan dan " +
      "memutuskan baseline.",
    tambah: "+ Add", tambahJudul: "Tambah marketing baru",
    tambahPengantar:
      "Untuk orang yang tidak pernah tertulis pada berkas penjualan — Markom, " +
      "Sales Manager, Sales Koordinator, dan BGB. Yang menjual sudah masuk " +
      "sendiri dari unggahan berkasnya.",
    tNama: "Nama lengkap", tKategori: "Kategori penerima fee",
    tJenis: "Jenis", tJenisAgent: "Agent", tJenisInhouse: "Inhouse",
    tTelepon: "Nomor telepon", tEmail: "Email (boleh dikosongkan)",
    tNpwp: "NPWP (boleh dikosongkan)",
    tCatatan:
      "Tersimpan berstatus draft. Ia menjadi aktif setelah tanda tangannya " +
      "didaftarkan lewat tautan pendaftaran, sama seperti yang lain — sebelum " +
      "itu feenya belum dapat diajukan.",
    tSimpan: "Simpan", tMenyimpan: "Menyimpan…",
    tTersimpan: (nama: string) => `${nama} tersimpan`,
    tTersimpanIsi:
      "Berstatus draft. Terbitkan tautan pendaftaran tanda tangannya dari " +
      "baris orang ini.",
    tGagal: "Marketing baru tidak dapat disimpan",
    fSaring: "Tampilkan",
    fSemua: "Semua", fBelum: "Belum punya spesimen",
    fMenunggu: "Menunggu diperiksa", fAktif: "Sudah aktif",
    muatUlang: "Muat ulang",
    mintaRevisiLama: (n: number) => `Minta revisi ${n} spesimen lama`,
    thMarketing: "Marketing", thStatus: "Status", thSpesimen: "Spesimen",
    thJangkar: "Jangkar KTP", thPendaftaran: "Pendaftaran berjalan",
    thTindakan: "Tindakan",
    ubahNomor: "Ubah nomor telepon", tanpaNomor: "tanpa nomor telepon",
    phNomor: "08xxxxxxxxxx", simpan: "Simpan", batal: "Batal",
    ubahKategori: "Ubah kategori penerima fee",
    hapus: "Hapus data marketing",
    hapusJudul: (nama: string) => `Hapus ${nama}?`,
    hapusIsi:
      "Untuk baris yang salah input — nama yang sama terketik dua kali. " +
      "Rekening, spesimen tanda tangan, dan sesi pendaftarannya ikut hilang, " +
      "dan tidak dapat dikembalikan. Yang sudah dipakai pengajuan fee atau " +
      "data penjualan akan ditolak.",
    hapusYa: "Ya, hapus", hapusMenghapus: "Menghapus…",
    kHapusSelesai: (nama: string) => `${nama} dihapus`,
    kHapusSelesaiIsi:
      "Barisnya tersimpan pada jejak audit — di sanalah dapat dilihat kembali " +
      "siapa yang dihapus dan oleh siapa.",
    kHapusGagal: "Baris ini tidak dapat dihapus",
    rekamanLama: "rekaman lama", dariKtp: "dari KTP", ada: "ada",
    menungguDiperiksa: "menunggu diperiksa", ttdPadaKtp: "tanda tangan pada KTP",
    tautanTerbuka: "tautan terbuka",
    ktpDiunggah: "KTP sudah diunggah", ktpBelum: "belum mengunggah KTP",
    tutup: "Tutup", periksaTtd: "Periksa tanda tangan",
    tautanMasihBerlaku: "Tautan sudah dikirim dan masih berlaku.",
    tautanAlamat: "Tautan pendaftaran",
    tautanKode: "Kode verifikasi",
    tautanSampai: (sampai: string) => `Berlaku sampai ${sampai}`,
    tautanSalin: "Salin", tautanWa: "Kirim lewat WhatsApp",
    tautanTersalin: "Tautan tersalin.",
    tautanSudahDiverifikasi:
      "Kode sudah dipakai — yang perlu dikirim ulang hanya tautannya.",
    tautanHabis:
      "Tautan sudah lewat masa berlakunya. Terbitkan yang baru.",
    phAlasanRevisi: "Alasan revisi, minimal 10 karakter",
    terbitkanRevisi: "Terbitkan tautan revisi",
    sudahTerdaftar: "sudah terdaftar", mintaRevisi: "Minta revisi",
    nomorKosong:
      "Nomor telepon belum terisi. Isi nomornya pada kolom Marketing lebih dulu.",
    kirimTautan: "Kirim tautan pendaftaran",
    takAdaMarketing: "Tidak ada marketing pada penyaringan ini.",
    massalJudul: "Minta revisi spesimen lama",
    massalBanner: (n: number) =>
      `${n} marketing memakai spesimen hasil rekaman layar`,
    massalBannerIsi:
      "Tautan baru terbit untuk mereka semua, dan yang lama mati. Spesimen " +
      "sekarang tetap berlaku sampai KTP-nya masuk dan Anda setujui — tidak " +
      "ada yang kehilangan pembanding di tengah jalan.",
    massalAlasan:
      "Alasan penggantian (minimal 10 karakter, tercatat pada tiap sesi)",
    phMassal: "mis. Spesimen dialihkan ke tanda tangan pada KTP.",
    massalCatatan:
      "Pengiriman WhatsApp belum tersambung, jadi tautan dan kodenya " +
      "ditampilkan di layar ini setelah terbit — salin dan kirimkan ke " +
      "masing-masing orang. Halaman ini satu-satunya tempat kode itu terlihat.",
    menerbitkan: "Menerbitkan…",
    terbitkanN: (n: number) => `Terbitkan ${n} tautan`,
    hasilJudul: "TAUTAN PENGGANTIAN YANG TERBIT",
    hasilRingkas: (terbit: number, sasaran: number) =>
      `${terbit} tautan terbit dari ${sasaran} sasaran`,
    hasilIsi:
      "Salin dan kirimkan sekarang. Kode verifikasi hanya terlihat di halaman " +
      "ini — memuat ulang halaman menghilangkannya, dan menerbitkan ulang akan " +
      "mematikan tautan yang sudah dikirim.",
    hasilGagal: (n: number) => `${n} tidak dapat diterbitkan`,
    thNomor: "Nomor", thTautan: "Tautan", thKode: "Kode",
    thBerlaku: "Berlaku sampai",
    periksaNama: "Tanda tangan yang diajukan",
    ttdMilik: "Tanda tangan",
    iniPenggantian: "Ini penggantian",
    alasanDicatat: "Alasan yang dicatat saat tautannya diterbitkan:",
    ttdKtpLabel: "Tanda tangan pada KTP",
    bukaFotoKtp: "Buka foto KTP untuk diperiksa",
    terhapusOtomatis: "— terhapus otomatis begitu Anda memutuskan.",
    periksaCatatan:
      "Yang perlu dipastikan: potongan ini memang berasal dari KTP orang yang " +
      "namanya terdaftar, dan bentuknya utuh — bukan terpotong sebagian atau " +
      "tertimpa tulisan lain. Inilah yang akan Anda pakai membandingkan tanda " +
      "tangan pada tiap klaimnya.",
    takAdaPotonganJudul: "Tidak ada potongan tanda tangan pada pendaftaran ini",
    takAdaPotonganIsi:
      "Tanpa itu tidak ada yang dapat disetujui. Mintalah penggantian agar " +
      "orangnya mengunggah KTP-nya sekali lagi.",
    alasanWajib: "Alasan (wajib bila ditolak, minimal 10 karakter)",
    setujui: "Setujui sebagai pembanding", tolak: "Tolak",
    kTautanTerkirim: (nama: string, nomor: string) =>
      `Tautan pendaftaran untuk ${nama} terkirim ke ${nomor}`,
    kBuka: "Buka:", kOtp: "Kode OTP (hanya demo):",
    kBerlaku: (sampai: string, target: number) =>
      `Berlaku sampai ${sampai} · ${target} tanda tangan diminta.`,
    kTautanGagal: "Tautan tidak dapat dibuat",
    kNomorTersimpan: (nama: string) => `Nomor ${nama} tersimpan`,
    kNomorTersimpanIsi: (nomor: string) =>
      `Tersimpan sebagai ${nomor}. Tautan pendaftaran kini dapat diterbitkan.`,
    kNomorGagal: "Nomor tidak dapat disimpan",
    kKategoriTersimpan: (nama: string) => `Kategori ${nama} tersimpan`,
    kKategoriIsi: (kat: string) =>
      `Tersimpan sebagai ${kat}. Namanya kini muncul pada pemilih kategori ` +
      `itu di layar Pengajuan Fee.`,
    kKategoriGagal: "Kategori tidak dapat disimpan",
    kMassalGagal: "Penggantian massal gagal",
    kSetKosong: "Set ini tidak berisi tanda tangan",
    kSetKosongIsi:
      "Perekamannya terputus sebelum satu goresan pun tersimpan. Mintalah " +
      "tautan revisi.",
    kSpesimenGagal: "Spesimen tidak dapat dibuka",
    kCobaMuatUlang: "Coba muat ulang halaman.",
    kAktif: (nama: string) => `${nama} aktif`,
    kAktifIsi:
      "Spesimennya kini dipakai menilai tanda tangan pada klaim. Set lama " +
      "diarsipkan, tidak dihapus.",
    kDitolak: (nama: string) => `Set ${nama} ditolak`,
    kDitolakIsi: "Kirimkan tautan pendaftaran baru bila ia perlu merekam ulang.",
    kTakDiputuskan: "Tidak dapat diputuskan",
  },
  en: {
    judul: "Specimen Signature",
    pengantar:
      "A signature specimen is registered once and becomes the reference from " +
      "then on. The registration link is only available to those not yet " +
      "registered or needing an update.",
    takBerwenangJudul: "Your role is not authorised over signature registration",
    takBerwenangIsi:
      "Only Admin Sales and IT Admin can issue links and decide the baseline.",
    tambah: "+ Add", tambahJudul: "Add a new marketing",
    tambahPengantar:
      "For people who never appear in the sales file — Marcomm, Sales " +
      "Manager, Sales Coordinator, and BGB. Those who sell are already " +
      "imported from the uploaded file.",
    tNama: "Full name", tKategori: "Fee recipient category",
    tJenis: "Type", tJenisAgent: "Agent", tJenisInhouse: "In-house",
    tTelepon: "Phone number", tEmail: "Email (optional)",
    tNpwp: "NPWP (optional)",
    tCatatan:
      "Saved as a draft. They become active once their signature is " +
      "registered through the enrolment link, like everyone else — until " +
      "then their fees cannot be submitted.",
    tSimpan: "Save", tMenyimpan: "Saving…",
    tTersimpan: (nama: string) => `${nama} saved`,
    tTersimpanIsi:
      "Saved as a draft. Issue their signature enrolment link from their row.",
    tGagal: "The new marketing could not be saved",
    fSaring: "Show",
    fSemua: "All", fBelum: "No specimen yet",
    fMenunggu: "Awaiting review", fAktif: "Active",
    muatUlang: "Reload",
    mintaRevisiLama: (n: number) => `Request revision of ${n} old specimens`,
    thMarketing: "Marketing", thStatus: "Status", thSpesimen: "Specimens",
    thJangkar: "ID card anchor", thPendaftaran: "Registration in progress",
    thTindakan: "Action",
    ubahNomor: "Change phone number", tanpaNomor: "no phone number",
    phNomor: "08xxxxxxxxxx", simpan: "Save", batal: "Cancel",
    ubahKategori: "Change fee recipient category",
    hapus: "Delete this marketing record",
    hapusJudul: (nama: string) => `Delete ${nama}?`,
    hapusIsi:
      "For rows entered twice by mistake. Their bank account, signature " +
      "specimens, and enrolment sessions go with them, and cannot be " +
      "restored. Anyone already used by a fee submission or by sales data " +
      "will be refused.",
    hapusYa: "Yes, delete", hapusMenghapus: "Deleting…",
    kHapusSelesai: (nama: string) => `${nama} deleted`,
    kHapusSelesaiIsi:
      "The row is kept on the audit trail — that is where who was deleted, " +
      "and by whom, can be read back.",
    kHapusGagal: "This row could not be deleted",
    rekamanLama: "old screen capture", dariKtp: "from the ID card", ada: "present",
    menungguDiperiksa: "awaiting review", ttdPadaKtp: "signature on the ID card",
    tautanTerbuka: "link opened",
    ktpDiunggah: "ID card uploaded", ktpBelum: "ID card not uploaded yet",
    tutup: "Close", periksaTtd: "Review signature",
    tautanMasihBerlaku: "The link has been sent and is still valid.",
    tautanAlamat: "Registration link",
    tautanKode: "Verification code",
    tautanSampai: (sampai: string) => `Valid until ${sampai}`,
    tautanSalin: "Copy", tautanWa: "Send by WhatsApp",
    tautanTersalin: "Link copied.",
    tautanSudahDiverifikasi:
      "The code has been used — only the link needs resending.",
    tautanHabis: "The link has expired. Issue a new one.",
    phAlasanRevisi: "Reason for the revision, at least 10 characters",
    terbitkanRevisi: "Issue revision link",
    sudahTerdaftar: "registered", mintaRevisi: "Request revision",
    nomorKosong:
      "The phone number is empty. Fill it in under the Marketing column first.",
    kirimTautan: "Send registration link",
    takAdaMarketing: "No marketing matches this filter.",
    massalJudul: "Request revision of old specimens",
    massalBanner: (n: number) =>
      `${n} marketing use specimens captured on screen`,
    massalBannerIsi:
      "A new link is issued for all of them, and the old ones die. The current " +
      "specimen stays valid until the ID card arrives and you approve it — " +
      "nobody loses their reference midway.",
    massalAlasan:
      "Reason for the replacement (at least 10 characters, recorded on every session)",
    phMassal: "e.g. Specimens moved to the signature on the ID card.",
    massalCatatan:
      "WhatsApp delivery is not connected yet, so the links and codes appear " +
      "on this screen once issued — copy them and send them to each person. " +
      "This page is the only place those codes are visible.",
    menerbitkan: "Issuing…",
    terbitkanN: (n: number) => `Issue ${n} links`,
    hasilJudul: "REPLACEMENT LINKS ISSUED",
    hasilRingkas: (terbit: number, sasaran: number) =>
      `${terbit} links issued out of ${sasaran} targets`,
    hasilIsi:
      "Copy and send them now. The verification codes are visible only on this " +
      "page — reloading loses them, and issuing again kills the links already " +
      "sent.",
    hasilGagal: (n: number) => `${n} could not be issued`,
    thNomor: "Number", thTautan: "Link", thKode: "Code",
    thBerlaku: "Valid until",
    periksaNama: "Submitted signature",
    ttdMilik: "Signature of",
    iniPenggantian: "This is a replacement",
    alasanDicatat: "The reason recorded when the link was issued:",
    ttdKtpLabel: "Signature on the ID card",
    bukaFotoKtp: "Open the ID card photo for review",
    terhapusOtomatis: "— deleted automatically once you decide.",
    periksaCatatan:
      "What to make sure of: this crop really comes from the ID card of the " +
      "person registered, and its shape is whole — not partly cut off or " +
      "overlaid by other writing. This is what you will use to compare the " +
      "signature on each of their claims.",
    takAdaPotonganJudul: "This registration has no signature crop",
    takAdaPotonganIsi:
      "Without it there is nothing to approve. Request a replacement so the " +
      "person uploads their ID card once more.",
    alasanWajib: "Reason (required when rejecting, at least 10 characters)",
    setujui: "Approve as the reference", tolak: "Reject",
    kTautanTerkirim: (nama: string, nomor: string) =>
      `Registration link for ${nama} sent to ${nomor}`,
    kBuka: "Open:", kOtp: "OTP code (demo only):",
    kBerlaku: (sampai: string, target: number) =>
      `Valid until ${sampai} · ${target} signatures requested.`,
    kTautanGagal: "The link could not be created",
    kNomorTersimpan: (nama: string) => `${nama}'s number saved`,
    kNomorTersimpanIsi: (nomor: string) =>
      `Saved as ${nomor}. The registration link can now be issued.`,
    kNomorGagal: "The number could not be saved",
    kKategoriTersimpan: (nama: string) => `${nama}'s category saved`,
    kKategoriIsi: (kat: string) =>
      `Saved as ${kat}. The name now appears under that category on the Fee ` +
      `Submission screen.`,
    kKategoriGagal: "The category could not be saved",
    kMassalGagal: "The bulk replacement failed",
    kSetKosong: "This set contains no signature",
    kSetKosongIsi:
      "The capture was cut off before a single stroke was stored. Request a " +
      "revision link.",
    kSpesimenGagal: "The specimen could not be opened",
    kCobaMuatUlang: "Try reloading the page.",
    kAktif: (nama: string) => `${nama} is active`,
    kAktifIsi:
      "Their specimen is now used to judge signatures on claims. The old set " +
      "is archived, not deleted.",
    kDitolak: (nama: string) => `${nama}'s set was rejected`,
    kDitolakIsi: "Send a new registration link if they need to capture again.",
    kTakDiputuskan: "No decision could be recorded",
  },
};

export default function SpesimenPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const { bahasa } = useBahasa();
  const boleh = sesi?.role === "admin_sales" || sesi?.role === "admin_system";

  const [baris, setBaris] = useState<Baris[]>([]);
  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState<{ kind: string; html: string } | null>(null);
  const [lihat, setLihat] = useState<string | null>(null);
  const [citra, setCitra] = useState<any[]>([]);
  const [alasan, setAlasan] = useState("");
  const [saring, setSaring] = useState("semua");
  const [berkas, setBerkas] = useState<any>(null);
  // Permintaan revisi: baris yang sedang diminta, beserta alasannya.
  const [revisi, setRevisi] = useState<string | null>(null);
  const [alasanRevisi, setAlasanRevisi] = useState("");
  // Pengisian nomor telepon: baris yang sedang disunting, beserta isiannya.
  const [nomor, setNomor] = useState<string | null>(null);
  const [nomorBaru, setNomorBaru] = useState("");
  // Penggantian massal: satu alasan untuk semua yang spesimennya dari
  // perekaman lama di layar.
  const [massal, setMassal] = useState(false);
  /**
   * Isian "+ Add": orang baru yang tidak datang dari unggahan berkas.
   *
   * Disimpan satu objek, bukan satu state per kolom: keenamnya lahir dan mati
   * bersama dialognya, dan enam state terpisah berarti enam tempat yang harus
   * diingat untuk dikosongkan kembali.
   */
  /** Baris yang sedang ditanyakan penghapusannya. */
  const [hapus, setHapus] = useState<Baris | null>(null);
  const [tambah, setTambah] = useState<{
    full_name: string; category: string; marketing_type: string;
    phone: string; email: string; npwp: string;
  } | null>(null);
  const [alasanMassal, setAlasanMassal] = useState("");
  const [hasilMassal, setHasilMassal] = useState<any>(null);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = "/login"; }
    if (!res.ok) throw Object.assign(new Error(body.title ?? "Gagal"), { body });
    return body;
  }, []);

  const muat = useCallback(async () => {
    if (!boleh) return;
    const d = await api("/marketings");
    setBaris(d.marketings ?? []);
  }, [api, boleh]);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  // Esc menutup pop-up, sama seperti pop-up lain di sistem ini.
  useEffect(() => {
    if (!lihat) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tutupSet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lihat]);

  const kirimTautan = async (b: Baris, opsi: { revisi?: boolean } = {}) => {
    setBusy(true); setKabar(null);
    try {
      const r = await api(`/marketings/${b.id}/enrollment-requests`, {
        method: "POST",
        body: JSON.stringify(opsi.revisi
          ? { revisi: true, alasan: alasanRevisi } : {}) });
      setKabar({ kind: "ok", html:
        `<b>${k.kTautanTerkirim(b.full_name, r.masked_phone)}</b>
         ${k.kBuka} <a href="/daftar-ttd/${r.token}" target="_blank">/daftar-ttd/${r.token}</a><br>
         ${k.kOtp} <b>${r.otp_demo}</b><br>
         ${k.kBerlaku(String(r.expires_at).slice(0, 16).replace("T", " "), r.target)}` });
      setRevisi(null); setAlasanRevisi("");
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>${k.kTautanGagal}</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const simpanNomor = async (b: Baris) => {
    setBusy(true); setKabar(null);
    try {
      const r = await api(`/marketings/${b.id}`, {
        method: "PATCH", body: JSON.stringify({ phone: nomorBaru }) });
      setKabar({ kind: "ok", html:
        `<b>${k.kNomorTersimpan(b.full_name)}</b>${k.kNomorTersimpanIsi(r.phone)}` });
      setNomor(null); setNomorBaru("");
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>${k.kNomorGagal}</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  /**
   * Kategori penerima fee seseorang, disunting di tempat ia tertulis.
   *
   * Berkas penjualan hanya mengenal agent dan sales inhouse — hanya itu yang
   * ada di dalamnya. Markom, Sales Manager, Sales Koordinator, dan BGB
   * ditetapkan di sini, dan sampai ditetapkan, fee yang jatuh kepada mereka
   * tidak punya nama yang dapat dipilih di layar Pengajuan Fee.
   */
  /**
   * Simpan orang baru, lalu buka kembali daftarnya pada orang itu.
   *
   * Penyaringnya dikembalikan ke "Semua" setelah tersimpan: yang baru dibuat
   * berstatus draft dan belum punya spesimen, jadi pada penyaring "Sudah
   * aktif" ia tersimpan dengan benar tetapi tidak terlihat sama sekali — dan
   * yang menyimpannya akan mengira penyimpanannya gagal.
   */
  /**
   * Hapus satu baris, sesudah ditanyakan.
   *
   * Penolakan server ditampilkan apa adanya: ia menyebut apa yang masih
   * menunjuk kepada orang itu — berapa pengajuan fee, berapa data penjualan —
   * dan kalimat itulah yang memberi tahu apa yang harus dibetulkan lebih
   * dulu.
   */
  const jalankanHapus = async () => {
    if (!hapus) return;
    setBusy(true); setKabar(null);
    try {
      const r = await api(`/marketings/${hapus.id}`, { method: "DELETE" });
      setKabar({ kind: "ok", html:
        `<b>${k.kHapusSelesai(r.full_name ?? hapus.full_name)}</b>${k.kHapusSelesaiIsi}` });
      setHapus(null);
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>${k.kHapusGagal}</b>${e.body?.detail ?? ""}` });
      setHapus(null);
    } finally { setBusy(false); }
  };

  const simpanTambah = async () => {
    if (!tambah) return;
    setBusy(true); setKabar(null);
    try {
      const r = await api("/marketings", {
        method: "POST", body: JSON.stringify(tambah) });
      setKabar({ kind: "ok", html:
        `<b>${k.tTersimpan(r.full_name)}</b>${k.tTersimpanIsi}` });
      setTambah(null);
      setSaring("semua");
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html: `<b>${k.tGagal}</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const simpanKategori = async (b: Baris, kategoriBaru: string) => {
    setBusy(true); setKabar(null);
    try {
      const r = await api(`/marketings/${b.id}`, {
        method: "PATCH", body: JSON.stringify({ category: kategoriBaru }) });
      setKabar({ kind: "ok", html:
        `<b>${k.kKategoriTersimpan(b.full_name)}</b>${
          k.kKategoriIsi(namaKategori(r.category, bahasa))}` });
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>${k.kKategoriGagal}</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const kirimMassal = async () => {
    setBusy(true); setKabar(null);
    try {
      const r = await api("/marketings/enrollment-requests", {
        method: "POST", body: JSON.stringify({ alasan: alasanMassal }) });
      setHasilMassal(r);
      setMassal(false); setAlasanMassal("");
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>${k.kMassalGagal}</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const tutupSet = () => {
    setLihat(null); setCitra([]); setBerkas(null);
  };

  const bukaSet = async (setId: string) => {
    if (lihat === setId) { tutupSet(); return; }
    // Galatnya ditangkap. Sebelumnya tidak: bila permintaannya gagal, janji
    // yang ditolak berakhir di konsol peramban dan tombolnya tampak tidak
    // melakukan apa-apa — keluhan yang mustahil ditelusuri dari layar.
    setBusy(true); setKabar(null);
    try {
      const d = await api(`/marketings/specimens/${setId}`);
      setCitra(d.specimens ?? []);
      setBerkas(d);
      setLihat(setId);
      setAlasan("");
      if (!(d.specimens ?? []).length) {
        setKabar({ kind: "warn", html:
          `<b>${k.kSetKosong}</b>${k.kSetKosongIsi}` });
      }
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>${k.kSpesimenGagal}</b>${e.body?.detail ?? k.kCobaMuatUlang}` });
    } finally { setBusy(false); }
  };

  const putuskan = async (b: Baris, keputusan: "approve" | "reject") => {
    setBusy(true); setKabar(null);
    try {
      await api(`/marketings/${b.id}/specimen-review`, {
        method: "POST",
        body: JSON.stringify({ set_id: b.sesi_set_id, decision: keputusan,
                               reason: alasan }) });
      setKabar({ kind: "ok", html: keputusan === "approve"
        ? `<b>${k.kAktif(b.full_name)}</b>${k.kAktifIsi}`
        : `<b>${k.kDitolak(b.full_name)}</b>${k.kDitolakIsi}` });
      tutupSet();
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>${k.kTakDiputuskan}</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

  const terlihat = baris.filter((b) =>
    saring === "semua" ? true
    : saring === "belum" ? b.spesimen === 0
    : saring === "menunggu" ? b.sesi_state === "submitted"
    : b.status === "active");

  const lama = baris.filter((b) => b.spesimen_lama > 0).length;
  // Tautan disusun lengkap dengan nama situsnya supaya dapat langsung disalin
  // ke WhatsApp; "/daftar-ttd/…" saja tidak dapat dibuka orang lain.
  const asal = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      {!boleh ? (
        <div className="banner warn">
          <b>{k.takBerwenangJudul}</b>
          {k.takBerwenangIsi}
        </div>
      ) : (
        <>
          {kabar && (
            <div className={`banner ${kabar.kind}`}
                 dangerouslySetInnerHTML={{ __html: kabar.html }} />
          )}

          {/* Tindakan di kiri, penyaring di kanan.
              Sebelumnya keempat penyaring berupa tombol yang berjajar dengan
              tombol tindakan, dan keduanya tidak dapat dibedakan dari
              bentuknya — padahal yang satu mengubah apa yang terlihat dan
              yang lain mengerjakan sesuatu. */}
          <div className="row sp bilah-saring">
            <div className="row" style={{ margin: 0 }}>
              {/* Orang yang tidak pernah tertulis pada berkas penjualan —
                  Markom, Sales Manager, Sales Koordinator, BGB — tidak punya
                  jalan lain masuk ke daftar ini, dan feenya karena itu tidak
                  dapat diajukan atas nama siapa pun. */}
              <button className="pri" disabled={busy}
                      onClick={() => setTambah({
                        full_name: "", category: "markom",
                        marketing_type: "inhouse", phone: "",
                        email: "", npwp: "" })}>
                {k.tambah}
              </button>
              <button onClick={() => void muat()} disabled={busy}>{k.muatUlang}</button>
              {/* Peralihan ke tanda tangan KTP meninggalkan satu golongan di
                  tengah: yang sudah merekam goresan sebelum aturannya berubah.
                  Tombolnya hanya muncul selama golongan itu masih ada. */}
              {lama > 0 && (
                <button onClick={() => { setMassal(true); setHasilMassal(null); }}
                        disabled={busy}>
                  {k.mintaRevisiLama(lama)}
                </button>
              )}
            </div>
            <select value={saring} aria-label={k.fSaring}
                    onChange={(e) => setSaring(e.target.value)}>
              <option value="semua">{k.fSemua}</option>
              <option value="belum">{k.fBelum}</option>
              <option value="menunggu">{k.fMenunggu}</option>
              <option value="aktif">{k.fAktif}</option>
            </select>
          </div>

          <div className="panel">
            <div className="tscroll">
              <table>
                <tbody>
                  <tr>
                    <th>{k.thMarketing}</th>
                    <th>{k.thStatus}</th>
                    <th style={{ textAlign: "right" }}>{k.thSpesimen}</th>
                    <th>{k.thJangkar}</th>
                    <th>{k.thPendaftaran}</th>
                    <th style={{ width: 250 }}>{k.thTindakan}</th>
                  </tr>

                  {terlihat.map((b) => {
                  /* Tautan yang lewat masa berlakunya tetap berkeadaan 'sent'
                     di basis data — yang menolaknya adalah halaman
                     pendaftarannya, bukan daftar ini. Tanpa pemeriksaan di
                     sini, barisnya menulis "masih berlaku" atas tautan yang
                     sudah mati. */
                  const kedaluwarsa = Boolean(
                    b.expires_at && new Date(b.expires_at).getTime() < Date.now());
                  return (
                    <tr key={b.id}>
                      <td>
                        <b>{b.full_name}</b><br />
                        <span style={{ color: "var(--mut)", fontSize: 11 }}>
                          {b.marketing_type === "agent" ? "Agent" : "Inhouse"}
                          {b.agency_name ? ` · ${b.agency_name}` : ""}
                          {" · "}
                          {/* Kategori penerima fee, disunting di tempat ia
                              tertulis — sebagaimana nomor teleponnya di
                              sebelahnya. Tanpa jalan mengubahnya di sini,
                              Markom dan Sales Manager tidak akan pernah ada:
                              berkas penjualan hanya mengenal agent dan
                              inhouse. */}
                          <select value={b.category ?? "sales_inhouse"}
                                  title={k.ubahKategori} disabled={busy}
                                  style={{ fontSize: 11, padding: "1px 4px",
                                           marginRight: 4 }}
                                  onChange={(e) =>
                                    void simpanKategori(b, e.target.value)}>
                            {SEMUA_KATEGORI.map((kd) => (
                              <option key={kd} value={kd}>
                                {namaKategori(kd, bahasa)}
                              </option>
                            ))}
                          </select>
                          {/* Nomornya disunting di tempat ia tertulis. Ke nomor
                              inilah kode verifikasi pendaftaran dikirim, dan
                              data yang masuk dari berkas penjualan kerap belum
                              memuatnya — tanpa jalan memperbaikinya di sini,
                              barisnya buntu. */}
                          <button type="button" className="tautan"
                                  style={{ color: "inherit", fontWeight: 500 }}
                                  title={k.ubahNomor}
                                  onClick={() => { setNomor(b.id); setNomorBaru(b.phone ?? ""); }}>
                            {b.phone || k.tanpaNomor}
                          </button>
                        </span>
                        {nomor === b.id && (
                          <div className="row" style={{ marginTop: 6, marginBottom: 0 }}>
                            <input value={nomorBaru} autoFocus inputMode="tel"
                                   placeholder={k.phNomor} style={{ width: 150 }}
                                   onChange={(e) => setNomorBaru(e.target.value)} />
                            <button className="pri" disabled={busy}
                                    onClick={() => void simpanNomor(b)}>{k.simpan}</button>
                            <button onClick={() => { setNomor(null); setNomorBaru(""); }}>
                              {k.batal}
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${PILL[b.status] ?? ""}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="n">
                        {b.spesimen}
                        {b.spesimen > 0 && (
                          <>
                            <br />
                            <span style={{ fontSize: 10.5, color: "var(--mut)" }}>
                              {b.spesimen_lama > 0 ? k.rekamanLama : k.dariKtp}
                            </span>
                          </>
                        )}
                      </td>
                      <td>
                        {b.punya_ktp ? (
                          <>
                            <span className="pill ok">{k.ada}</span><br />
                            <span style={{ fontSize: 11, color: "var(--mut)" }}>
                              {b.reference_signature_at
                                ? String(b.reference_signature_at).slice(0, 10)
                                : b.reference_signature_source}
                            </span>
                          </>
                        ) : <span style={{ color: "var(--mut)" }}>—</span>}
                      </td>
                      <td>
                        {b.sesi_state === "submitted" ? (
                          <>
                            <span className="pill warn">{k.menungguDiperiksa}</span><br />
                            <span style={{ fontSize: 11 }}>{k.ttdPadaKtp}</span>
                          </>
                        ) : ["sent", "opened", "capturing"].includes(b.sesi_state ?? "") ? (
                          <>
                            <span className="pill">{k.tautanTerbuka}</span><br />
                            <span style={{ fontSize: 11 }}>
                              {b.sesi_ktp_at ? k.ktpDiunggah : k.ktpBelum}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: "var(--mut)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {b.sesi_state === "submitted" ? (
                          <button disabled={busy}
                                  onClick={() => void bukaSet(b.sesi_set_id!)}>
                            {lihat === b.sesi_set_id ? k.tutup : k.periksaTtd}
                          </button>
                        ) : ["sent", "opened", "capturing"].includes(b.sesi_state ?? "")
                             && !kedaluwarsa ? (
                          /* Tautannya tetap terlihat selama masih hidup.
                             Sebelumnya di sini hanya tertulis "sudah dikirim
                             dan masih berlaku": yang perlu mengirim ulang
                             karena orangnya belum juga membuka tidak punya
                             apa-apa untuk dikirim, dan satu-satunya jalan
                             adalah menerbitkan tautan baru — yang justru
                             mematikan tautan yang sudah telanjur dikirim.

                             Kodenya ikut selama belum dipakai. Ia memang sudah
                             pernah tampil di halaman ini saat diterbitkan, dan
                             yang melihatnya tetap hanya Admin Sales dan Admin
                             IT; yang berubah adalah ia tidak lagi hilang
                             begitu halamannya dimuat ulang. */
                          <div className="tautan-hidup">
                            <div className="lbl">{k.tautanAlamat}</div>
                            <div className="alamat-tautan">
                              {`${asal}/daftar-ttd/${b.sesi_token}`}
                            </div>
                            {b.sesi_otp && !b.sesi_otp_terverifikasi ? (
                              <div className="kode-tautan">
                                {k.tautanKode} <b>{b.sesi_otp}</b>
                              </div>
                            ) : (
                              <div className="kode-tautan pudar">
                                {k.tautanSudahDiverifikasi}
                              </div>
                            )}
                            {b.expires_at && (
                              <div className="kode-tautan pudar">
                                {k.tautanSampai(
                                  String(b.expires_at).slice(0, 16).replace("T", " "))}
                              </div>
                            )}
                            <div className="row" style={{ margin: "6px 0 0" }}>
                              <button onClick={() => {
                                navigator.clipboard?.writeText(
                                  `${asal}/daftar-ttd/${b.sesi_token}`);
                                setKabar({ kind: "ok",
                                           html: `<b>${k.tautanTersalin}</b>` });
                              }}>{k.tautanSalin}</button>
                              {b.phone && (
                                <a className="tombol-berkas"
                                   href={`https://wa.me/${b.phone}?text=${
                                     encodeURIComponent(
                                       `${asal}/daftar-ttd/${b.sesi_token}`)}`}
                                   target="_blank" rel="noreferrer">
                                  {k.tautanWa}
                                </a>
                              )}
                            </div>
                          </div>
                        ) : b.spesimen > 0 ? (
                          /* Sudah punya spesimen: tautannya tidak muncul lagi.
                             Spesimen adalah pembanding pembayaran orang ini —
                             menerbitkan tautan baru sekali klik berarti ia dapat
                             menggantinya sendiri tanpa jejak alasan. */
                          revisi === b.id ? (
                            <>
                              <textarea value={alasanRevisi} autoFocus
                                        placeholder={k.phAlasanRevisi}
                                        style={{ width: "100%", minHeight: 56 }}
                                        onChange={(e) => setAlasanRevisi(e.target.value)} />
                              <div className="row" style={{ marginTop: 6, marginBottom: 0 }}>
                                <button className="pri"
                                        disabled={busy || alasanRevisi.trim().length < 10}
                                        onClick={() => void kirimTautan(b, { revisi: true })}>
                                  {k.terbitkanRevisi}
                                </button>
                                <button onClick={() => { setRevisi(null); setAlasanRevisi(""); }}>
                                  {k.batal}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="pill ok">{k.sudahTerdaftar}</span>
                              <button style={{ marginTop: 6 }}
                                      onClick={() => { setRevisi(b.id); setAlasanRevisi(""); }}>
                                {k.mintaRevisi}
                              </button>
                            </>
                          )
                        ) : !b.phone ? (
                          /* Tanpa nomor, kode verifikasi tidak punya tujuan.
                             Sebelumnya tombolnya hanya dimatikan tanpa sebab
                             yang terbaca, sehingga barisnya tampak rusak. */
                          <span style={{ fontSize: 11.5, color: "var(--mut)" }}>
                            {k.nomorKosong}
                          </span>
                        ) : (
                          <>
                            {/* Yang tautannya baru saja mati perlu tahu
                                sebabnya: tombol yang sama muncul kembali tanpa
                                keterangan terbaca seperti tautan yang tadi
                                tidak pernah terkirim. */}
                            {kedaluwarsa && (
                              <div style={{ fontSize: 11.5, color: "var(--mut)",
                                            marginBottom: 6 }}>
                                {k.tautanHabis}
                              </div>
                            )}
                            <button className="pri" disabled={busy}
                                    onClick={() => void kirimTautan(b)}>
                              {k.kirimTautan}
                            </button>
                          </>
                        )}

                        {/* Hapus berdiri terpisah di bawah, dipisahkan garis,
                            bukan berjajar dengan tindakan lain: yang lain
                            menggerakkan pendaftaran, yang ini menghilangkan
                            barisnya, dan keduanya tidak boleh berjajar dalam
                            satu baris tombol yang ditekan cepat-cepat.

                            Tulisannya menyebut apa yang dihapus. "Hapus"
                            saja, berdiri tepat di bawah "Kirim tautan
                            pendaftaran", terbaca sebagai penghapus tautan itu
                            — padahal yang hilang adalah orangnya dari daftar
                            ini. */}
                        <div className="hapus-baris">
                          <button className="tautan" disabled={busy}
                                  onClick={() => setHapus(b)}>
                            {k.hapus}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  })}

                  {!terlihat.length && (
                    <tr>
                      <td colSpan={6} style={{ color: "var(--mut)" }}>
                        {k.takAdaMarketing}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Penghapusan ditanyakan lebih dulu, dan pertanyaannya menyebut
              namanya. Tombol hapus yang langsung bekerja pada tabel berisi
              nama-nama yang mirip — persis keadaan yang membuat baris ini
              perlu dihapus — akan menghapus orang yang salah. */}
          {hapus && (
            <div className="tirai"
                 onMouseDown={(e) => {
                   if (e.target === e.currentTarget && !busy) setHapus(null);
                 }}>
              <div className="popup" role="dialog" aria-modal="true"
                   style={{ maxWidth: 430 }}
                   aria-label={k.hapusJudul(hapus.full_name)}>
                <h2 style={{ margin: "0 0 4px" }}>
                  {k.hapusJudul(hapus.full_name)}
                </h2>
                <p className="pengantar" style={{ margin: "0 0 10px" }}>
                  {hapus.marketing_type === "agent" ? "Agent" : "Inhouse"}
                  {hapus.agency_name ? ` · ${hapus.agency_name}` : ""}
                  {hapus.phone ? ` · ${hapus.phone}` : ""}
                </p>
                <p className="hint" style={{ textAlign: "left", margin: 0 }}>
                  {k.hapusIsi}
                </p>

                <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                  <button className="pri" disabled={busy}
                          onClick={() => void jalankanHapus()}>
                    {busy ? k.hapusMenghapus : k.hapusYa}
                  </button>
                  <button disabled={busy}
                          onClick={() => setHapus(null)}>{k.batal}</button>
                </div>
              </div>
            </div>
          )}

          {/* Pop-up "+ Add". Kategorinya berdiri paling atas sesudah nama:
              ia yang menentukan jenisnya, dan yang mengisi perlu melihatnya
              sebelum menjawab pertanyaan di bawahnya. */}
          {tambah && (
            <div className="tirai"
                 onMouseDown={(e) => {
                   if (e.target === e.currentTarget && !busy) setTambah(null);
                 }}>
              <div className="popup lebar" role="dialog" aria-modal="true"
                   style={{ maxWidth: 520 }} aria-label={k.tambahJudul}>
                <div className="popup-kepala">
                  <h2>{k.tambahJudul}</h2>
                  <button className="tautan" aria-label={k.tutup}
                          disabled={busy}
                          onClick={() => setTambah(null)}>✕</button>
                </div>

                <div className="popup-isi">
                  <p className="hint" style={{ textAlign: "left", margin: "0 0 12px" }}>
                    {k.tambahPengantar}
                  </p>

                  <div className="lbl">{k.tNama}</div>
                  <input value={tambah.full_name} autoFocus
                         style={{ width: "100%" }}
                         onChange={(e) => setTambah(
                           { ...tambah, full_name: e.target.value })} />

                  <div className="filters rapat" style={{ marginTop: 10 }}>
                    <div>
                      <div className="lbl">{k.tKategori}</div>
                      <select value={tambah.category}
                              onChange={(e) => setTambah({
                                ...tambah, category: e.target.value,
                                // Jenisnya ikut kategorinya. Hanya Agent yang
                                // berarti agent; sisanya inhouse. Masih dapat
                                // dibetulkan sendiri pada kolom di sebelahnya.
                                marketing_type: e.target.value === "agent"
                                  ? "agent" : "inhouse" })}>
                        {SEMUA_KATEGORI.map((kd) => (
                          <option key={kd} value={kd}>
                            {namaKategori(kd, bahasa)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      {/* Bukan hal yang sama dengan kategorinya: inilah yang
                          menentukan tarif pajaknya. */}
                      <div className="lbl">{k.tJenis}</div>
                      <select value={tambah.marketing_type}
                              onChange={(e) => setTambah(
                                { ...tambah, marketing_type: e.target.value })}>
                        <option value="inhouse">{k.tJenisInhouse}</option>
                        <option value="agent">{k.tJenisAgent}</option>
                      </select>
                    </div>
                    <div>
                      <div className="lbl">{k.tTelepon}</div>
                      <input value={tambah.phone} inputMode="tel"
                             placeholder={k.phNomor}
                             onChange={(e) => setTambah(
                               { ...tambah, phone: e.target.value })} />
                    </div>
                    <div>
                      <div className="lbl">{k.tEmail}</div>
                      <input value={tambah.email} inputMode="email"
                             onChange={(e) => setTambah(
                               { ...tambah, email: e.target.value })} />
                    </div>
                    <div>
                      <div className="lbl">{k.tNpwp}</div>
                      <input value={tambah.npwp} inputMode="numeric"
                             onChange={(e) => setTambah(
                               { ...tambah, npwp: e.target.value })} />
                    </div>
                  </div>

                  <p className="hint" style={{ textAlign: "left", marginTop: 10 }}>
                    {k.tCatatan}
                  </p>
                </div>

                <div className="popup-kaki">
                  <div className="row">
                    <button className="pri"
                            disabled={busy || tambah.full_name.trim().length < 3
                                      || !tambah.phone.trim()}
                            onClick={() => void simpanTambah()}>
                      {busy ? k.tMenyimpan : k.tSimpan}
                    </button>
                    <button disabled={busy}
                            onClick={() => setTambah(null)}>{k.batal}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pop-up penggantian massal. Alasannya diketik sekali dan
              tercatat pada tiap sesi yang terbit. */}
          {massal && (
            <div className="tirai"
                 onMouseDown={(e) => {
                   if (e.target === e.currentTarget && !busy) setMassal(false);
                 }}>
              <div className="popup lebar" role="dialog" aria-modal="true"
                   style={{ maxWidth: 560 }}
                   aria-label={k.massalJudul}>
                <div className="popup-kepala">
                  <h2>{k.massalJudul}</h2>
                  <button className="tautan" aria-label={k.tutup}
                          onClick={() => setMassal(false)}>✕</button>
                </div>

                <div className="popup-isi">
                  <div className="banner info">
                    <b>{k.massalBanner(lama)}</b>
                    {k.massalBannerIsi}
                  </div>
                  <div className="lbl">
                    {k.massalAlasan}
                  </div>
                  <textarea value={alasanMassal} autoFocus
                            placeholder={k.phMassal}
                            style={{ width: "100%", minHeight: 70 }}
                            onChange={(e) => setAlasanMassal(e.target.value)} />
                  <p className="hint" style={{ textAlign: "left", marginTop: 8 }}>
                    {k.massalCatatan}
                  </p>
                </div>

                <div className="popup-kaki">
                  <div className="row">
                    <button className="pri"
                            disabled={busy || alasanMassal.trim().length < 10}
                            onClick={() => void kirimMassal()}>
                      {busy ? k.menerbitkan : k.terbitkanN(lama)}
                    </button>
                    <button disabled={busy}
                            onClick={() => setMassal(false)}>{k.batal}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasilMassal && (
            <div className="panel sp">
              <div className="form-blok">
                <h3>{k.hasilJudul}</h3>
                <div className="banner warn">
                  <b>{k.hasilRingkas(hasilMassal.terbit.length, hasilMassal.sasaran)}</b>
                  {k.hasilIsi}
                </div>

                {hasilMassal.gagal.length > 0 && (
                  <div className="banner stop">
                    <b>{k.hasilGagal(hasilMassal.gagal.length)}</b>
                    <ul style={{ margin: "6px 0 0 16px" }}>
                      {hasilMassal.gagal.map((g: any) => (
                        <li key={g.nama}>{g.nama} — {g.sebab}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="tscroll">
                  <table><tbody>
                    <tr>
                      <th>{k.thMarketing}</th><th>{k.thNomor}</th><th>{k.thTautan}</th>
                      <th>{k.thKode}</th><th>{k.thBerlaku}</th>
                    </tr>
                    {hasilMassal.terbit.map((t: any) => (
                      <tr key={t.marketing_id}>
                        <td><b>{t.nama}</b></td>
                        <td>{t.masked_phone}</td>
                        <td>
                          <code>{`${asal}/daftar-ttd/${t.token}`}</code>
                        </td>
                        <td><b>{t.otp_demo}</b></td>
                        <td>
                          {String(t.expires_at).slice(0, 16).replace("T", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              </div>
            </div>
          )}

          {/* Pemeriksaan dibuka sebagai pop-up, bukan panel di bawah tabel.
              Pada daftar marketing yang panjang panelnya jatuh jauh di luar
              layar, sehingga menekan tombolnya tampak tidak menghasilkan
              apa-apa. Sebagai pop-up ia muncul di depan baris yang ditekan, dan
              keputusannya diambil di tempat yang sama. */}
          {lihat && (
            <div className="tirai"
                 onMouseDown={(e) => {
                   if (e.target === e.currentTarget) tutupSet();
                 }}>
              <div className="popup lebar" role="dialog" aria-modal="true"
                   aria-label={k.periksaNama}>
                <div className="popup-kepala">
                  <h2>
                    {k.ttdMilik}{" "}
                    {baris.find((x) => x.sesi_set_id === lihat)?.full_name}
                  </h2>
                  <button className="tautan" onClick={tutupSet}
                          aria-label={k.tutup}>✕</button>
                </div>

                <div className="popup-isi">
                  {berkas?.revision_reason && (
                    <div className="banner warn">
                      <b>{k.iniPenggantian}</b>
                      {k.alasanDicatat} “{berkas.revision_reason}”.
                    </div>
                  )}

                  {berkas?.ktp_signature_png ? (
                    <>
                      <div className="lbl">{k.ttdKtpLabel}</div>
                      <div className="ttd-besar">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={berkas.ktp_signature_png}
                             alt={k.ttdKtpLabel} />
                      </div>
                      {berkas?.ada_foto_ktp && (
                        <p style={{ margin: "10px 0 0", fontSize: 12.5 }}>
                          <a href={`/api/marketings/specimens/${lihat}/ktp`}
                             target="_blank" rel="noreferrer">
                            {k.bukaFotoKtp}
                          </a>{" "}
                          {k.terhapusOtomatis}
                        </p>
                      )}
                      <p className="hint" style={{ textAlign: "left", marginTop: 10 }}>
                        {k.periksaCatatan}
                      </p>
                    </>
                  ) : (
                    <div className="banner stop">
                      <b>{k.takAdaPotonganJudul}</b>
                      {k.takAdaPotonganIsi}
                    </div>
                  )}
                </div>

                <div className="popup-kaki">
                  {(() => {
                    const b = baris.find((x) => x.sesi_set_id === lihat);
                    if (!b) return null;
                    return (
                      <>
                        <div className="lbl">
                          {k.alasanWajib}
                        </div>
                        <textarea value={alasan}
                                  onChange={(e) => setAlasan(e.target.value)}
                                  style={{ width: "100%", minHeight: 56 }} />
                        <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                          <button className="pri"
                                  disabled={busy || !berkas?.ktp_signature_png}
                                  onClick={() => void putuskan(b, "approve")}>
                            {k.setujui}
                          </button>
                          <button disabled={busy || alasan.trim().length < 10}
                                  onClick={() => void putuskan(b, "reject")}>
                            {k.tolak}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Kerangka>
  );
}
