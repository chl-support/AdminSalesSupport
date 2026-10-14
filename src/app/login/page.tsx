"use client";

/**
 * Halaman masuk.
 *
 * Tidak memuat daftar akun maupun petunjuk sandi. Layar masuk yang menampilkan
 * "coba admin/demo" berguna saat demo dan berbahaya begitu sistemnya dipakai
 * sungguhan — dan versi yang dipakai sungguhan selalu versi yang sama.
 */

import { useEffect, useRef, useState } from "react";

import { TombolBahasa, useBahasa, useKata } from "../bahasa";
import { PENANDA_MASUK } from "../kabar-menunggu";
import { Logo } from "../logo";

/**
 * Ikon digambar sebagai SVG sebaris, bukan diambil dari pustaka ikon.
 *
 * Halaman masuk dibuka sebelum siapa pun terbukti berhak, jadi ia sebaiknya
 * tidak menarik apa pun dari luar — satu permintaan ke server ikon adalah satu
 * pihak lagi yang tahu siapa membuka halaman masuk ini dan kapan.
 */
/**
 * Mata terbuka/tercoret untuk tombol lihat sandi.
 *
 * Satu komponen dengan satu sakelar, bukan dua komponen terpisah: kedua
 * gambarnya berbagi bentuk mata yang sama, dan yang membedakan hanya garis
 * coretannya.
 */
function IkonMata({ tertutup }: { tertutup: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
         fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.2 12S5.9 5.5 12 5.5 21.8 12 21.8 12 18.1 18.5 12 18.5 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {tertutup && <path d="m4 20 16-16" />}
    </svg>
  );
}

/**
 * Kata-kata halaman masuk dalam dua bahasa.
 *
 * Duduk di sebelah layar yang memakainya, bukan di satu berkas terpusat: kata
 * yang hanya dipakai satu layar lebih mudah dijaga tetap benar bila ia ada di
 * tempat yang sama dengan layarnya.
 */
const KATA = {
  id: {
    portal: "Portal Internal",
    judul: "Masuk",
    pengantar: "Gunakan akun yang diberikan Admin IT untuk melanjutkan.",
    username: "Username",
    sandi: "Password",
    lihatSandi: "Tampilkan kata sandi",
    sembunyikanSandi: "Sembunyikan kata sandi",
    memeriksa: "Memeriksa…",
    tombolMasuk: "Masuk",
    gagalJudul: "Tidak dapat masuk",
    gagalHttp: (kode: number) => `Gagal masuk (HTTP ${kode})`,
    sisaPercobaan: (n: number) =>
      `Sisa percobaan sebelum akun dikunci sementara: ${n}.`,
    // Pertanyaannya tidak lagi menyebut "lupa kata sandi": tautan tepat di
    // bawahnya sudah berbunyi begitu, dan mengulanginya membuat satu baris
    // bantuan terbaca dua kali.
    lupa: "Tidak dapat masuk?",
    lupaTautan: "Lupa kata sandi",
    atau: "atau",
    hubungi: "Hubungi Admin IT",
    lupaJudul: "Ganti kata sandi",
    lupaPengantar:
      "Masukkan alamat email Anda yang terdaftar. Kami mengirim kode " +
      "verifikasi ke sana, lalu Anda menentukan kata sandi baru.",
    lupaSurel: "Email terdaftar",
    lupaKirim: "Kirim kode",
    lupaMengirim: "Mengirim…",
    lupaKode: "Kode 6 digit dari email",
    lupaSandiBaru: "Kata sandi baru (minimal 10 karakter)",
    lupaSimpan: "Simpan kata sandi baru",
    lupaMenyimpan: "Menyimpan…",
    lupaKodeTerkirim: (menit: number) =>
      `Bila alamat itu terdaftar, kode verifikasi sudah dikirim ke sana. ` +
      `Kode berlaku ${menit} menit. Periksa juga folder spam.`,
    lupaSelesai:
      "Kata sandi Anda sudah diganti. Silakan masuk dengan kata sandi baru.",
    lupaGagal: "Tidak dapat melanjutkan",
    lupaKodeLain: "Minta kode lagi",
    kontakJudul: "Kontak Admin IT",
    kontakPengantar:
      "Silakan menghubungi kontak di bawah ini untuk mengatur ulang username " +
      "atau kata sandi Anda:",
    kontakKosong:
      "Kontak Admin IT belum diisi. Hubungi lewat jalur yang biasa Anda pakai.",
    tutup: "Tutup",
  },
  en: {
    portal: "Internal Portal",
    judul: "Sign In",
    pengantar: "Use the account issued by IT Admin to continue.",
    username: "Username",
    sandi: "Password",
    lihatSandi: "Show password",
    sembunyikanSandi: "Hide password",
    memeriksa: "Checking…",
    tombolMasuk: "Sign In",
    gagalJudul: "Unable to sign in",
    gagalHttp: (kode: number) => `Sign-in failed (HTTP ${kode})`,
    sisaPercobaan: (n: number) =>
      `Attempts remaining before the account is temporarily locked: ${n}.`,
    lupa: "Cannot sign in?",
    lupaTautan: "Forgot password",
    atau: "or",
    hubungi: "Contact IT Admin",
    lupaJudul: "Change your password",
    lupaPengantar:
      "Enter your registered email address. We send a verification code " +
      "there, then you choose a new password.",
    lupaSurel: "Registered email",
    lupaKirim: "Send code",
    lupaMengirim: "Sending…",
    lupaKode: "6-digit code from the email",
    lupaSandiBaru: "New password (at least 10 characters)",
    lupaSimpan: "Save new password",
    lupaMenyimpan: "Saving…",
    lupaKodeTerkirim: (menit: number) =>
      `If that address is registered, a verification code has been sent to ` +
      `it. The code is valid for ${menit} minutes. Check the spam folder too.`,
    lupaSelesai:
      "Your password has been changed. Please sign in with the new one.",
    lupaGagal: "Cannot continue",
    lupaKodeLain: "Request another code",
    kontakJudul: "IT Admin contact",
    kontakPengantar:
      "Please reach out to the contact below to reset your username or " +
      "password:",
    kontakKosong:
      "No IT Admin contact has been set. Reach out through your usual channel.",
    tutup: "Close",
  },
  // Sengaja tanpa `as const`: dengan itu tiap kata bertipe nilai literalnya
  // sendiri, sehingga "Internal Portal" dianggap tidak sepadan dengan "Portal
  // Internal" dan kedua bahasanya tidak pernah bisa dicocokkan. Tanpa `as
  // const`, bentuk bahasa Inggris tetap wajib punya kunci yang sama persis
  // dengan bahasa Indonesia — yang memang itulah yang perlu dijaga.
};


