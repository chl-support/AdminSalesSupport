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

import { Nav } from "../nav";
import { BilahPengguna, labelPeran, useSesi } from "../session";

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
    return (
      <div className="wrap narrow">
        <p className="hint" style={{ marginTop: 40 }}>Memeriksa sesi…</p>
      </div>
    );
  }

  const ringkas = (h: Hasil) =>
    `${h.baru} penjualan baru · ${h.diperbarui} diperbarui · ` +
    `${h.dilewati} dilewati · ${h.marketing} marketing dikenali`;

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Administrasi</h1>
          <p>
            Data penjualan dan akun pengguna. Seluruhnya dikerjakan dari layar
            ini — tidak ada langkah yang memerlukan baris perintah.
          </p>
        </div>
        <div className="row" style={{ marginBottom: 0, alignItems: "flex-end" }}>
          <Nav peran={sesi.role} />
          <BilahPengguna sesi={sesi} />
        </div>
      </header>

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
    </div>
  );
}
