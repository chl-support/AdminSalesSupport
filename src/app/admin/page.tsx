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

  // ── Sandi orang lain ──
  const [pengguna, setPengguna] = useState<Pengguna[]>([]);
  const [target, setTarget] = useState("");
  const [sandiBaru, setSandiBaru] = useState("");
  const [hasilSandi, setHasilSandi] = useState<string | null>(null);
  const [galatSandi, setGalatSandi] = useState<string | null>(null);

  // ── Sandi sendiri ──
  // Kalibrasi ambang tanda tangan.
  const [kal, setKal] = useState<any>(null);
  const [kalStatus, setKalStatus] = useState<any>(null);
  const [sibukKal, setSibukKal] = useState(false);
  const [galatKal, setGalatKal] = useState<string | null>(null);
  const [ambangPilih, setAmbangPilih] = useState("");

  const [sandiLama, setSandiLama] = useState("");
  const [sandiSaya, setSandiSaya] = useState("");
  const [hasilSaya, setHasilSaya] = useState<string | null>(null);
  const [galatSaya, setGalatSaya] = useState<string | null>(null);

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

  const gantiSandiSaya = async () => {
    setGalatSaya(null);
    setHasilSaya(null);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_password: sandiLama, new_password: sandiSaya,
      }),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setGalatSaya(b.detail ?? b.title ?? `HTTP ${res.status}`); return; }
    setHasilSaya(
      `Sandi Anda diganti. ${b.sesi_lain_diputus} sesi di perangkat lain diputus; ` +
      `layar ini tetap terbuka.`);
    setSandiLama(""); setSandiSaya("");
  };

  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

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

      {/* ── Ganti sandi sendiri: terbuka bagi semua peran ── */}
      <div className="panel sp">
        <div className="form-blok">
          <h3>GANTI KATA SANDI SAYA</h3>
          <div className="filters">
            <div>
              <div className="lbl">Kata sandi sekarang</div>
              <input type="password" value={sandiLama} autoComplete="current-password"
                     onChange={(e) => setSandiLama(e.target.value)} />
            </div>
            <div>
              <div className="lbl">Kata sandi baru (minimal 8 karakter)</div>
              <input type="password" value={sandiSaya} autoComplete="new-password"
                     onChange={(e) => setSandiSaya(e.target.value)} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="pri"
                    disabled={!sandiLama || sandiSaya.length < 8}
                    onClick={() => void gantiSandiSaya()}>
              Ganti sandi saya
            </button>
          </div>
          {hasilSaya && (
            <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
              <b>Berhasil</b>{hasilSaya}
            </div>
          )}
          {galatSaya && (
            <div className="banner stop" style={{ marginTop: 12, marginBottom: 0 }}>
              <b>Tidak dapat mengganti sandi</b>{galatSaya}
            </div>
          )}
        </div>
      </div>

      {!bolehKelola && (
        <div className="banner warn">
          <b>Peran {labelPeran(sesi.role)}: hanya dapat mengganti sandi sendiri</b>
          Unggah Laporan Penjualan dan penggantian sandi pengguna lain hanya dapat
          dilakukan Admin Sistem.
        </div>
      )}

      {bolehKelola && (
        <>
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

          {/* ── Sandi pengguna lain ── */}
          <div className="panel">
            <div className="form-blok">
              <h3>KATA SANDI PENGGUNA</h3>
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
            </div>
          </div>
        </>
      )}
    </Kerangka>
  );
}