export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Sandi tersembunyi secara bawaan; tombol di dalam kolomnya membukanya
  // sementara. Layar masuk sering dibuka di meja terbuka, jadi yang dipilih
  // adalah tersembunyi dulu — bukan terbuka dulu lalu ditutup.
  const [lihatSandi, setLihatSandi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sisa, setSisa] = useState<number | null>(null);

  // Ganti sandi sendiri: email → kode → sandi baru. Tiga langkah dalam satu
  // kotak, sebab yang membukanya sedang tidak dapat masuk ke mana-mana dan
  // tidak punya layar lain untuk ditempatkan.
  const [lihatLupa, setLihatLupa] = useState(false);
  const [langkahLupa, setLangkahLupa] =
    useState<"surel" | "kode" | "selesai">("surel");
  const [surelLupa, setSurelLupa] = useState("");
  const [kodeLupa, setKodeLupa] = useState("");
  const [sandiLupa, setSandiLupa] = useState("");
  const [kabarLupa, setKabarLupa] = useState("");
  const [galatLupa, setGalatLupa] = useState<string | null>(null);
  const [sibukLupa, setSibukLupa] = useState(false);

  // Pilihan bahasanya kini milik seluruh aplikasi, bukan halaman ini saja —
  // yang disetel di sini tetap berlaku setelah orangnya masuk.
  const { bahasa } = useBahasa();
  const k = useKata(KATA);

  // Sudah punya sesi hidup: tidak perlu memperlihatkan layar masuk lagi.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => { if (r.ok) location.href = tujuan(); })
      .catch(() => { /* biarkan formulirnya tampil */ });
  }, []);


  /**
   * Kembali ke halaman yang tadi diminta, bukan selalu ke beranda.
   *
   * Hanya lintasan relatif yang diterima. Menerima URL utuh akan mengubah
   * halaman ini menjadi pengalih terbuka: tautan bermuatan ?next=https://… yang
   * mengantar orang ke situs lain tepat setelah mereka mengetikkan sandinya.
   */
  const tujuan = () => {
    // Selalu lewat pemilih project lebih dulu: hampir seluruh layar menyaring
    // datanya menurut project, dan membuka salah satunya tanpa project terpilih
    // hanya menghasilkan layar kosong yang tidak menjelaskan sebabnya. Halaman
    // yang tadi dituju dibawa serta, dan pemilihnya melanjutkan ke sana.
    const n = new URLSearchParams(window.location.search).get("next") ?? "/klaim";
    const aman = n.startsWith("/") && !n.startsWith("//") ? n : "/klaim";
    return `/project?next=${encodeURIComponent(aman)}`;
  };

  const mintaKode = async () => {
    setGalatLupa(null);
    setSibukLupa(true);
    try {
      const res = await fetch("/api/auth/lupa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: surelLupa.trim() }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalatLupa(b.detail ?? b.title ?? `HTTP ${res.status}`);
        return;
      }
      setKabarLupa(k.lupaKodeTerkirim(b.berlaku_menit ?? 15));
      setLangkahLupa("kode");
    } catch (err: any) {
      setGalatLupa(String(err?.message ?? err));
    } finally { setSibukLupa(false); }
  };

  const simpanSandiBaru = async () => {
    setGalatLupa(null);
    setSibukLupa(true);
    try {
      const res = await fetch("/api/auth/lupa/verifikasi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: surelLupa.trim(), kode: kodeLupa.trim(),
                               password: sandiLupa }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalatLupa(b.detail ?? b.title ?? `HTTP ${res.status}`);
        return;
      }
      // Username-nya diisikan sekalian: yang baru saja mengganti sandinya
      // hampir pasti hendak langsung masuk, dan ia belum tentu ingat
      // username-nya sendiri.
      setUsername(b.username ?? "");
      setKodeLupa(""); setSandiLupa("");
      setLangkahLupa("selesai");
    } catch (err: any) {
      setGalatLupa(String(err?.message ?? err));
    } finally { setSibukLupa(false); }
  };

  const masuk = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setGalat(null);
    setSisa(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(b.detail ?? KATA[bahasa].gagalHttp(res.status));
        setSisa(typeof b.sisa_percobaan === "number" ? b.sisa_percobaan : null);
        return;
      }
      // Penanda untuk pemberitahuan "berapa dokumen menunggu Anda", yang
      // muncul sekali di layar pertama setelah masuk. Dipasang di sini karena
      // hanya di sini yang diketahui bahwa ini benar-benar masuk baru, bukan
      // sesi lama yang halamannya kebetulan dibuka ulang.
      try { sessionStorage.setItem(PENANDA_MASUK, "1"); } catch { /* biar */ }
      location.href = tujuan();
    } catch (err: any) {
      setGalat(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="masuk">
      {/* Sisi kiri memuat lambang perusahaan saja. Yang memperkenalkan halaman
          ini adalah kartu di sebelah kanan — lambangnya di sini bekerja sebagai
          pengenal, bukan sebagai keterangan. */}
      <aside className="masuk-merek">
        {/* Lambang di atas, nama sistem di bawahnya, keduanya rata kiri
            sebagai satu blok. Lambangnya lebih kecil daripada saat ia berdiri
            sendirian: di sini ia kepala dari nama di bawahnya, dan kepala yang
            seukuran badannya membuat mata tidak tahu mulai dari mana. */}
        <div className="isi-merek">
          <Logo tinggi={124} />
          {/* Pemenggalan barisnya ditentukan di sini, bukan diserahkan pada
              pembungkusan otomatis: dengan background-clip:text, bagian kata
              yang meluber keluar kotaknya tidak ikut tergambar sama sekali,
              jadi kata yang tidak muat hilang separuh alih-alih turun baris. */}
          <div className="wordmark">
            <span>CHL Sales</span>
            <span>Admin System</span>
          </div>
          <span className="garis-merek" aria-hidden="true" />
        </div>
      </aside>

      <main className="masuk-isi">
        {/* Pilihan bahasa di pojok kanan atas bidang formulir. Di sana ia
            terbaca sebagai pengaturan halaman, bukan sebagai salah satu isian
            yang harus diisi sebelum masuk — di dalam kartu, sederet tombol
            tepat di atas kolom Username persis terbaca begitu. Pilihannya
            disimpan di peramban, jadi ia sudah tersetel sebelum orangnya
            masuk dan tetap begitu pada kunjungan berikutnya. */}
        <TombolBahasa />

        <form className="masuk-kartu" onSubmit={masuk}>
          {/* Nama sistemnya tidak diulang di sini: ia sudah tertulis besar di
              bidang sebelah kiri, dan dua penyebutan dalam satu layar membuat
              orang membaca hal yang sama dua kali. Di layar sempit bidang itu
              berpindah ke atas kartu — tetap terbaca lebih dulu. */}
          <p className="eyebrow">{k.portal}</p>
          <h1>{k.judul}</h1>
          <p className="pengantar">{k.pengantar}</p>

          <label className="lbl" htmlFor="username">{k.username}</label>
          <input id="username" type="text" value={username} autoFocus
                 autoComplete="username" className="isian"
                 onChange={(e) => setUsername(e.target.value)} />

          <label className="lbl" htmlFor="sandi">{k.sandi}</label>
          <div className="isian-sandi">
            <input id="sandi" type={lihatSandi ? "text" : "password"}
                   value={password} autoComplete="current-password"
                   className="isian"
                   onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setLihatSandi((v) => !v)}
                    aria-label={lihatSandi ? k.sembunyikanSandi
                                           : k.lihatSandi}>
              <IkonMata tertutup={lihatSandi} />
            </button>
          </div>

          <button className="pri masuk-tombol" type="submit"
                  disabled={busy || !username || !password}>
            {busy ? k.memeriksa : k.tombolMasuk}
          </button>

          {galat && (
            <div className="banner stop" style={{ marginTop: 14, marginBottom: 0 }}>
              <b>{k.gagalJudul}</b>
              {galat}
              {sisa !== null && (
                <div style={{ marginTop: 4 }}>
                  {k.sisaPercobaan(sisa)}
                </div>
              )}
            </div>
          )}

          <div className="masuk-bantuan">
            {/* Tautannya turun ke barisnya sendiri: sebaris dengan
                pertanyaannya, ia terbaca sebagai lanjutan kalimat, bukan sebagai
                sesuatu yang dapat ditekan. */}
            <p>{k.lupa}</p>
            {/* Dua jalan, dan yang pertama tidak melewati siapa pun: mengganti
                sandi sendiri lewat kode ke email terdaftar. "Hubungi Admin IT"
                tinggal untuk yang emailnya belum terdaftar atau tidak lagi
                dapat dibuka. */}
            <button type="button" className="tautan"
                    onClick={() => { setLihatLupa(true); setLangkahLupa("surel"); }}>
              {k.lupaTautan}
            </button>
            {/* "Hubungi Admin IT" dipindahkan ke menu profil di dalam
                aplikasi, atas permintaan kantor. Yang tersisa di sini jalan
                yang tidak memerlukan siapa pun. */}
          </div>

          {lihatLupa && (
            <div className="tirai" onMouseDown={(e) => {
              if (e.target === e.currentTarget) setLihatLupa(false);
            }}>
              <div className="popup" role="dialog" aria-modal="true"
                   aria-label={k.lupaJudul}>
                <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>{k.lupaJudul}</h2>

                {langkahLupa === "surel" && (
                  <>
                    <p className="pengantar">{k.lupaPengantar}</p>
                    <div className="lbl">{k.lupaSurel}</div>
                    <input type="email" value={surelLupa} autoComplete="email"
                           style={{ width: "100%" }}
                           onChange={(e) => setSurelLupa(e.target.value)} />
                    <button type="button" className="pri" disabled={sibukLupa}
                            style={{ width: "100%", marginTop: 10 }}
                            onClick={() => void mintaKode()}>
                      {sibukLupa ? k.lupaMengirim : k.lupaKirim}
                    </button>
                  </>
                )}

                {langkahLupa === "kode" && (
                  <>
                    <div className="banner ok" style={{ marginTop: 4 }}>
                      {kabarLupa}
                    </div>
                    <div className="lbl">{k.lupaKode}</div>
                    <input value={kodeLupa} inputMode="numeric" maxLength={6}
                           style={{ width: "100%", letterSpacing: ".3em",
                                    textAlign: "center", fontSize: 17 }}
                           onChange={(e) => setKodeLupa(e.target.value)} />
                    <div className="lbl" style={{ marginTop: 10 }}>
                      {k.lupaSandiBaru}
                    </div>
                    <input type="password" value={sandiLupa}
                           autoComplete="new-password" style={{ width: "100%" }}
                           onChange={(e) => setSandiLupa(e.target.value)} />
                    <button type="button" className="pri"
                            disabled={sibukLupa || kodeLupa.trim().length !== 6 ||
                                      sandiLupa.length < 10}
                            style={{ width: "100%", marginTop: 10 }}
                            onClick={() => void simpanSandiBaru()}>
                      {sibukLupa ? k.lupaMenyimpan : k.lupaSimpan}
                    </button>
                    <button type="button" className="tautan"
                            style={{ marginTop: 8 }}
                            onClick={() => { setLangkahLupa("surel");
                                             setGalatLupa(null); }}>
                      {k.lupaKodeLain}
                    </button>
                  </>
                )}

                {langkahLupa === "selesai" && (
                  <div className="banner ok">{k.lupaSelesai}</div>
                )}

                {galatLupa && (
                  <div className="banner stop" style={{ marginTop: 10 }}>
                    <b>{k.lupaGagal}</b>{galatLupa}
                  </div>
                )}

                <button type="button" className="pri"
                        style={{ marginTop: 10 }}
                        onClick={() => setLihatLupa(false)}>
                  {k.tutup}
                </button>
              </div>
            </div>
          )}

        </form>
      </main>
    </div>
  );
}
