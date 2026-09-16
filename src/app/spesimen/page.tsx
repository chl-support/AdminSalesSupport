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

import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

type Baris = {
  id: string; full_name: string; marketing_type: string; status: string;
  phone: string | null; agency_name: string | null; spesimen: number;
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

export default function SpesimenPage() {
  const { sesi, memuat } = useSesi();
  const boleh = sesi?.role === "admin_sales" || sesi?.role === "admin_system";

  const [baris, setBaris] = useState<Baris[]>([]);
  const [ambang, setAmbang] = useState<number | null>(null);
  const [jumlahSpesimen, setJumlahSpesimen] = useState<number | null>(null);
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
    setJumlahSpesimen(d.jumlah_spesimen ?? null);
  }, [api, boleh]);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  // Esc menutup pop-up, sama seperti pop-up lain di sistem ini.
  useEffect(() => {
    if (!lihat) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") tutupSet(); };
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
        `<b>Tautan pendaftaran untuk ${b.full_name} terkirim ke ${r.masked_phone}</b>
         Buka: <a href="/daftar-ttd/${r.token}" target="_blank">/daftar-ttd/${r.token}</a><br>
         Kode OTP (hanya demo): <b>${r.otp_demo}</b><br>
         Berlaku sampai ${String(r.expires_at).slice(0, 16).replace("T", " ")} ·
         ${r.target} tanda tangan diminta.` });
      setRevisi(null); setAlasanRevisi("");
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>Tautan tidak dapat dibuat</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const simpanNomor = async (b: Baris) => {
    setBusy(true); setKabar(null);
    try {
      const r = await api(`/marketings/${b.id}`, {
        method: "PATCH", body: JSON.stringify({ phone: nomorBaru }) });
      setKabar({ kind: "ok", html:
        `<b>Nomor ${b.full_name} tersimpan</b>Tersimpan sebagai ${r.phone}.
         Tautan pendaftaran kini dapat diterbitkan.` });
      setNomor(null); setNomorBaru("");
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>Nomor tidak dapat disimpan</b>${e.body?.detail ?? ""}` });
    } finally { setBusy(false); }
  };

  const tutupSet = () => { setLihat(null); setCitra([]); setBerkas(null); };

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
          `<b>Set ini tidak berisi tanda tangan</b>Perekamannya terputus sebelum
           satu goresan pun tersimpan. Mintalah tautan revisi.` });
      }
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>Spesimen tidak dapat dibuka</b>${e.body?.detail ?? "Coba muat ulang halaman."}` });
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
        ? `<b>${b.full_name} aktif</b>Spesimennya kini dipakai menilai tanda
           tangan pada klaim. Set lama diarsipkan, tidak dihapus.`
        : `<b>Set ${b.full_name} ditolak</b>Kirimkan tautan pendaftaran baru
           bila ia perlu merekam ulang.` });
      tutupSet();
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", html:
        `<b>Tidak dapat diputuskan</b>${e.body?.detail ?? ""}` });
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

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>Data Marketing</h1>
        <p>
          Spesimen tanda tangan didaftarkan sekali per orang dan dipakai
          seterusnya sebagai pembanding. Yang belum punya, kirimkan tautannya
          dari sini; yang sudah, tautannya tidak muncul lagi kecuali Anda
          meminta revisi.
        </p>
      </div>
    }>

      {!boleh ? (
        <div className="banner warn">
          <b>Peran Anda tidak berwenang atas pendaftaran tanda tangan</b>
          Hanya Admin Sales dan Admin IT yang dapat menerbitkan tautan dan
          memutuskan baseline.
        </div>
      ) : (
        <>
          <div className="banner info sp">
            <b>{belum} marketing belum punya spesimen · {menunggu} menunggu diperiksa</b>
            Tiap tautan meminta foto KTP sebagai jangkar identitas, lalu
            {" "}{jumlahSpesimen ?? "beberapa"} tanda tangan yang tiap goresannya
            dicocokkan dengan goresan sebelumnya pada ambang {ambang ?? "—"}{" "}
            sebelum disimpan.
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
                    <th>Jangkar KTP</th>
                    <th>Pendaftaran berjalan</th>
                    <th style={{ width: 250 }}>Tindakan</th>
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
                                  title="Ubah nomor telepon"
                                  onClick={() => { setNomor(b.id); setNomorBaru(b.phone ?? ""); }}>
                            {b.phone || "tanpa nomor telepon"}
                          </button>
                        </span>
                        {nomor === b.id && (
                          <div className="row" style={{ marginTop: 6, marginBottom: 0 }}>
                            <input value={nomorBaru} autoFocus inputMode="tel"
                                   placeholder="08xxxxxxxxxx" style={{ width: 150 }}
                                   onChange={(e) => setNomorBaru(e.target.value)} />
                            <button className="pri" disabled={busy}
                                    onClick={() => void simpanNomor(b)}>Simpan</button>
                            <button onClick={() => { setNomor(null); setNomorBaru(""); }}>
                              Batal
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${PILL[b.status] ?? ""}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="n">{b.spesimen}</td>
                      <td>
                        {b.punya_ktp ? (
                          <>
                            <span className="pill ok">ada</span><br />
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
                            <span className="pill warn">menunggu diperiksa</span><br />
                            <span style={{ fontSize: 11 }}>
                              {b.captured} tanda tangan · kemiripan {b.consistency}/100
                            </span>
                          </>
                        ) : ["sent", "opened", "capturing"].includes(b.sesi_state ?? "") ? (
                          <>
                            <span className="pill">sedang merekam</span><br />
                            <span style={{ fontSize: 11 }}>
                              {b.captured ?? 0} dari {b.target ?? jumlahSpesimen ?? 5}
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
                            {lihat === b.sesi_set_id ? "Tutup" : "Periksa spesimen"}
                          </button>
                        ) : ["sent", "opened", "capturing"].includes(b.sesi_state ?? "") ? (
                          <span style={{ fontSize: 11.5, color: "var(--mut)" }}>
                            Tautan sudah dikirim dan masih berlaku.
                          </span>
                        ) : b.spesimen > 0 ? (
                          /* Sudah punya spesimen: tautannya tidak muncul lagi.
                             Spesimen adalah pembanding pembayaran orang ini —
                             menerbitkan tautan baru sekali klik berarti ia dapat
                             menggantinya sendiri tanpa jejak alasan. */
                          revisi === b.id ? (
                            <>
                              <textarea value={alasanRevisi} autoFocus
                                        placeholder="Alasan revisi, minimal 10 karakter"
                                        style={{ width: "100%", minHeight: 56 }}
                                        onChange={(e) => setAlasanRevisi(e.target.value)} />
                              <div className="row" style={{ marginTop: 6, marginBottom: 0 }}>
                                <button className="pri"
                                        disabled={busy || alasanRevisi.trim().length < 10}
                                        onClick={() => void kirimTautan(b, { revisi: true })}>
                                  Terbitkan tautan revisi
                                </button>
                                <button onClick={() => { setRevisi(null); setAlasanRevisi(""); }}>
                                  Batal
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="pill ok">sudah terdaftar</span>
                              <button style={{ marginTop: 6 }}
                                      onClick={() => { setRevisi(b.id); setAlasanRevisi(""); }}>
                                Minta revisi
                              </button>
                            </>
                          )
                        ) : !b.phone ? (
                          /* Tanpa nomor, kode verifikasi tidak punya tujuan.
                             Sebelumnya tombolnya hanya dimatikan tanpa sebab
                             yang terbaca, sehingga barisnya tampak rusak. */
                          <span style={{ fontSize: 11.5, color: "var(--mut)" }}>
                            Nomor telepon belum terisi. Isi nomornya pada kolom
                            Marketing lebih dulu.
                          </span>
                        ) : (
                          <button className="pri" disabled={busy}
                                  onClick={() => void kirimTautan(b)}>
                            Kirim tautan pendaftaran
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {!terlihat.length && (
                    <tr>
                      <td colSpan={6} style={{ color: "var(--mut)" }}>
                        Tidak ada marketing pada penyaringan ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pemeriksaan dibuka sebagai pop-up, bukan panel di bawah tabel.
              Pada daftar marketing yang panjang panelnya jatuh jauh di luar
              layar, sehingga menekan "Periksa spesimen" tampak tidak
              menghasilkan apa-apa. Sebagai pop-up ia muncul di depan baris yang
              ditekan, dan keputusannya diambil di tempat yang sama. */}
          {lihat && (
            <div className="tirai"
                 onMouseDown={(e) => {
                   if (e.target === e.currentTarget) tutupSet();
                 }}>
              <div className="popup lebar" role="dialog" aria-modal="true"
                   aria-label="Spesimen yang diajukan">
                <div className="popup-kepala">
                  <h2>
                    Spesimen {baris.find((x) => x.sesi_set_id === lihat)?.full_name}
                    <span className="pill">{citra.length} tanda tangan</span>
                  </h2>
                  <button className="tautan" onClick={tutupSet}
                          aria-label="Tutup">✕</button>
                </div>

                <div className="popup-isi">
              {berkas?.revision_reason && (
                <div className="banner warn">
                  <b>Ini perekaman ulang</b>
                  Alasan yang dicatat saat tautannya diterbitkan:
                  “{berkas.revision_reason}”.
                </div>
              )}

              {/* Jangkar identitas, ditaruh sebelum petak spesimen: pertanyaan
                  pertama bukan "apakah semuanya mirip satu sama lain"
                  melainkan "apakah ini orangnya". Sepuluh tanda tangan palsu
                  yang konsisten juga lolos pertanyaan pertama. */}
              <div className="lbl" style={{ marginTop: 4 }}>
                Tanda tangan pada KTP
              </div>
              {berkas?.ktp_signature_png ? (
                <div className="jangkar">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={berkas.ktp_signature_png} alt="Tanda tangan pada KTP" />
                  <div>
                    <p style={{ margin: 0, fontSize: 12.5 }}>
                      Bandingkan bentuknya dengan goresan-goresan di bawah.
                      Beda media — pulpen di kertas lawan jari di layar — jadi
                      tidak akan sama persis; yang dicari kesamaan susunan dan
                      ciri khasnya, bukan kemiripan garis demi garis.
                    </p>
                    {berkas?.ada_foto_ktp && (
                      <p style={{ margin: "8px 0 0", fontSize: 12.5 }}>
                        <a href={`/api/marketings/specimens/${lihat}/ktp`}>
                          Unduh foto KTP untuk diperiksa
                        </a>{" "}
                        — terhapus otomatis begitu Anda memutuskan.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="banner warn">
                  <b>Tidak ada jangkar KTP pada pendaftaran ini</b>
                  Set ini direkam sebelum KTP diwajibkan, atau fotonya sudah
                  dihapus. Yang dapat Anda nilai hanya konsistensi antar goresan
                  — dan tanda tangan palsu yang konsisten juga lolos itu.
                </div>
              )}
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
                Yang perlu dilihat: apakah semuanya tampak berasal dari tangan
                yang sama, dan tidak ada yang tergores asal-asalan. Angka kemiripan
                tidak menangkap goresan yang rapi tetapi bukan tanda tangan orang
                itu.
              </p>
                </div>

                <div className="popup-kaki">
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
              </div>
            </div>
          )}
        </>
      )}
    </Kerangka>
  );
}
