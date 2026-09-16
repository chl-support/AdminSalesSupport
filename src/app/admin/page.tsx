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

export default function AdminPage() {
  const { sesi, memuat } = useSesi();
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
    setHasilKontak("Kontak tersimpan dan langsung tampil pada halaman masuk.");
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
    setHasilNama(
      `${b.full_name} kini masuk dengan username ${b.username} ` +
      `(sebelumnya ${b.username_lama}). Sesinya yang sedang berjalan tidak ` +
      `terputus; nama baru dipakai saat ia masuk berikutnya.`);
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
    setHasilSandi(
      `Sandi ${b.full_name} (${b.username}) diganti. ` +
      `${b.sesi_diputus} sesi yang sedang berjalan diputus.`);
    setSandiBaru("");
    void muatPengguna();
  };

  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

  const ringkasAgen = (h: any) =>
    `${h.baru} marketing baru · ${h.diperbarui} diperbarui · ` +
    `${h.dilewati} dilewati · ${h.rekening_baru} rekening dicatat · ` +
    `dari ${h.baris} orang`;

  const ringkasTerima = (h: any) =>
    `${h.diperbarui} unit diperbarui · ${h.sama} tidak berubah · ` +
    `${h.tak_dikenal} tak dikenal · ${h.ganda} ganda · dari ${h.baris} baris`;

  const ringkas = (h: Hasil) =>
    `${h.baru} penjualan baru · ${h.diperbarui} diperbarui · ` +
    `${h.dilewati} dilewati · ${h.marketing} marketing dikenali`;

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>Administrasi</h1>
        <p>
          Data penjualan dan akun pengguna. Seluruhnya dikerjakan dari layar
          ini — tidak ada langkah yang memerlukan baris perintah.
        </p>
      </div>
    }>

      {!bolehKelola && (
        <div className="banner warn">
          <b>Peran {labelPeran(sesi.role)} tidak berwenang atas menu ini</b>
          Unggah Laporan Penjualan, kalibrasi ambang tanda tangan, dan
          penggantian kata sandi seluruhnya dikerjakan Admin IT. Hubungi
          Admin IT bila kata sandi Anda perlu diganti.
        </div>
      )}

      {bolehKelola && (
        <>
          {/* ── Kontak Admin IT ── */}
          <div className="panel sp">
            <div className="form-blok">
              <h3>KONTAK ADMIN SISTEM</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                Tampil pada halaman masuk bagi orang yang lupa sandinya atau
                akunnya terkunci — merekalah yang tidak dapat menghubungi siapa
                pun lewat sistem ini. Dikosongkan berarti halaman masuk hanya
                menyarankan jalur biasa, bukan menampilkan nomor karangan.
              </p>
              <div className="filters">
                <div>
                  <div className="lbl">Nomor WhatsApp (mis. 628123456789)</div>
                  <input value={wa} inputMode="tel"
                         onChange={(e) => setWa(e.target.value)} />
                </div>
                <div>
                  <div className="lbl">Email</div>
                  <input value={email} type="email"
                         onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button className="pri" onClick={() => void simpanKontak()}>
                  Simpan kontak
                </button>
              </div>
              {hasilKontak && (
                <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
                  <b>Berhasil</b>{hasilKontak}
                </div>
              )}
              {galatKontak && (
                <div className="banner stop" style={{ marginTop: 12, marginBottom: 0 }}>
                  <b>Tidak dapat disimpan</b>{galatKontak}
                </div>
              )}
            </div>
          </div>

          {/* ── Kalibrasi ambang tanda tangan ── */}
          <div className="panel sp">
            <div className="form-blok">
              <h3>KALIBRASI AMBANG TANDA TANGAN</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                Mengukur sebaran skor pada spesimen yang tersimpan, lalu
                menghitung berapa tanda tangan sah yang akan ditolak (FRR) dan
                berapa tanda tangan orang lain yang akan diterima (FAR) pada tiap
                ambang. Tidak ada yang berubah sampai Anda menekan tombol pasang.
              </p>

              <table><tbody>
                <tr><td>Ambang berlaku sekarang</td>
                    <td className="n"><b>{kalStatus?.ambang ?? "—"}</b></td></tr>
                <tr><td>Terakhir dikalibrasi</td>
                    <td className="n">
                      {kalStatus?.dikalibrasi_pada
                        ? String(kalStatus.dikalibrasi_pada).slice(0, 10)
                        : "belum pernah"}
                    </td></tr>
              </tbody></table>

              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button className="pri" disabled={sibukKal}
                        onClick={() => void jalankanKalibrasi()}>
                  {sibukKal ? "Mengukur…" : "Jalankan pengukuran"}
                </button>
              </div>

              {galatKal && (
                <div className="banner stop" style={{ marginTop: 12 }}>
                  <b>Pengukuran gagal</b>{galatKal}
                </div>
              )}

              {kal && (
                <>
                  <div className="lbl" style={{ marginTop: 14 }}>Bahan pengukuran</div>
                  <table><tbody>
                    <tr><td>Orang dengan spesimen</td>
                        <td className="n">{kal.bahan.orang}</td></tr>
                    <tr><td>Spesimen</td>
                        <td className="n">{kal.bahan.spesimen}</td></tr>
                    <tr><td>Di antaranya direkam lewat layar pendaftaran</td>
                        <td className="n">{kal.bahan.dari_pendaftaran}</td></tr>
                    <tr><td>Pasangan asli / orang lain</td>
                        <td className="n">
                          {kal.bahan.pasangan_asli} / {kal.bahan.pasangan_tiruan}
                        </td></tr>
                    {kal.sebaran.asli && (
                      <tr><td>Skor tanda tangan asli (p05 · median · p95)</td>
                          <td className="n">
                            {kal.sebaran.asli.p05} · {kal.sebaran.asli.median} ·{" "}
                            {kal.sebaran.asli.p95}
                          </td></tr>
                    )}
                    {kal.sebaran.tiruan && (
                      <tr><td>Skor tanda tangan orang lain (p05 · median · p95)</td>
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
                      <b>Spesimen yang ada seluruhnya data contoh</b>
                      Tidak ada satu pun yang berasal dari layar pendaftaran —
                      tanda tangannya dibangkitkan program saat penyiapan, bukan
                      tanda tangan agent sungguhan. Angka di bawah menunjukkan
                      mesinnya bekerja, tetapi tidak menyatakan apa pun tentang
                      tanda tangan orang sungguhan — jangan dipasang ke produksi.
                    </div>
                  )}

                  <div className="lbl" style={{ marginTop: 14 }}>
                    FRR / FAR pada tiap ambang
                  </div>
                  <div className="tscroll">
                    <table><tbody>
                      <tr><th>Ambang</th><th>Ditolak padahal sah (FRR)</th>
                          <th>Diterima padahal orang lain (FAR)</th></tr>
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
                    <tr><td>Titik setimbang (EER)</td>
                        <td className="n">{kal.usul.eer ?? "—"}</td></tr>
                    <tr><td>Ambang terendah dengan FAR 0%</td>
                        <td className="n">{kal.usul.far_nol ?? "—"}</td></tr>
                    <tr><td>Ambang tertinggi dengan FRR ≤ 5%</td>
                        <td className="n">{kal.usul.frr_5 ?? "—"}</td></tr>
                  </tbody></table>

                  {kal.usul.far_nol == null && (
                    <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                      Tidak ada ambang yang membuat FAR 0% pada data ini — pada
                      setiap ambang masih ada tanda tangan orang lain yang lolos.
                      Kumpulkan spesimen dari lebih banyak orang sebelum menyetel
                      ambangnya.
                    </p>
                  )}

                  <div className="banner warn" style={{ marginTop: 12 }}>
                    <b>Yang belum dipenuhi protokol PRD 12.2</b>
                    <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                      {kal.protokol.kekurangan.map((k: string) => (
                        <li key={k} style={{ marginBottom: 3 }}>{k}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="lbl" style={{ marginTop: 14 }}>
                    Pasang ambang (1–100)
                  </div>
                  <div className="row" style={{ marginBottom: 0 }}>
                    <input value={ambangPilih} inputMode="numeric"
                           onChange={(e) => setAmbangPilih(e.target.value)}
                           style={{ width: 90 }} />
                    <button disabled={sibukKal || !ambangPilih}
                            onClick={() => void pasangAmbang()}>
                      Pasang ambang ini
                    </button>
                  </div>
                  <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                    Ambang tersimpan bersama bukti pengukurannya dan tercatat di
                    jejak audit. Percobaan tanda tangan lama tetap menyimpan ambang
                    yang berlaku saat itu, jadi riwayatnya tidak berubah arti.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ── Impor ── */}
          <div className="panel sp">
            <div className="form-blok">
              <h3>UNGGAH LAPORAN PENJUALAN</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                Berkas ekspor Laporan Penjualan (.xls). Lihat pratinjau lebih dulu —
                tidak ada yang ditulis sampai Anda menekan tombol tulis.
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
                  {sibukImpor ? "Membaca…" : "Lihat pratinjau"}
                </button>
                <button className="pri" disabled={!pratinjau || sibukImpor}
                        onClick={() => void kirimBerkas(false)}>
                  Tulis ke basis data
                </button>
              </div>
            </div>

            {galatImpor && (
              <div className="banner stop">
                <b>Berkas tidak dapat diimpor</b>{galatImpor}
              </div>
            )}

            {tertulis && (
              <div className="banner ok">
                <b>Impor selesai</b>
                {ringkas(tertulis)}
                <ul style={{ margin: "6px 0 0 16px" }}>
                  {tertulis.catatan.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}

            {pratinjau && (
              <>
                <div className="banner info">
                  <b>Pratinjau — belum ada yang ditulis</b>
                  {ringkas(pratinjau)}
                  <div style={{ marginTop: 4 }}>
                    {pratinjau.seksi.map((s) => `${s.nama}: ${s.baris} baris`)
                      .join(" · ")}
                  </div>
                </div>
                <div className="tscroll">
                  <table><tbody>
                    <tr>
                      <th>Unit</th><th>No. Kontrak</th><th>Tanggal</th>
                      <th>Status</th><th style={{ textAlign: "right" }}>Nilai</th>
                      <th>Sales</th><th>Tindakan</th>
                    </tr>
                    {pratinjau.pratinjau.map((p, i) => (
                      <tr key={`${p.kontrak}-${i}`}>
                        <td><b>{p.unit}</b></td>
                        <td>{p.kontrak ?? "—"}</td>
                        <td>{p.tanggal ?? (
                          <span style={{ color: "var(--stop)" }}>tidak terbaca</span>
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
              <h3>UNGGAH LAPORAN PENERIMAAN</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                Berkas ekspor Laporan Penerimaan Customer (.xls). Yang diambil
                kolom <b>s/d Bulan Ini</b> — penerimaan kumulatif sampai tanggal
                laporan — dan dituliskan ke kolom Penerimaan pada data penjualan.
                Angka itu menentukan prasyarat Cash Reward dan besaran Komisi.
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
                  {sibukTerima ? "Membaca…" : "Lihat pratinjau"}
                </button>
                <button className="pri"
                        disabled={!pratinjauTerima || sibukTerima}
                        onClick={() => void kirimPenerimaan(false)}>
                  Tulis ke basis data
                </button>
              </div>
            </div>

            {galatTerima && (
              <div className="banner stop">
                <b>Berkas tidak dapat diimpor</b>{galatTerima}
              </div>
            )}

            {tertulisTerima && (
              <div className="banner ok">
                <b>Impor penerimaan selesai</b>
                {ringkasTerima(tertulisTerima)}
                <ul style={{ margin: "6px 0 0 16px" }}>
                  {tertulisTerima.catatan.map((c: string) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}

            {pratinjauTerima && (
              <>
                <div className="banner info">
                  <b>Pratinjau — belum ada yang ditulis</b>
                  {ringkasTerima(pratinjauTerima)}
                </div>
                <div className="tscroll">
                  <table><tbody>
                    <tr>
                      <th>Unit</th><th>No. Kontrak</th><th>Pembeli</th>
                      <th style={{ textAlign: "right" }}>Penerimaan tercatat</th>
                      <th style={{ textAlign: "right" }}>Menjadi</th>
                      <th>% lunas</th><th>Tindakan</th>
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
              <h3>UNGGAH LAPORAN AGENT</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                Berkas ekspor Laporan Agent (.xls). Menyinkronkan data marketing:
                nama, agensi, <b>nomor WhatsApp</b>, email, NPWP, dan rekening.
                Nomor itulah tujuan kode verifikasi pendaftaran tanda tangan, dan
                tanpa nomor tautannya tidak dapat diterbitkan.
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
                  {sibukAgen ? "Membaca…" : "Lihat pratinjau"}
                </button>
                <button className="pri" disabled={!pratinjauAgen || sibukAgen}
                        onClick={() => void kirimAgen(false)}>
                  Tulis ke basis data
                </button>
              </div>
            </div>

            {galatAgen && (
              <div className="banner stop">
                <b>Berkas tidak dapat diimpor</b>{galatAgen}
              </div>
            )}

            {tertulisAgen && (
              <div className="banner ok">
                <b>Sinkronisasi selesai</b>
                {ringkasAgen(tertulisAgen)}
                <ul style={{ margin: "6px 0 0 16px" }}>
                  {tertulisAgen.catatan.map((c: string) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}

            {pratinjauAgen && (
              <>
                <div className="banner info">
                  <b>Pratinjau — belum ada yang ditulis</b>
                  {ringkasAgen(pratinjauAgen)}
                </div>
                <div className="tscroll">
                  <table><tbody>
                    <tr>
                      <th>Nama</th><th>Agensi</th><th>Tipe</th>
                      <th>Keagenan</th><th>Nomor WA</th><th>NPWP</th>
                      <th>Rekening</th><th>Tindakan</th>
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
                          <span style={{ color: "var(--stop)" }}>tidak ada</span>
                        )}</td>
                        <td>{p.npwp ? "ada" : "—"}</td>
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
              <h3>KOSONGKAN DATA OPERASIONAL</h3>
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                Menghapus data penjualan, marketing, rekening, klaim, tanda
                tangan, dan pendaftaran <b>milik project {sesi.project_name}</b>{" "}
                saja — project lain tidak disentuh. <b>Tidak dapat dibatalkan</b>:
                yang terhapus tidak ada salinannya di sistem ini.
              </p>
              <p className="hint" style={{ textAlign: "left" }}>
                Yang <b>tidak</b> disentuh: project lain, akun pengguna dan sesi
                Anda, skema insentif, tarif pajak, periode akuntansi, pengaturan
                dan kontak Admin IT, serta jejak audit — justru di sanalah
                pengosongan ini tercatat.
              </p>

              <div className="row" style={{ marginBottom: 0 }}>
                <button onClick={() => void lihatIsi()} disabled={sibukKosong}>
                  Lihat isi data sekarang
                </button>
              </div>
            </div>

            {galatKosong && (
              <div className="banner stop">
                <b>Tidak dapat dijalankan</b>{galatKosong}
              </div>
            )}

            {hasilKosong && (
              <div className="banner ok">
                <b>Data operasional dikosongkan</b>
                {Object.entries(hasilKosong.terhapus)
                  .filter(([, n]) => Number(n) > 0)
                  .map(([t, n]) => `${t}: ${n}`).join(" · ") || "sudah kosong"}
                <div style={{ marginTop: 4 }}>
                  Yang dipertahankan: {hasilKosong.dipertahankan.join(", ")}.
                </div>
              </div>
            )}

            {isiTabel && (
              <>
                <div className="banner stop">
                  <b>Baris berikut akan dihapus permanen dari project {sesi.project_name}</b>
                  Periksa angkanya sekali lagi. Setelah tombol ditekan, tidak ada
                  cara mengembalikannya.
                </div>
                <div className="tscroll">
                  <table><tbody>
                    <tr><th>Tabel</th><th style={{ textAlign: "right" }}>Baris</th></tr>
                    {Object.entries(isiTabel).map(([t, n]) => (
                      <tr key={t}>
                        <td><code>{t}</code></td>
                        <td className="n">{n}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>

                <div className="lbl" style={{ marginTop: 12 }}>
                  Ketik KOSONGKAN untuk menegaskan
                </div>
                <div className="row" style={{ marginBottom: 0 }}>
                  <input value={penegasan} placeholder="KOSONGKAN"
                         style={{ width: 200 }}
                         onChange={(e) => setPenegasan(e.target.value)} />
                  <button className="pri"
                          disabled={sibukKosong || penegasan.trim() !== "KOSONGKAN"}
                          onClick={() => void jalankanKosong()}>
                    {sibukKosong ? "Menghapus…" : "Hapus permanen"}
                  </button>
                  <button disabled={sibukKosong}
                          onClick={() => { setIsiTabel(null); setPenegasan(""); }}>
                    Batal
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Sandi pengguna lain ── */}
          <div className="panel">
            <div className="form-blok">
              <h3>AKUN PENGGUNA</h3>
              <div className="tscroll">
                <table><tbody>
                  <tr>
                    <th>Username</th><th>Nama</th><th>Peran</th>
                    <th>Sesi aktif</th><th>Terakhir masuk</th>
                  </tr>
                  {pengguna.map((u) => (
                    <tr key={u.username}>
                      <td><code>{u.username}</code></td>
                      <td>{u.full_name}</td>
                      <td>{labelPeran(u.role)}</td>
                      <td className="n">{u.sesi_aktif}</td>
                      <td>{u.terakhir_masuk
                        ? String(u.terakhir_masuk).slice(0, 19).replace("T", " ")
                        : <span style={{ color: "var(--mut)" }}>belum pernah</span>}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>

              <div className="filters" style={{ marginTop: 14 }}>
                <div>
                  <div className="lbl">Pengguna</div>
                  <select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">— pilih pengguna —</option>
                    {pengguna.map((u) => (
                      <option key={u.username} value={u.username}>
                        {u.username} — {u.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="lbl">Kata sandi baru (minimal 8 karakter)</div>
                  <input type="password" value={sandiBaru} autoComplete="new-password"
                         onChange={(e) => setSandiBaru(e.target.value)} />
                </div>
              </div>

              <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button className="pri"
                        disabled={!target || sandiBaru.length < 8}
                        onClick={() => void gantiSandiOrang()}>
                  Ganti sandi pengguna ini
                </button>
              </div>
              <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                Mengganti sandi memutus seluruh sesi pengguna itu yang sedang
                berjalan.
              </p>

              {hasilSandi && (
                <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
                  <b>Berhasil</b>{hasilSandi}
                </div>
              )}
              {galatSandi && (
                <div className="banner stop" style={{ marginTop: 12, marginBottom: 0 }}>
                  <b>Tidak dapat mengganti sandi</b>{galatSandi}
                </div>
              )}

              {/* ── Ganti username ──────────────────────────────────────────
                  Pengguna yang dipilih di atas, dipakai lagi di sini: dua
                  pemilih untuk satu orang yang sama hanya menambah kesempatan
                  mengganti sandi orang A sambil menamai ulang orang B. */}
              <div style={{ borderTop: "1px solid var(--line)", marginTop: 16,
                            paddingTop: 14 }}>
                <div className="lbl">
                  Username baru untuk pengguna yang dipilih di atas
                </div>
                <div className="row" style={{ marginBottom: 0 }}>
                  <input value={usernameBaru} autoComplete="off"
                         placeholder="3–32 karakter, huruf kecil"
                         style={{ minWidth: 240 }}
                         onChange={(e) => setUsernameBaru(e.target.value)} />
                  <button disabled={!target || usernameBaru.trim().length < 3}
                          onClick={() => void gantiUsername()}>
                    Ganti username
                  </button>
                </div>
                <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                  Huruf kecil, angka, titik, garis bawah, atau strip. Jejak audit
                  tidak dapat disunting, jadi entri lama tetap menyebut username
                  lama — penggantiannya sendiri ikut tercatat agar riwayat
                  sebelum dan sesudahnya masih dapat dirangkai. Sesi yang sedang
                  berjalan tidak terputus.
                </p>

                {hasilNama && (
                  <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
                    <b>Username diganti</b>{hasilNama}
                  </div>
                )}
                {galatNama && (
                  <div className="banner stop" style={{ marginTop: 12, marginBottom: 0 }}>
                    <b>Tidak dapat mengganti username</b>{galatNama}
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
