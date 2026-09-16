"use client";

/**
 * Administrasi: unggah Laporan Penjualan dan pengelolaan sandi.
 *
 * Keduanya sebelumnya hanya dapat dijalankan dari baris perintah. Jalur yang
 * hanya dapat ditempuh sebagian orang berarti data penjualan bulanan dan
 * penggantian sandi menunggu satu orang yang kebetulan punya terminal — dan
 * sandi bawaan yang tertulis di repositori publik menunggu bersamanya.
 *
 * Impor selalu didahului pratinjau. Berkas keliru yang baru disadari setelah 52
 * baris tertulis bukan kesalahan yang mudah dibereskan, jadi langkah "lihat dulu"
 * dibuat tidak dapat dilewati, bukan sekadar disarankan.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { labelPeran, useSesi } from "../session";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;

type Pengguna = {
  username: string; full_name: string; role: string; active: boolean;
  sesi_aktif: number; terakhir_masuk: string | null;
};

type Hasil = {
  seksi: { nama: string; baris: number }[];
  baru: number; diperbarui: number; dilewati: number; marketing: number;
  dry_run: boolean;
  pratinjau: { unit: string; kontrak: string | null; tanggal: string | null;
               status: string; nilai: number; sales: string;
               tindakan: string }[];
  catatan: string[];
};

const KATA = {
  id: {
    judul: "Administrasi",
    pengantar:
      "Data penjualan dan akun pengguna. Seluruhnya dikerjakan dari layar " +
      "ini — tidak ada langkah yang memerlukan baris perintah.",
    takBerwenang: (peran: string) => `Peran ${peran} tidak berwenang atas menu ini`,
    takBerwenangIsi:
      "Unggah Laporan Penjualan, kalibrasi ambang tanda tangan, dan penggantian " +
      "kata sandi seluruhnya dikerjakan Admin IT. Hubungi Admin IT bila kata " +
      "sandi Anda perlu diganti.",
    kontakJudul: "KONTAK ADMIN SISTEM",
    kontakCatatan:
      "Tampil pada halaman masuk bagi orang yang lupa sandinya atau akunnya " +
      "terkunci — merekalah yang tidak dapat menghubungi siapa pun lewat sistem " +
      "ini. Dikosongkan berarti halaman masuk hanya menyarankan jalur biasa, " +
      "bukan menampilkan nomor karangan.",
    nomorWa: "Nomor WhatsApp (mis. 628123456789)", email: "Email",
    simpanKontak: "Simpan kontak",
    berhasil: "Berhasil", takDapatDisimpan: "Tidak dapat disimpan",
    kontakTersimpan: "Kontak tersimpan dan langsung tampil pada halaman masuk.",
    kalJudul: "KALIBRASI AMBANG TANDA TANGAN",
    kalCatatan:
      "Mengukur sebaran skor pada spesimen yang tersimpan, lalu menghitung " +
      "berapa tanda tangan sah yang akan ditolak (FRR) dan berapa tanda tangan " +
      "orang lain yang akan diterima (FAR) pada tiap ambang. Tidak ada yang " +
      "berubah sampai Anda menekan tombol pasang.",
    ambangBerlaku: "Ambang berlaku sekarang",
    terakhirKalibrasi: "Terakhir dikalibrasi", belumPernah: "belum pernah",
    mengukur: "Mengukur…", jalankanUkur: "Jalankan pengukuran",
    ukurGagal: "Pengukuran gagal",
    bahanUkur: "Bahan pengukuran",
    orangSpesimen: "Orang dengan spesimen", spesimen: "Spesimen",
    dariPendaftaran: "Di antaranya direkam lewat layar pendaftaran",
    pasanganAsliTiruan: "Pasangan asli / orang lain",
    skorAsli: "Skor tanda tangan asli (p05 · median · p95)",
    skorTiruan: "Skor tanda tangan orang lain (p05 · median · p95)",
    sintetisJudul: "Spesimen yang ada seluruhnya data contoh",
    sintetisIsi:
      "Tidak ada satu pun yang berasal dari layar pendaftaran — tanda tangannya " +
      "dibangkitkan program saat penyiapan, bukan tanda tangan agent sungguhan. " +
      "Angka di bawah menunjukkan mesinnya bekerja, tetapi tidak menyatakan apa " +
      "pun tentang tanda tangan orang sungguhan — jangan dipasang ke produksi.",
    frrFar: "FRR / FAR pada tiap ambang",
    thAmbang: "Ambang", thFrr: "Ditolak padahal sah (FRR)",
    thFar: "Diterima padahal orang lain (FAR)",
    eer: "Titik setimbang (EER)",
    farNol: "Ambang terendah dengan FAR 0%",
    frr5: "Ambang tertinggi dengan FRR ≤ 5%",
    takAdaFarNol:
      "Tidak ada ambang yang membuat FAR 0% pada data ini — pada setiap ambang " +
      "masih ada tanda tangan orang lain yang lolos. Kumpulkan spesimen dari " +
      "lebih banyak orang sebelum menyetel ambangnya.",
    protokolJudul: "Yang belum dipenuhi protokol PRD 12.2",
    pasangAmbang: "Pasang ambang (1–100)",
    pasangTombol: "Pasang ambang ini",
    pasangCatatan:
      "Ambang tersimpan bersama bukti pengukurannya dan tercatat di jejak audit. " +
      "Percobaan tanda tangan lama tetap menyimpan ambang yang berlaku saat itu, " +
      "jadi riwayatnya tidak berubah arti.",
    imporJudul: "UNGGAH LAPORAN PENJUALAN",
    imporCatatan:
      "Berkas ekspor Laporan Penjualan (.xls). Lihat pratinjau lebih dulu — " +
      "tidak ada yang ditulis sampai Anda menekan tombol tulis.",
    membaca: "Membaca…", lihatPratinjau: "Lihat pratinjau",
    tulisDb: "Tulis ke basis data",
    imporGagal: "Berkas tidak dapat diimpor",
    imporSelesai: "Impor selesai",
    pratinjauBelum: "Pratinjau — belum ada yang ditulis",
    thUnit: "Unit", thKontrak: "No. Kontrak", thTanggal: "Tanggal",
    thStatus: "Status", thNilai: "Nilai", thSales: "Sales",
    thTindakan: "Tindakan", takTerbaca: "tidak terbaca",
    ringkas: (baru: number, diperbarui: number, dilewati: number, mk: number) =>
      `${baru} penjualan baru · ${diperbarui} diperbarui · ${dilewati} dilewati · ` +
      `${mk} marketing dikenali`,
    barisSuffix: (nama: string, baris: number) => `${nama}: ${baris} baris`,
    terimaJudul: "UNGGAH LAPORAN PENERIMAAN",
    terimaCatatanA: "Berkas ekspor Laporan Penerimaan Customer (.xls). Yang diambil kolom ",
    terimaCatatanB:
      " — penerimaan kumulatif sampai tanggal laporan — dan dituliskan ke kolom " +
      "Penerimaan pada data penjualan. Angka itu menentukan prasyarat Cash " +
      "Reward dan besaran Komisi.",
    terimaSelesai: "Impor penerimaan selesai",
    thPembeli: "Pembeli", thPenerimaanTercatat: "Penerimaan tercatat",
    thMenjadi: "Menjadi", thPersenLunas: "% lunas",
    ringkasTerima: (d: number, sama: number, tak: number, ganda: number, baris: number) =>
      `${d} unit diperbarui · ${sama} tidak berubah · ${tak} tak dikenal · ` +
      `${ganda} ganda · dari ${baris} baris`,
    agenJudul: "UNGGAH LAPORAN AGENT",
    agenCatatanA: "Berkas ekspor Laporan Agent (.xls). Menyinkronkan data marketing: nama, agensi, ",
    agenCatatanB:
      ", email, NPWP, dan rekening. Nomor itulah tujuan kode verifikasi " +
      "pendaftaran tanda tangan, dan tanpa nomor tautannya tidak dapat " +
      "diterbitkan.",
    nomorWaTebal: "nomor WhatsApp",
    sdBulanIni: "s/d Bulan Ini",
    sinkronSelesai: "Sinkronisasi selesai",
    thNama: "Nama", thAgensi: "Agensi", thTipe: "Tipe",
    thKeagenan: "Keagenan", thNomorWa: "Nomor WA", thNpwp: "NPWP",
    thRekening: "Rekening", takAda: "tidak ada", ada: "ada",
    ringkasAgen: (baru: number, d: number, dilewati: number, rek: number, baris: number) =>
      `${baru} marketing baru · ${d} diperbarui · ${dilewati} dilewati · ` +
      `${rek} rekening dicatat · dari ${baris} orang`,
    kosongJudul: "KOSONGKAN DATA OPERASIONAL",
    kosongCatatanA:
      "Menghapus seluruh data penjualan, marketing, rekening, klaim, tanda " +
      "tangan, dan pendaftaran — untuk memulai dari nol dengan data sungguhan. ",
    kosongTakDibatalkan: "Tidak dapat dibatalkan",
    kosongCatatanB: ": yang terhapus tidak ada salinannya di sistem ini.",
    kosongTidak: "tidak",
    kosongCatatanC1: "Yang ",
    kosongCatatanC2:
      " disentuh: akun pengguna dan sesi Anda, skema insentif, tarif pajak, " +
      "periode akuntansi, pengaturan dan kontak Admin IT, serta jejak audit — " +
      "justru di sanalah pengosongan ini tercatat.",
    lihatIsi: "Lihat isi data sekarang",
    takDapatDijalankan: "Tidak dapat dijalankan",
    sudahDikosongkan: "Data operasional dikosongkan",
    sudahKosong: "sudah kosong",
    dipertahankan: (daftar: string) => `Yang dipertahankan: ${daftar}.`,
    akanDihapusJudul: "Baris berikut akan dihapus permanen",
    akanDihapusIsi:
      "Periksa angkanya sekali lagi. Setelah tombol ditekan, tidak ada cara " +
      "mengembalikannya.",
    thTabel: "Tabel", thBaris: "Baris",
    ketikKosongkan: "Ketik KOSONGKAN untuk menegaskan",
    menghapus: "Menghapus…", hapusPermanen: "Hapus permanen", batal: "Batal",
    akunJudul: "AKUN PENGGUNA",
    thUsername: "Username", thPeran: "Peran", thSesiAktif: "Sesi aktif",
    thTerakhirMasuk: "Terakhir masuk",
    pengguna: "Pengguna", pilihPengguna: "— pilih pengguna —",
    sandiBaru: "Kata sandi baru (minimal 8 karakter)",
    gantiSandi: "Ganti sandi pengguna ini",
    gantiSandiCatatan:
      "Mengganti sandi memutus seluruh sesi pengguna itu yang sedang berjalan.",
    takDapatGantiSandi: "Tidak dapat mengganti sandi",
    usernameBaruLabel: "Username baru untuk pengguna yang dipilih di atas",
    phUsername: "3–32 karakter, huruf kecil",
    gantiUsername: "Ganti username",
    gantiUsernameCatatan:
      "Huruf kecil, angka, titik, garis bawah, atau strip. Jejak audit tidak " +
      "dapat disunting, jadi entri lama tetap menyebut username lama — " +
      "penggantiannya sendiri ikut tercatat agar riwayat sebelum dan sesudahnya " +
      "masih dapat dirangkai. Sesi yang sedang berjalan tidak terputus.",
    usernameDiganti: "Username diganti",
    takDapatGantiUsername: "Tidak dapat mengganti username",
    hasilNama: (nama: string, baru: string, lama: string) =>
      `${nama} kini masuk dengan username ${baru} (sebelumnya ${lama}). ` +
      `Sesinya yang sedang berjalan tidak terputus; nama baru dipakai saat ia ` +
      `masuk berikutnya.`,
    hasilSandi: (nama: string, username: string, sesi: number) =>
      `Sandi ${nama} (${username}) diganti. ${sesi} sesi yang sedang berjalan ` +
      `diputus.`,
  },
  en: {
    judul: "Administration",
    pengantar:
      "Sales data and user accounts. Everything is done from this screen — no " +
      "step requires a command line.",
    takBerwenang: (peran: string) =>
      `The ${peran} role is not authorised over this menu`,
    takBerwenangIsi:
      "Uploading the Sales Report, calibrating the signature threshold, and " +
      "changing passwords are all done by the IT Admin. Contact the IT Admin " +
      "if your password needs changing.",
    kontakJudul: "SYSTEM ADMIN CONTACT",
    kontakCatatan:
      "Shown on the sign-in page to anyone who forgot their password or whose " +
      "account is locked — they are precisely the people who cannot reach " +
      "anyone through this system. Left empty, the sign-in page only suggests " +
      "the usual channel rather than showing an invented number.",
    nomorWa: "WhatsApp number (e.g. 628123456789)", email: "Email",
    simpanKontak: "Save contact",
    berhasil: "Done", takDapatDisimpan: "Could not be saved",
    kontakTersimpan: "The contact is saved and appears on the sign-in page right away.",
    kalJudul: "SIGNATURE THRESHOLD CALIBRATION",
    kalCatatan:
      "Measures the score distribution across stored specimens, then computes " +
      "how many genuine signatures would be rejected (FRR) and how many other " +
      "people's signatures would be accepted (FAR) at each threshold. Nothing " +
      "changes until you press the apply button.",
    ambangBerlaku: "Threshold in force now",
    terakhirKalibrasi: "Last calibrated", belumPernah: "never",
    mengukur: "Measuring…", jalankanUkur: "Run the measurement",
    ukurGagal: "The measurement failed",
    bahanUkur: "Measurement material",
    orangSpesimen: "People with a specimen", spesimen: "Specimens",
    dariPendaftaran: "Of those, captured through the registration screen",
    pasanganAsliTiruan: "Genuine / other-person pairs",
    skorAsli: "Genuine signature scores (p05 · median · p95)",
    skorTiruan: "Other-person signature scores (p05 · median · p95)",
    sintetisJudul: "Every specimen present is sample data",
    sintetisIsi:
      "Not one of them came from the registration screen — the signatures were " +
      "generated by a program during setup, not signed by real agents. The " +
      "numbers below show the engine works, but say nothing about real people's " +
      "signatures — do not apply them to production.",
    frrFar: "FRR / FAR at each threshold",
    thAmbang: "Threshold", thFrr: "Rejected though genuine (FRR)",
    thFar: "Accepted though another person (FAR)",
    eer: "Equal error rate (EER)",
    farNol: "Lowest threshold with 0% FAR",
    frr5: "Highest threshold with FRR ≤ 5%",
    takAdaFarNol:
      "No threshold gives 0% FAR on this data — at every threshold some other " +
      "person's signature still slips through. Collect specimens from more " +
      "people before setting the threshold.",
    protokolJudul: "What the PRD 12.2 protocol still lacks",
    pasangAmbang: "Apply threshold (1–100)",
    pasangTombol: "Apply this threshold",
    pasangCatatan:
      "The threshold is stored together with the evidence for it and is " +
      "recorded in the audit trail. Past signature attempts keep the threshold " +
      "that was in force at the time, so their history does not change meaning.",
    imporJudul: "UPLOAD SALES REPORT",
    imporCatatan:
      "The exported Sales Report file (.xls). Preview it first — nothing is " +
      "written until you press the write button.",
    membaca: "Reading…", lihatPratinjau: "Preview",
    tulisDb: "Write to the database",
    imporGagal: "The file could not be imported",
    imporSelesai: "Import complete",
    pratinjauBelum: "Preview — nothing written yet",
    thUnit: "Unit", thKontrak: "Contract no.", thTanggal: "Date",
    thStatus: "Status", thNilai: "Value", thSales: "Sales",
    thTindakan: "Action", takTerbaca: "unreadable",
    ringkas: (baru: number, diperbarui: number, dilewati: number, mk: number) =>
      `${baru} new sales · ${diperbarui} updated · ${dilewati} skipped · ` +
      `${mk} marketing recognised`,
    barisSuffix: (nama: string, baris: number) => `${nama}: ${baris} rows`,
    terimaJudul: "UPLOAD RECEIPTS REPORT",
    terimaCatatanA: "The exported Customer Receipts Report (.xls). What is taken is the column ",
    terimaCatatanB:
      " — receipts cumulative to the report date — and it is written into the " +
      "Received column of the sales data. That figure decides the Cash Reward " +
      "prerequisite and the size of the Commission.",
    terimaSelesai: "Receipts import complete",
    thPembeli: "Buyer", thPenerimaanTercatat: "Received on record",
    thMenjadi: "Becomes", thPersenLunas: "% paid",
    ringkasTerima: (d: number, sama: number, tak: number, ganda: number, baris: number) =>
      `${d} units updated · ${sama} unchanged · ${tak} unrecognised · ` +
      `${ganda} duplicates · from ${baris} rows`,
    agenJudul: "UPLOAD AGENT REPORT",
    agenCatatanA: "The exported Agent Report (.xls). It syncs marketing data: name, agency, ",
    agenCatatanB:
      ", email, NPWP, and bank account. That number is where the signature " +
      "registration code is sent, and without it the link cannot be issued.",
    nomorWaTebal: "WhatsApp number",
    sdBulanIni: "s/d Bulan Ini",
    sinkronSelesai: "Sync complete",
    thNama: "Name", thAgensi: "Agency", thTipe: "Type",
    thKeagenan: "Agency status", thNomorWa: "WA number", thNpwp: "NPWP",
    thRekening: "Bank account", takAda: "none", ada: "present",
    ringkasAgen: (baru: number, d: number, dilewati: number, rek: number, baris: number) =>
      `${baru} new marketing · ${d} updated · ${dilewati} skipped · ` +
      `${rek} accounts recorded · from ${baris} people`,
    kosongJudul: "CLEAR OPERATIONAL DATA",
    kosongCatatanA:
      "Deletes all sales, marketing, bank account, claim, signature, and " +
      "registration data — to start from zero with real data. ",
    kosongTakDibatalkan: "This cannot be undone",
    kosongCatatanB: ": what is deleted has no copy in this system.",
    kosongTidak: "not",
    kosongCatatanC1: "What is ",
    kosongCatatanC2:
      " touched: user accounts and your session, incentive schemes, tax rates, " +
      "accounting periods, IT Admin settings and contact, and the audit trail — " +
      "which is precisely where this clearing is recorded.",
    lihatIsi: "Show what the data holds now",
    takDapatDijalankan: "Cannot be run",
    sudahDikosongkan: "Operational data cleared",
    sudahKosong: "already empty",
    dipertahankan: (daftar: string) => `Kept: ${daftar}.`,
    akanDihapusJudul: "The rows below will be deleted permanently",
    akanDihapusIsi:
      "Check the numbers once more. Once the button is pressed there is no way " +
      "to bring them back.",
    thTabel: "Table", thBaris: "Rows",
    ketikKosongkan: "Type KOSONGKAN to confirm",
    menghapus: "Deleting…", hapusPermanen: "Delete permanently", batal: "Cancel",
    akunJudul: "USER ACCOUNTS",
    thUsername: "Username", thPeran: "Role", thSesiAktif: "Active sessions",
    thTerakhirMasuk: "Last sign-in",
    pengguna: "User", pilihPengguna: "— pick a user —",
    sandiBaru: "New password (at least 8 characters)",
    gantiSandi: "Change this user's password",
    gantiSandiCatatan:
      "Changing the password cuts every running session that user has.",
    takDapatGantiSandi: "The password could not be changed",
    usernameBaruLabel: "New username for the user selected above",
    phUsername: "3–32 characters, lowercase",
    gantiUsername: "Change username",
    gantiUsernameCatatan:
      "Lowercase letters, digits, dots, underscores, or hyphens. The audit " +
      "trail cannot be edited, so old entries keep naming the old username — " +
      "the change itself is recorded too, so the history before and after can " +
      "still be pieced together. Running sessions are not cut.",
    usernameDiganti: "Username changed",
    takDapatGantiUsername: "The username could not be changed",
    hasilNama: (nama: string, baru: string, lama: string) =>
      `${nama} now signs in with the username ${baru} (previously ${lama}). ` +
      `Their running session is not cut; the new name applies at their next ` +
      `sign-in.`,
    hasilSandi: (nama: string, username: string, sesi: number) =>
      `The password for ${nama} (${username}) was changed. ${sesi} running ` +
      `sessions were cut.`,
  },
};

export default function AdminPage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);
  const bolehKelola = sesi?.role === "admin_system";

  // ── Impor ──
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<Hasil | null>(null);
  const [tertulis, setTertulis] = useState<Hasil | null>(null);
  const [sibukImpor, setSibukImpor] = useState(false);
  const [galatImpor, setGalatImpor] = useState<string | null>(null);
  // Impor penerimaan berdiri sendiri: berkasnya lain, dan mengunggah yang satu
  // tidak boleh menghapus hasil pratinjau yang lain.
  const [berkasTerima, setBerkasTerima] = useState<File | null>(null);
  const [pratinjauTerima, setPratinjauTerima] = useState<any>(null);
  const [tertulisTerima, setTertulisTerima] = useState<any>(null);
  const [sibukTerima, setSibukTerima] = useState(false);
  const [galatTerima, setGalatTerima] = useState<string | null>(null);
  const [berkasAgen, setBerkasAgen] = useState<File | null>(null);
  const [pratinjauAgen, setPratinjauAgen] = useState<any>(null);
  const [tertulisAgen, setTertulisAgen] = useState<any>(null);
  const [sibukAgen, setSibukAgen] = useState(false);
  const [galatAgen, setGalatAgen] = useState<string | null>(null);
  // Pengosongan data: isi tabel sekarang, kata penegasan, dan hasilnya.
  const [isiTabel, setIsiTabel] = useState<Record<string, number> | null>(null);
  const [penegasan, setPenegasan] = useState("");
  const [sibukKosong, setSibukKosong] = useState(false);
  const [galatKosong, setGalatKosong] = useState<string | null>(null);
  const [hasilKosong, setHasilKosong] = useState<any>(null);

  // ── Sandi orang lain ──
  const [pengguna, setPengguna] = useState<Pengguna[]>([]);
  const [target, setTarget] = useState("");
  const [sandiBaru, setSandiBaru] = useState("");
  const [usernameBaru, setUsernameBaru] = useState("");
  const [hasilNama, setHasilNama] = useState<string | null>(null);
  const [galatNama, setGalatNama] = useState<string | null>(null);
  const [hasilSandi, setHasilSandi] = useState<string | null>(null);
  const [galatSandi, setGalatSandi] = useState<string | null>(null);

  // ── Sandi sendiri ──
  // Kalibrasi ambang tanda tangan.
  const [kal, setKal] = useState<any>(null);
  const [kalStatus, setKalStatus] = useState<any>(null);
  const [sibukKal, setSibukKal] = useState(false);
  const [galatKal, setGalatKal] = useState<string | null>(null);
  const [ambangPilih, setAmbangPilih] = useState("");

  // Kontak Admin IT yang tampil pada halaman masuk.
  const [wa, setWa] = useState("");
  const [email, setEmail] = useState("");
  const [hasilKontak, setHasilKontak] = useState<string | null>(null);
  const [galatKontak, setGalatKontak] = useState<string | null>(null);


  const muatPengguna = useCallback(async () => {
    if (!bolehKelola) return;
    const res = await fetch("/api/admin/users");
    if (res.status === 401) { location.href = "/login"; return; }
    if (res.ok) setPengguna(await res.json());
  }, [bolehKelola]);

  useEffect(() => { if (sesi) void muatPengguna(); }, [sesi, muatPengguna]);

  const muatKalibrasi = useCallback(async () => {
    if (!bolehKelola) return;
    const res = await fetch("/api/admin/signature-calibration");
    if (res.ok) setKalStatus(await res.json());
  }, [bolehKelola]);

  useEffect(() => { if (sesi) void muatKalibrasi(); }, [sesi, muatKalibrasi]);

  useEffect(() => {
    if (!bolehKelola) return;
    fetch("/api/kontak-admin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setWa(d.wa ?? ""); setEmail(d.email ?? ""); } })
      .catch(() => { /* biarkan kosong */ });
  }, [bolehKelola]);

  const simpanKontak = async () => {
    setGalatKontak(null); setHasilKontak(null);
    const res = await fetch("/api/kontak-admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wa, email }),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setGalatKontak(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    setHasilKontak(k.kontakTersimpan);
  };

  const jalankanKalibrasi = async () => {
    setSibukKal(true); setGalatKal(null);
    try {
      const res = await fetch("/api/admin/signature-calibration",
                              { method: "POST", body: "{}",
                                headers: { "Content-Type": "application/json" } });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalatKal(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setKal(b);
      setAmbangPilih(b.usul?.ambang != null ? String(b.usul.ambang) : "");
    } catch (e: any) { setGalatKal(String(e?.message ?? e)); }
    finally { setSibukKal(false); }
  };

  const pasangAmbang = async () => {
    setSibukKal(true); setGalatKal(null);
    try {
      const t = Number(ambangPilih);
      const titik = kal?.kurva?.find((k: any) => k.ambang === t);
      const res = await fetch("/api/admin/signature-calibration", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apply: t,
          evidence: { ...(kal?.bahan ?? {}), far: titik?.far ?? null,
                      frr: titik?.frr ?? null } }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalatKal(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      await muatKalibrasi();
    } catch (e: any) { setGalatKal(String(e?.message ?? e)); }
    finally { setSibukKal(false); }
  };

  const kirimBerkas = async (dryRun: boolean) => {
    if (!berkas) return;
    setSibukImpor(true);
    setGalatImpor(null);
    try {
      const fd = new FormData();
      fd.append("file", berkas);
      const res = await fetch(
        `/api/admin/import-penjualan?dry_run=${dryRun}`,
        { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalatImpor(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      if (dryRun) { setPratinjau(b); setTertulis(null); }
      else { setTertulis(b); setPratinjau(null); }
    } catch (e: any) {
      setGalatImpor(String(e?.message ?? e));
    } finally {
      setSibukImpor(false);
    }
  };

  const kirimPenerimaan = async (dryRun: boolean) => {
    if (!berkasTerima) return;
    setSibukTerima(true);
    setGalatTerima(null);
    try {
      const fd = new FormData();
      fd.append("file", berkasTerima);
      const res = await fetch(
        `/api/admin/import-penerimaan?dry_run=${dryRun}`,
        { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalatTerima(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      if (dryRun) { setPratinjauTerima(b); setTertulisTerima(null); }
      else { setTertulisTerima(b); setPratinjauTerima(null); }
    } catch (e: any) {
      setGalatTerima(String(e?.message ?? e));
    } finally {
      setSibukTerima(false);
    }
  };

  const kirimAgen = async (dryRun: boolean) => {
    if (!berkasAgen) return;
    setSibukAgen(true);
    setGalatAgen(null);
    try {
      const fd = new FormData();
      fd.append("file", berkasAgen);
      const res = await fetch(`/api/admin/import-agen?dry_run=${dryRun}`,
                              { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalatAgen(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      if (dryRun) { setPratinjauAgen(b); setTertulisAgen(null); }
      else { setTertulisAgen(b); setPratinjauAgen(null); }
    } catch (e: any) {
      setGalatAgen(String(e?.message ?? e));
    } finally {
      setSibukAgen(false);
    }
  };

  const lihatIsi = async () => {
    setGalatKosong(null); setHasilKosong(null);
    try {
      const res = await fetch("/api/admin/kosongkan");
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalatKosong(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setIsiTabel(b.isi);
    } catch (e: any) { setGalatKosong(String(e?.message ?? e)); }
  };

  const jalankanKosong = async () => {
    setSibukKosong(true); setGalatKosong(null);
    try {
      const res = await fetch("/api/admin/kosongkan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ penegasan }) });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setGalatKosong(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
      setHasilKosong(b); setPenegasan(""); setIsiTabel(null);
    } catch (e: any) {
      setGalatKosong(String(e?.message ?? e));
    } finally { setSibukKosong(false); }
  };

  const gantiUsername = async () => {
    setGalatNama(null); setHasilNama(null);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: target, new_username: usernameBaru }),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setGalatNama(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    setHasilNama(k.hasilNama(b.full_name, b.username, b.username_lama));
    setUsernameBaru("");
    setTarget(b.username);
    void muatPengguna();
  };

  const gantiSandiOrang = async () => {
    setGalatSandi(null);
    setHasilSandi(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: target, password: sandiBaru }),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setGalatSandi(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    setHasilSandi(k.hasilSandi(b.full_name, b.username, b.sesi_diputus));
    setSandiBaru("");
    void muatPengguna();
  };

  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

  const ringkasAgen = (h: any) =>
    k.ringkasAgen(h.baru, h.diperbarui, h.dilewati, h.rekening_baru, h.baris);

  const ringkasTerima = (h: any) =>
    k.ringkasTerima(h.diperbarui, h.sama, h.tak_dikenal, h.ganda, h.baris);

  const ringkas = (h: Hasil) =>
    k.ringkas(h.baru, h.diperbarui, h.dilewati, h.marketing);

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      {!bolehKelola && (
        <div className="banner warn">
          <b>{k.takBerwenang(labelPeran(sesi.role, bahasa))}</b>
          {k.takBerwenangIsi}
        </div>
      )}

      {bolehKelola && (
        <>
          {/* ── Kontak Admin IT ── */}
          <div className="panel sp">
            <div className="form-blok">
              <h3>{k.kontakJudul}</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                {k.kontakCatatan}
              </p>
              <div className="filters">
                <div>
                  <div className="lbl">{k.nomorWa}</div>
                  <input value={wa} inputMode="tel"
                         onChange={(e) => setWa(e.target.value)} />
                </div>
                <div>
                  <div className="lbl">{k.email}</div>
                  <input value={email} type="email"
                         onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button className="pri" onClick={() => void simpanKontak()}>
                  {k.simpanKontak}
                </button>
              </div>
              {hasilKontak && (
                <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
                  <b>{k.berhasil}</b>{hasilKontak}
                </div>
              )}
              {galatKontak && (
                <div className="banner stop" style={{ marginTop: 12, marginBottom: 0 }}>
                  <b>{k.takDapatDisimpan}</b>{galatKontak}
                </div>
              )}
            </div>
          </div>

          {/* ── Kalibrasi ambang tanda tangan ── */}
          <div className="panel sp">
            <div className="form-blok">
              <h3>{k.kalJudul}</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                {k.kalCatatan}
              </p>

              <table><tbody>
                <tr><td>{k.ambangBerlaku}</td>
                    <td className="n"><b>{kalStatus?.ambang ?? "—"}</b></td></tr>
                <tr><td>{k.terakhirKalibrasi}</td>
                    <td className="n">
                      {kalStatus?.dikalibrasi_pada
                        ? String(kalStatus.dikalibrasi_pada).slice(0, 10)
                        : k.belumPernah}
                    </td></tr>
              </tbody></table>

              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button className="pri" disabled={sibukKal}
                        onClick={() => void jalankanKalibrasi()}>
                  {sibukKal ? k.mengukur : k.jalankanUkur}
                </button>
              </div>

              {galatKal && (
                <div className="banner stop" style={{ marginTop: 12 }}>
                  <b>{k.ukurGagal}</b>{galatKal}
                </div>
              )}

              {kal && (
                <>
                  <div className="lbl" style={{ marginTop: 14 }}>{k.bahanUkur}</div>
                  <table><tbody>
                    <tr><td>{k.orangSpesimen}</td>
                        <td className="n">{kal.bahan.orang}</td></tr>
                    <tr><td>{k.spesimen}</td>
                        <td className="n">{kal.bahan.spesimen}</td></tr>
                    <tr><td>{k.dariPendaftaran}</td>
                        <td className="n">{kal.bahan.dari_pendaftaran}</td></tr>
                    <tr><td>{k.pasanganAsliTiruan}</td>
                        <td className="n">
                          {kal.bahan.pasangan_asli} / {kal.bahan.pasangan_tiruan}
                        </td></tr>
                    {kal.sebaran.asli && (
                      <tr><td>{k.skorAsli}</td>
                          <td className="n">
                            {kal.sebaran.asli.p05} · {kal.sebaran.asli.median} ·{" "}
                            {kal.sebaran.asli.p95}
                          </td></tr>
                    )}
                    {kal.sebaran.tiruan && (
                      <tr><td>{k.skorTiruan}</td>
                          <td className="n">
                            {kal.sebaran.tiruan.p05} · {kal.sebaran.tiruan.median} ·{" "}
                            {kal.sebaran.tiruan.p95}
                          </td></tr>
                    )}
                  </tbody></table>

                  {/* Peringatan mendahului angkanya, bukan menyusul: hasil yang
                      dibaca lebih dulu akan terlanjur dipercaya. */}
                  {kal.bahan.sumber_sintetis && (
                    <div className="banner stop" style={{ marginTop: 12 }}>
                      <b>{k.sintetisJudul}</b>
                      {k.sintetisIsi}
                    </div>
                  )}

                  <div className="lbl" style={{ marginTop: 14 }}>
                    {k.frrFar}
                  </div>
                  <div className="tscroll">
                    <table><tbody>
                      <tr><th>{k.thAmbang}</th><th>{k.thFrr}</th>
                          <th>{k.thFar}</th></tr>
                      {kal.kurva.filter((k: any) => k.ambang >= 30 && k.ambang <= 95)
                        .map((k: any) => (
                        <tr key={k.ambang}
                            style={k.ambang === Number(ambangPilih)
                              ? { background: "var(--okbg)" } : undefined}>
                          <td><b>{k.ambang}</b></td>
                          <td className="n">{k.frr}%</td>
                          <td className="n">{k.far}%</td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>

                  <table style={{ marginTop: 10 }}><tbody>
                    <tr><td>{k.eer}</td>
                        <td className="n">{kal.usul.eer ?? "—"}</td></tr>
                    <tr><td>{k.farNol}</td>
                        <td className="n">{kal.usul.far_nol ?? "—"}</td></tr>
                    <tr><td>{k.frr5}</td>
                        <td className="n">{kal.usul.frr_5 ?? "—"}</td></tr>
                  </tbody></table>

                  {kal.usul.far_nol == null && (
                    <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                      {k.takAdaFarNol}
                    </p>
                  )}

                  <div className="banner warn" style={{ marginTop: 12 }}>
                    <b>{k.protokolJudul}</b>
                    <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                      {kal.protokol.kekurangan.map((k: string) => (
                        <li key={k} style={{ marginBottom: 3 }}>{k}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="lbl" style={{ marginTop: 14 }}>
                    {k.pasangAmbang}
                  </div>
                  <div className="row" style={{ marginBottom: 0 }}>
                    <input value={ambangPilih} inputMode="numeric"
                           onChange={(e) => setAmbangPilih(e.target.value)}
                           style={{ width: 90 }} />
                    <button disabled={sibukKal || !ambangPilih}
                            onClick={() => void pasangAmbang()}>
                      {k.pasangTombol}
                    </button>
                  </div>
                  <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                    {k.pasangCatatan}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ── Impor ── */}
          <div className="panel sp">
            <div className="form-blok">
              <h3>{k.imporJudul}</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                {k.imporCatatan}
              </p>
              <input type="file" accept=".xls,.tsv,.txt,.csv"
                     style={{ width: "100%" }}
                     onChange={(e) => {
                       setBerkas(e.target.files?.[0] ?? null);
                       setPratinjau(null); setTertulis(null); setGalatImpor(null);
                     }} />
              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button disabled={!berkas || sibukImpor}
                        onClick={() => void kirimBerkas(true)}>
                  {sibukImpor ? k.membaca : k.lihatPratinjau}
                </button>
                <button className="pri" disabled={!pratinjau || sibukImpor}
                        onClick={() => void kirimBerkas(false)}>
                  {k.tulisDb}
                </button>
              </div>
            </div>

            {galatImpor && (
              <div className="banner stop">
                <b>{k.imporGagal}</b>{galatImpor}
              </div>
            )}

            {tertulis && (
              <div className="banner ok">
                <b>{k.imporSelesai}</b>
                {ringkas(tertulis)}
                <ul style={{ margin: "6px 0 0 16px" }}>
                  {tertulis.catatan.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}

            {pratinjau && (
              <>
                <div className="banner info">
                  <b>{k.pratinjauBelum}</b>
                  {ringkas(pratinjau)}
                  <div style={{ marginTop: 4 }}>
                    {pratinjau.seksi.map((s) => k.barisSuffix(s.nama, s.baris))
                      .join(" · ")}
                  </div>
                </div>
                <div className="tscroll">
                  <table><tbody>
                    <tr>
                      <th>{k.thUnit}</th><th>{k.thKontrak}</th><th>{k.thTanggal}</th>
                      <th>{k.thStatus}</th>
                      <th style={{ textAlign: "right" }}>{k.thNilai}</th>
                      <th>{k.thSales}</th><th>{k.thTindakan}</th>
                    </tr>
                    {pratinjau.pratinjau.map((p, i) => (
                      <tr key={`${p.kontrak}-${i}`}>
                        <td><b>{p.unit}</b></td>
                        <td>{p.kontrak ?? "—"}</td>
                        <td>{p.tanggal ?? (
                          <span style={{ color: "var(--stop)" }}>{k.takTerbaca}</span>
                        )}</td>
                        <td>
                          <span className={`pill ${p.status === "cancelled" ? "stop" : "ok"}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="n">{rp(p.nilai)}</td>
                        <td>{p.sales || "—"}</td>
                        <td>
                          <span className={`pill ${p.tindakan === "baru" ? "" : "warn"}`}>
                            {p.tindakan}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              </>
            )}
          </div>

          {/* ── Impor penerimaan ── */}
          <div className="panel sp">
            <div className="form-blok">
              <h3>{k.terimaJudul}</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                {k.terimaCatatanA}<b>{k.sdBulanIni}</b>{k.terimaCatatanB}
              </p>
              <input type="file" accept=".xls,.tsv,.txt,.csv"
                     style={{ width: "100%" }}
                     onChange={(e) => {
                       setBerkasTerima(e.target.files?.[0] ?? null);
                       setPratinjauTerima(null); setTertulisTerima(null);
                       setGalatTerima(null);
                     }} />
              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button disabled={!berkasTerima || sibukTerima}
                        onClick={() => void kirimPenerimaan(true)}>
                  {sibukTerima ? k.membaca : k.lihatPratinjau}
                </button>
                <button className="pri"
                        disabled={!pratinjauTerima || sibukTerima}
                        onClick={() => void kirimPenerimaan(false)}>
                  {k.tulisDb}
                </button>
              </div>
            </div>

            {galatTerima && (
              <div className="banner stop">
                <b>{k.imporGagal}</b>{galatTerima}
              </div>
            )}

            {tertulisTerima && (
              <div className="banner ok">
                <b>{k.terimaSelesai}</b>
                {ringkasTerima(tertulisTerima)}
                <ul style={{ margin: "6px 0 0 16px" }}>
                  {tertulisTerima.catatan.map((c: string) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}

            {pratinjauTerima && (
              <>
                <div className="banner info">
                  <b>{k.pratinjauBelum}</b>
                  {ringkasTerima(pratinjauTerima)}
                </div>
                <div className="tscroll">
                  <table><tbody>
                    <tr>
                      <th>{k.thUnit}</th><th>{k.thKontrak}</th><th>{k.thPembeli}</th>
                      <th style={{ textAlign: "right" }}>{k.thPenerimaanTercatat}</th>
                      <th style={{ textAlign: "right" }}>{k.thMenjadi}</th>
                      <th>{k.thPersenLunas}</th><th>{k.thTindakan}</th>
                    </tr>
                    {pratinjauTerima.pratinjau.map((p: any, i: number) => (
                      <tr key={`${p.kontrak}-${p.unit}-${i}`}>
                        <td><b>{p.unit}</b></td>
                        <td>{p.kontrak ?? "—"}</td>
                        <td>{p.customer || "—"}</td>
                        <td className="n">
                          {p.sebelum === null ? "—" : rp(p.sebelum)}
                        </td>
                        <td className="n">{rp(p.sesudah)}</td>
                        <td>{p.persen || "—"}</td>
                        <td>
                          <span className={`pill ${
                            p.tindakan === "diperbarui" ? "ok"
                            : p.tindakan === "tidak berubah" ? "" : "stop"}`}>
                            {p.tindakan}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              </>
            )}
          </div>

          {/* ── Impor agent ── */}
          <div className="panel sp">
            <div className="form-blok">
              <h3>{k.agenJudul}</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                {k.agenCatatanA}<b>{k.nomorWaTebal}</b>{k.agenCatatanB}
              </p>
              <input type="file" accept=".xls,.tsv,.txt,.csv"
                     style={{ width: "100%" }}
                     onChange={(e) => {
                       setBerkasAgen(e.target.files?.[0] ?? null);
                       setPratinjauAgen(null); setTertulisAgen(null);
                       setGalatAgen(null);
                     }} />
              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button disabled={!berkasAgen || sibukAgen}
                        onClick={() => void kirimAgen(true)}>
                  {sibukAgen ? k.membaca : k.lihatPratinjau}
                </button>
                <button className="pri" disabled={!pratinjauAgen || sibukAgen}
                        onClick={() => void kirimAgen(false)}>
                  {k.tulisDb}
                </button>
              </div>
            </div>

            {galatAgen && (
              <div className="banner stop">
                <b>{k.imporGagal}</b>{galatAgen}
              </div>
            )}

            {tertulisAgen && (
              <div className="banner ok">
                <b>{k.sinkronSelesai}</b>
                {ringkasAgen(tertulisAgen)}
                <ul style={{ margin: "6px 0 0 16px" }}>
                  {tertulisAgen.catatan.map((c: string) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}

            {pratinjauAgen && (
              <>
                <div className="banner info">
                  <b>{k.pratinjauBelum}</b>
                  {ringkasAgen(pratinjauAgen)}
                </div>
                <div className="tscroll">
                  <table><tbody>
                    <tr>
                      <th>{k.thNama}</th><th>{k.thAgensi}</th><th>{k.thTipe}</th>
                      <th>{k.thKeagenan}</th><th>{k.thNomorWa}</th><th>{k.thNpwp}</th>
                      <th>{k.thRekening}</th><th>{k.thTindakan}</th>
                    </tr>
                    {pratinjauAgen.pratinjau.map((p: any, i: number) => (
                      <tr key={`${p.nama}-${i}`}>
                        <td><b>{p.nama}</b></td>
                        <td>{p.agensi ?? "—"}</td>
                        <td>{p.tipe}</td>
                        <td>
                          <span className={`pill ${p.status === "AKTIF" ? "ok" : "stop"}`}>
                            {p.status}
                          </span>
                        </td>
                        <td>{p.telepon ?? (
                          <span style={{ color: "var(--stop)" }}>{k.takAda}</span>
                        )}</td>
                        <td>{p.npwp ? k.ada : "—"}</td>
                        <td>{p.rekening ?? "—"}</td>
                        <td>
                          <span className={`pill ${
                            p.tindakan === "baru" ? "" :
                            p.tindakan === "diperbarui" ? "ok" : "warn"}`}>
                            {p.tindakan}
                          </span>
                          {p.catatan && (
                            <><br /><span style={{ fontSize: 10.5, color: "var(--mut)" }}>
                              {p.catatan}
                            </span></>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              </>
            )}
          </div>

          {/* ── Pengosongan data ── */}
          <div className="panel sp">
            <div className="form-blok">
              <h3>{k.kosongJudul}</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                {k.kosongCatatanA}<b>{k.kosongTakDibatalkan}</b>{k.kosongCatatanB}
              </p>
              <p className="hint" style={{ textAlign: "left" }}>
                {k.kosongCatatanC1}<b>{k.kosongTidak}</b>{k.kosongCatatanC2}
              </p>

              <div className="row" style={{ marginBottom: 0 }}>
                <button onClick={() => void lihatIsi()} disabled={sibukKosong}>
                  {k.lihatIsi}
                </button>
              </div>
            </div>

            {galatKosong && (
              <div className="banner stop">
                <b>{k.takDapatDijalankan}</b>{galatKosong}
              </div>
            )}

            {hasilKosong && (
              <div className="banner ok">
                <b>{k.sudahDikosongkan}</b>
                {Object.entries(hasilKosong.terhapus)
                  .filter(([, n]) => Number(n) > 0)
                  .map(([t, n]) => `${t}: ${n}`).join(" · ") || k.sudahKosong}
                <div style={{ marginTop: 4 }}>
                  {k.dipertahankan(hasilKosong.dipertahankan.join(", "))}
                </div>
              </div>
            )}

            {isiTabel && (
              <>
                <div className="banner stop">
                  <b>{k.akanDihapusJudul}</b>
                  {k.akanDihapusIsi}
                </div>
                <div className="tscroll">
                  <table><tbody>
                    <tr><th>{k.thTabel}</th>
                        <th style={{ textAlign: "right" }}>{k.thBaris}</th></tr>
                    {Object.entries(isiTabel).map(([t, n]) => (
                      <tr key={t}>
                        <td><code>{t}</code></td>
                        <td className="n">{n}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>

                <div className="lbl" style={{ marginTop: 12 }}>
                  {k.ketikKosongkan}
                </div>
                <div className="row" style={{ marginBottom: 0 }}>
                  <input value={penegasan} placeholder="KOSONGKAN"
                         style={{ width: 200 }}
                         onChange={(e) => setPenegasan(e.target.value)} />
                  <button className="pri"
                          disabled={sibukKosong || penegasan.trim() !== "KOSONGKAN"}
                          onClick={() => void jalankanKosong()}>
                    {sibukKosong ? k.menghapus : k.hapusPermanen}
                  </button>
                  <button disabled={sibukKosong}
                          onClick={() => { setIsiTabel(null); setPenegasan(""); }}>
                    {k.batal}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Sandi pengguna lain ── */}
          <div className="panel">
            <div className="form-blok">
              <h3>{k.akunJudul}</h3>
              <div className="tscroll">
                <table><tbody>
                  <tr>
                    <th>{k.thUsername}</th><th>{k.thNama}</th><th>{k.thPeran}</th>
                    <th>{k.thSesiAktif}</th><th>{k.thTerakhirMasuk}</th>
                  </tr>
                  {pengguna.map((u) => (
                    <tr key={u.username}>
                      <td><code>{u.username}</code></td>
                      <td>{u.full_name}</td>
                      <td>{labelPeran(u.role, bahasa)}</td>
                      <td className="n">{u.sesi_aktif}</td>
                      <td>{u.terakhir_masuk
                        ? String(u.terakhir_masuk).slice(0, 19).replace("T", " ")
                        : <span style={{ color: "var(--mut)" }}>{k.belumPernah}</span>}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>

              <div className="filters" style={{ marginTop: 14 }}>
                <div>
                  <div className="lbl">{k.pengguna}</div>
                  <select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">{k.pilihPengguna}</option>
                    {pengguna.map((u) => (
                      <option key={u.username} value={u.username}>
                        {u.username} — {u.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="lbl">{k.sandiBaru}</div>
                  <input type="password" value={sandiBaru} autoComplete="new-password"
                         onChange={(e) => setSandiBaru(e.target.value)} />
                </div>
              </div>

              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button className="pri"
                        disabled={!target || sandiBaru.length < 8}
                        onClick={() => void gantiSandiOrang()}>
                  {k.gantiSandi}
                </button>
              </div>
              <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                {k.gantiSandiCatatan}
              </p>

              {hasilSandi && (
                <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
                  <b>{k.berhasil}</b>{hasilSandi}
                </div>
              )}
              {galatSandi && (
                <div className="banner stop" style={{ marginTop: 12, marginBottom: 0 }}>
                  <b>{k.takDapatGantiSandi}</b>{galatSandi}
                </div>
              )}

              {/* ── Ganti username ──────────────────────────────────────────
                  Pengguna yang dipilih di atas, dipakai lagi di sini: dua
                  pemilih untuk satu orang yang sama hanya menambah kesempatan
                  mengganti sandi orang A sambil menamai ulang orang B. */}
              <div style={{ borderTop: "1px solid var(--line)", marginTop: 16,
                            paddingTop: 14 }}>
                <div className="lbl">
                  {k.usernameBaruLabel}
                </div>
                <div className="row" style={{ marginBottom: 0 }}>
                  <input value={usernameBaru} autoComplete="off"
                         placeholder={k.phUsername}
                         style={{ minWidth: 240 }}
                         onChange={(e) => setUsernameBaru(e.target.value)} />
                  <button disabled={!target || usernameBaru.trim().length < 3}
                          onClick={() => void gantiUsername()}>
                    {k.gantiUsername}
                  </button>
                </div>
                <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                  {k.gantiUsernameCatatan}
                </p>

                {hasilNama && (
                  <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
                    <b>{k.usernameDiganti}</b>{hasilNama}
                  </div>
                )}
                {galatNama && (
                  <div className="banner stop" style={{ marginTop: 12, marginBottom: 0 }}>
                    <b>{k.takDapatGantiUsername}</b>{galatNama}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Kerangka>
  );
}
