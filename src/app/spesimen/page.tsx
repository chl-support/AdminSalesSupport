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

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

type Baris = {
  id: string; full_name: string; marketing_type: string; status: string;
  phone: string | null; agency_name: string | null; spesimen: number;
  spesimen_lama: number;
  baseline_specimen_set_id: string | null;
  punya_ktp: boolean; reference_signature_source: string | null;
  reference_signature_at: string | null;
  sesi_token: string | null; sesi_state: string | null;
  captured: number | null; target: number | null; consistency: number | null;
  sesi_set_id: string | null; expires_at: string | null;
  sesi_ktp_at: string | null; revision_reason: string | null;
};

const PILL: Record<string, string> = {
  active: "ok", pending_review: "warn", rejected: "stop",
};

const KATA = {
  id: {
    judul: "Spesimen Tanda Tangan",
    pengantar:
      "Spesimen tanda tangan didaftarkan sekali per orang dan dipakai " +
      "seterusnya sebagai pembanding. Yang belum punya, kirimkan tautannya " +
      "dari sini; yang sudah, tautannya tidak muncul lagi kecuali Anda " +
      "meminta revisi.",
    takBerwenangJudul: "Peran Anda tidak berwenang atas pendaftaran tanda tangan",
    takBerwenangIsi:
      "Hanya Admin Sales dan Admin IT yang dapat menerbitkan tautan dan " +
      "memutuskan baseline.",
    ringkas: (belum: number, menunggu: number) =>
      `${belum} marketing belum punya spesimen · ${menunggu} menunggu diperiksa`,
    ringkasIsi: (ambang: string) =>
      "Tautan meminta foto KTP, lalu potongan tanda tangan yang tercetak di " +
      "atasnya — itulah pembanding yang dipakai menilai tanda tangan pada " +
      "klaim. Karena pembandingnya goresan pulpen di kertas sedangkan tanda " +
      "tangan klaim dibuat di layar, angka kecocokannya rendah dengan " +
      `sendirinya: yang memutuskan adalah Anda yang melihat keduanya, bukan ambang ${ambang}.`,
    fSemua: "Semua", fBelum: "Belum punya spesimen",
    fMenunggu: "Menunggu diperiksa", fAktif: "Sudah aktif",
    muatUlang: "Muat ulang",
    mintaRevisiLama: (n: number) => `Minta revisi ${n} spesimen lama`,
    thMarketing: "Marketing", thStatus: "Status", thSpesimen: "Spesimen",
    thJangkar: "Jangkar KTP", thPendaftaran: "Pendaftaran berjalan",
    thTindakan: "Tindakan",
    ubahNomor: "Ubah nomor telepon", tanpaNomor: "tanpa nomor telepon",
    phNomor: "08xxxxxxxxxx", simpan: "Simpan", batal: "Batal",
    rekamanLama: "rekaman lama", dariKtp: "dari KTP", ada: "ada",
    menungguDiperiksa: "menunggu diperiksa", ttdPadaKtp: "tanda tangan pada KTP",
    tautanTerbuka: "tautan terbuka",
    ktpDiunggah: "KTP sudah diunggah", ktpBelum: "belum mengunggah KTP",
    tutup: "Tutup", periksaTtd: "Periksa tanda tangan",
    tautanMasihBerlaku: "Tautan sudah dikirim dan masih berlaku.",
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
      "A signature specimen is registered once per person and used from then " +
      "on as the reference. For those without one, send the link from here; " +
      "for those who have one, the link no longer appears unless you request " +
      "a revision.",
    takBerwenangJudul: "Your role is not authorised over signature registration",
    takBerwenangIsi:
      "Only Admin Sales and IT Admin can issue links and decide the baseline.",
    ringkas: (belum: number, menunggu: number) =>
      `${belum} marketing without a specimen · ${menunggu} awaiting review`,
    ringkasIsi: (ambang: string) =>
      "The link asks for a photo of the ID card, then the signature printed " +
      "on it — that is the reference used to judge signatures on claims. " +
      "Because the reference is pen on paper while a claim signature is drawn " +
      "on a screen, the match score is low by its very nature: the one who " +
      `decides is you, looking at both, not the ${ambang} threshold.`,
    fSemua: "All", fBelum: "No specimen yet",
    fMenunggu: "Awaiting review", fAktif: "Active",
    muatUlang: "Reload",
    mintaRevisiLama: (n: number) => `Request revision of ${n} old specimens`,
    thMarketing: "Marketing", thStatus: "Status", thSpesimen: "Specimens",
    thJangkar: "ID card anchor", thPendaftaran: "Registration in progress",
    thTindakan: "Action",
    ubahNomor: "Change phone number", tanpaNomor: "no phone number",
    phNomor: "08xxxxxxxxxx", simpan: "Save", batal: "Cancel",
    rekamanLama: "old screen capture", dariKtp: "from the ID card", ada: "present",
    menungguDiperiksa: "awaiting review", ttdPadaKtp: "signature on the ID card",
    tautanTerbuka: "link opened",
    ktpDiunggah: "ID card uploaded", ktpBelum: "ID card not uploaded yet",
    tutup: "Close", periksaTtd: "Review signature",
    tautanMasihBerlaku: "The link has been sent and is still valid.",
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
  const boleh = sesi?.role === "admin_sales" || sesi?.role === "admin_system";

  const [baris, setBaris] = useState<Baris[]>([]);
  const [ambang, setAmbang] = useState<number | null>(null);
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
    setAmbang(d.ambang ?? null);
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

  const menunggu = baris.filter((b) => b.sesi_state === "submitted").length;
  const belum = baris.filter((b) => b.spesimen === 0).length;
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
          <div className="banner info sp">
            <b>{k.ringkas(belum, menunggu)}</b>
            {k.ringkasIsi(String(ambang ?? "—"))}
          </div>

          {kabar && (
            <div className={`banner ${kabar.kind}`}
                 dangerouslySetInnerHTML={{ __html: kabar.html }} />
          )}

          <div className="row sp">
            {[["semua", k.fSemua], ["belum", k.fBelum],
              ["menunggu", k.fMenunggu], ["aktif", k.fAktif]]
              .map(([nilai, label]) => (
                <button key={nilai} className={saring === nilai ? "pri" : ""}
                        onClick={() => setSaring(nilai)}>{label}</button>
              ))}
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

                  {terlihat.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <b>{b.full_name}</b><br />
                        <span style={{ color: "var(--mut)", fontSize: 11 }}>
                          {b.marketing_type === "agent" ? "Agent" : "Inhouse"}
                          {b.agency_name ? ` · ${b.agency_name}` : ""}
                          {" · "}
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
                        ) : ["sent", "opened", "capturing"].includes(b.sesi_state ?? "") ? (
                          <span style={{ fontSize: 11.5, color: "var(--mut)" }}>
                            {k.tautanMasihBerlaku}
                          </span>
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
                          <button className="pri" disabled={busy}
                                  onClick={() => void kirimTautan(b)}>
                            {k.kirimTautan}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

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
