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
 * sini, setelah sepuluh goresannya benar-benar dilihat — bukan disimpulkan dari
 * angka konsistensi saja.
 */

import { useCallback, useEffect, useState } from "react";

import { Nav } from "../nav";
import { BilahPengguna, useSesi } from "../session";

type Baris = {
  id: string; full_name: string; marketing_type: string; status: string;
  phone: string | null; agency_name: string | null; spesimen: number;
  baseline_specimen_set_id: string | null;
  sesi_token: string | null; sesi_state: string | null;
  captured: number | null; target: number | null; consistency: number | null;
  sesi_set_id: string | null; expires_at: string | null;
};

const PILL: Record<string, string> = {
  active: "ok", pending_review: "warn", rejected: "stop",
};

export default function SpesimenPage() {
  const { sesi, memuat } = useSesi();
  const boleh = sesi?.role === "admin_sales" || sesi?.role === "admin_system";

  const [baris, setBaris] = useState<Baris[]>([]);
  const [ambang, setAmbang] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [kabar, setKabar] = useState<{ kind: string; html: string } | null>(null);
  const [lihat, setLihat] = useState<string | null>(null);
  const [citra, setCitra] = useState<any[]>([]);
  const [alasan, setAlasan] = useState("");
  const [saring, setSaring] = useState("semua");

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

  const kirimTautan = async (b: Baris) => {
    setBusy(true); setKabar(null);
    try {
      const r = await api(`/marketings/${b.id}/enrollment-requests`,
                          { method: "POST", body: "{}" });
      setKabar({ kind: "ok", html:
        `<b>Tautan pendaftaran untuk ${b.full_name} terkirim ke ${r.masked_phone}</b>
         Buka: <a href="/daftar-ttd/${r.token}" target="_blank">/daftar-ttd/${r.token}</a><br>
         Kode OTP (hanya demo): <b>${r.otp_demo}</b><br>
         Berlaku sampai ${String(r.expires_at).slice(0, 16).replace("T", " ")} ·
         ${r.target} tanda tangan diminta.` });
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>Tautan tidak dapat dibuat</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const bukaSet = async (setId: string) => {
    if (lihat === setId) { setLihat(null); setCitra([]); return; }
    const d = await api(`/marketings/specimens/${setId}`);
    setCitra(d.specimens ?? []);
    setLihat(setId);
    setAlasan("");
  };

  const putuskan = async (b: Baris, keputusan: "approve" | "reject") => {
    setBusy(true); setKabar(null);
    try {
      await api(`/marketings/${b.id}/specimen-review`, {
        method: "POST",
        body: JSON.stringify({ set_id: b.sesi_set_id, decision: keputusan,
                               reason: alasan }) });
      setKabar({ kind: "ok", html: keputusan === "approve"
        ? `<b>${b.full_name} aktif</b>Spesimennya kini dipakai menilai tanda
           tangan pada klaim. Set lama diarsipkan, tidak dihapus.`
        : `<b>Set ${b.full_name} ditolak</b>Kirimkan tautan pendaftaran baru
           bila ia perlu merekam ulang.` });
      setLihat(null); setCitra([]);
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>Tidak dapat diputuskan</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  if (memuat || !sesi) {
    return (
      <div className="wrap narrow">
        <p className="hint" style={{ marginTop: 40 }}>Memeriksa sesi…</p>
      </div>
    );
  }

  const terlihat = baris.filter((b) =>
    saring === "semua" ? true
    : saring === "belum" ? b.spesimen === 0
    : saring === "menunggu" ? b.sesi_state === "submitted"
    : b.status === "active");

  const menunggu = baris.filter((b) => b.sesi_state === "submitted").length;
  const belum = baris.filter((b) => b.spesimen === 0).length;

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Pendaftaran tanda tangan</h1>
          <p>
            Marketing tanpa spesimen tidak dapat dinilai otomatis — klaimnya
            selalu berakhir di pemeriksaan manual. Kirimkan tautan pendaftaran,
            lalu periksa hasilnya di sini sebelum diaktifkan.
          </p>
        </div>
        <div className="row" style={{ marginBottom: 0, alignItems: "flex-end" }}>
          <Nav peran={sesi.role} />
          <BilahPengguna sesi={sesi} />
        </div>
      </header>

      {!boleh ? (
        <div className="banner warn">
          <b>Peran Anda tidak berwenang atas pendaftaran tanda tangan</b>
          Hanya Admin Sales dan Admin Sistem yang dapat menerbitkan tautan dan
          memutuskan baseline.
        </div>
      ) : (
        <>
          <div className="banner info sp">
            <b>{belum} marketing belum punya spesimen · {menunggu} menunggu diperiksa</b>
            Tiap tautan meminta sepuluh tanda tangan, dan tiap goresan dicocokkan
            dengan goresan sebelumnya pada ambang {ambang ?? "—"} sebelum disimpan.
          </div>

          {kabar && (
            <div className={`banner ${kabar.kind}`}
                 dangerouslySetInnerHTML={{ __html: kabar.html }} />
          )}

          <div className="row sp">
            {[["semua", "Semua"], ["belum", "Belum punya spesimen"],
              ["menunggu", "Menunggu diperiksa"], ["aktif", "Sudah aktif"]]
              .map(([k, l]) => (
                <button key={k} className={saring === k ? "pri" : ""}
                        onClick={() => setSaring(k)}>{l}</button>
              ))}
            <button onClick={() => void muat()} disabled={busy}>Muat ulang</button>
          </div>

          <div className="panel">
            <div className="tscroll">
              <table>
                <tbody>
                  <tr>
                    <th>Marketing</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Spesimen</th>
                    <th>Pendaftaran berjalan</th>
                    <th style={{ width: 260 }}>Tindakan</th>
                  </tr>

                  {terlihat.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <b>{b.full_name}</b><br />
                        <span style={{ color: "var(--mut)", fontSize: 11 }}>
                          {b.marketing_type === "agent" ? "Agent" : "Inhouse"}
                          {b.agency_name ? ` · ${b.agency_name}` : ""}
                          {b.phone ? ` · ${b.phone}` : " · tanpa nomor telepon"}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${PILL[b.status] ?? ""}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="n">{b.spesimen}</td>
                      <td>
                        {b.sesi_state === "submitted" ? (
                          <>
                            <span className="pill warn">menunggu diperiksa</span><br />
                            <span style={{ fontSize: 11 }}>
                              {b.captured} tanda tangan · kemiripan {b.consistency}/100
                            </span>
                          </>
                        ) : ["sent", "opened", "capturing"].includes(b.sesi_state ?? "") ? (
                          <>
                            <span className="pill">sedang merekam</span><br />
                            <span style={{ fontSize: 11 }}>
                              {b.captured ?? 0} dari {b.target ?? 10}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: "var(--mut)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {b.sesi_state === "submitted" ? (
                          <button onClick={() => void bukaSet(b.sesi_set_id!)}>
                            {lihat === b.sesi_set_id ? "Tutup" : "Periksa spesimen"}
                          </button>
                        ) : (
                          <button className="pri" disabled={busy || !b.phone}
                                  onClick={() => void kirimTautan(b)}>
                            {b.spesimen ? "Kirim tautan pendaftaran ulang"
                                        : "Kirim tautan pendaftaran"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {!terlihat.length && (
                    <tr>
                      <td colSpan={5} style={{ color: "var(--mut)" }}>
                        Tidak ada marketing pada penyaringan ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {lihat && (
            <div className="panel sp">
              <h2>
                Spesimen yang diajukan
                <span className="pill">{citra.length} tanda tangan</span>
              </h2>
              <div className="petak-ttd">
                {citra.map((c) => (
                  <figure key={c.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image_png.startsWith("data:")
                               ? c.image_png
                               : `data:image/png;base64,${c.image_png}`}
                         alt={`Spesimen ${c.sequence}`} />
                    <figcaption>{c.sequence} · {c.input_method}</figcaption>
                  </figure>
                ))}
              </div>

              <p className="hint" style={{ textAlign: "left", marginTop: 10 }}>
                Yang perlu dilihat: apakah kesepuluhnya tampak berasal dari tangan
                yang sama, dan tidak ada yang tergores asal-asalan. Angka kemiripan
                tidak menangkap goresan yang rapi tetapi bukan tanda tangan orang
                itu.
              </p>

              {(() => {
                const b = baris.find((x) => x.sesi_set_id === lihat);
                if (!b) return null;
                return (
                  <>
                    <div className="lbl" style={{ marginTop: 10 }}>
                      Alasan (wajib bila ditolak, minimal 10 karakter)
                    </div>
                    <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)}
                              style={{ width: "100%", minHeight: 64 }} />
                    <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                      <button className="pri" disabled={busy}
                              onClick={() => void putuskan(b, "approve")}>
                        Setujui sebagai baseline
                      </button>
                      <button disabled={busy || alasan.trim().length < 10}
                              onClick={() => void putuskan(b, "reject")}>
                        Tolak set ini
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
