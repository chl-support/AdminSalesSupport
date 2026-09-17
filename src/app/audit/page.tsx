"use client";

/**
 * Jejak audit sebagai menu tersendiri.
 *
 * Sebelumnya ini satu panel di kaki konsol: 40 baris terakhir, digabung menjadi
 * satu blok teks. Bentuk itu membuang justru yang membuat jejak audit berguna —
 * `entity_type`, `before`, `after`, dan `ip_address` tidak pernah ditampilkan,
 * dan tanpa penyaringan satu-satunya cara menemukan satu peristiwa adalah
 * membacanya satu per satu sampai ketemu, kalau memang masih masuk 40 terakhir.
 *
 * Penyaringan dikerjakan server (lihat /api/audit). Yang ada di sini hanya
 * penyusun kuerinya, supaya filter tidak pernah berlaku hanya atas baris yang
 * kebetulan sudah terunduh.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const KATA = {
  id: {
    judul: "Jejak audit",
    pengantar:
      "Append-only: basis data menolak UPDATE dan DELETE lewat RULE, yang " +
      "berlaku bahkan bagi pemilik tabel. Entri yang keliru diperbaiki dengan " +
      "entri baru, tidak pernah dengan menyuntingnya.",
    peranBisa: (peran: string) =>
      `Peran ${peran}: dapat membaca dan membubuhkan koreksi`,
    peranBaca: (peran: string) => `Peran ${peran}: hanya dapat membaca`,
    kabarBisa:
      "Koreksi tidak menyunting entri lama. Ia ditambahkan sebagai entri baru " +
      "yang menunjuk entri yang dikoreksi, sehingga riwayat koreksinya pun " +
      "ikut terekam.",
    kabarBaca:
      "Jejak audit tidak dapat diubah dari peran ini. Pembubuhan koreksi hanya " +
      "dapat dilakukan Finance (Pajak), Finance Manager, dan Head Finance.",
    saring: "Saring",
    entriCocok: (n: number, tersaring: boolean) =>
      `${n} entri cocok${tersaring ? " dari filter ini" : ""}`,
    cari: "Cari (aksi, alasan, aktor, entitas)",
    contohCari: "mis. tax_verification",
    aktor: "Aktor", aksi: "Aksi", jenisEntitas: "Jenis entitas",
    sejak: "Sejak", sampai: "Sampai", semua: "semua",
    tersaringJudul: "Tersaring pada satu entitas",
    tersaringIsi: "— hanya peristiwa milik entitas ini yang ditampilkan.",
    tampilkanSemua: "Tampilkan semua",
    bersihkan: "Bersihkan filter",
    galatBaca: "Jejak audit tidak dapat dibaca",
    entri: "Entri",
    dariDitampilkan: (n: number, total: number) => `${n} dari ${total} ditampilkan`,
    thWaktu: "Waktu", thAktor: "Aktor", thAksi: "Aksi", thEntitas: "Entitas",
    thAlasan: "Alasan",
    pillKoreksi: "koreksi",
    thBidang: "Bidang", thDari: "Dari", thMenjadi: "Menjadi",
    takBerubah: "Tidak ada bidang yang berubah pada entri ini.",
    tutup: "Tutup", rincian: "Rincian", koreksi: "Koreksi",
    belumAda: "Belum ada entri audit.",
    takCocok: "Tidak ada entri yang cocok dengan filter ini.",
    memuat: "Memuat…",
    muatBerikutnya: (n: number) => `Muat ${n} berikutnya`,
    muatUlang: "Muat ulang",
    tanyaKoreksi:
      "Alasan koreksi atas entri ini.\n\n" +
      "Entri asli tidak akan berubah maupun hilang — koreksi tercatat sebagai " +
      "entri baru yang menunjuk entri lama.",
    alasanKosong: "Alasan koreksi tidak boleh kosong.",
  },
  en: {
    judul: "Audit trail",
    pengantar:
      "Append-only: the database refuses UPDATE and DELETE through a RULE, " +
      "which applies even to the table owner. A mistaken entry is corrected " +
      "with a new entry, never by editing it.",
    peranBisa: (peran: string) =>
      `Role ${peran}: can read and append corrections`,
    peranBaca: (peran: string) => `Role ${peran}: read-only`,
    kabarBisa:
      "A correction does not edit the old entry. It is appended as a new entry " +
      "pointing at the one being corrected, so the correction history is " +
      "recorded too.",
    kabarBaca:
      "The audit trail cannot be changed from this role. Corrections can only " +
      "be appended by Finance (Tax), Finance Manager, and Head Finance.",
    saring: "Filter",
    entriCocok: (n: number, tersaring: boolean) =>
      `${n} entries match${tersaring ? " this filter" : ""}`,
    cari: "Search (action, reason, actor, entity)",
    contohCari: "e.g. tax_verification",
    aktor: "Actor", aksi: "Action", jenisEntitas: "Entity type",
    sejak: "From", sampai: "To", semua: "all",
    tersaringJudul: "Filtered to a single entity",
    tersaringIsi: "— only events belonging to this entity are shown.",
    tampilkanSemua: "Show all",
    bersihkan: "Clear filters",
    galatBaca: "The audit trail could not be read",
    entri: "Entries",
    dariDitampilkan: (n: number, total: number) => `${n} of ${total} shown`,
    thWaktu: "Time", thAktor: "Actor", thAksi: "Action", thEntitas: "Entity",
    thAlasan: "Reason",
    pillKoreksi: "correction",
    thBidang: "Field", thDari: "From", thMenjadi: "To",
    takBerubah: "No field changed in this entry.",
    tutup: "Close", rincian: "Details", koreksi: "Correct",
    belumAda: "No audit entries yet.",
    takCocok: "No entries match this filter.",
    memuat: "Loading…",
    muatBerikutnya: (n: number) => `Load ${n} more`,
    muatUlang: "Reload",
    tanyaKoreksi:
      "Reason for correcting this entry.\n\n" +
      "The original entry will neither change nor disappear — the correction " +
      "is recorded as a new entry pointing at the old one.",
    alasanKosong: "The correction reason cannot be empty.",
  },
};

const HALAMAN = 50;

type Entry = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor: string | null;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  reason: string | null;
  ip_address: string | null;
  occurred_at: string;
};

type Facets = { actors: string[]; actions: string[]; entity_types: string[] };

type Viewer = { username: string; role: string; can_annotate: boolean };

type Filter = {
  q: string; actor: string; action: string; entity_type: string;
  entity_id: string; since: string; until: string;
};

const KOSONG: Filter = {
  q: "", actor: "", action: "", entity_type: "", entity_id: "", since: "", until: "",
};

const waktu = (s: string) => String(s).slice(0, 19).replace("T", " ");

/**
 * Bidang yang benar-benar berubah, bukan seluruh isi before dan after.
 *
 * Entri audit kerap membawa salinan baris yang utuh. Menampilkannya apa adanya
 * menuntut pembacanya membandingkan dua blok JSON dengan mata untuk menemukan
 * satu kolom yang berubah — pekerjaan yang justru ingin dihindari.
 */
function perubahan(before: Record<string, any> | null, after: Record<string, any> | null) {
  const kunci = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const tulis = (v: any) =>
    v === undefined ? "—" : v === null ? "null"
      : typeof v === "object" ? JSON.stringify(v) : String(v);
  return kunci
    .map((k) => ({ k, dari: tulis(before?.[k]), ke: tulis(after?.[k]) }))
    .filter((r) => r.dari !== r.ke);
}

export default function AuditPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [filter, setFilter] = useState<Filter>(KOSONG);
  // Filter disimpan juga di ref agar pemuatan ulang saat pengguna berganti
  // memakai filter yang sedang berlaku, bukan salinan basi dari closure.
  const filterRef = useRef<Filter>(KOSONG);
  const [rows, setRows] = useState<Entry[]>([]);
  const [facets, setFacets] = useState<Facets>(
    { actors: [], actions: [], entity_types: [] });
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [buka, setBuka] = useState<string | null>(null);

  const muat = useCallback(async (f: Filter, offset: number) => {
    setBusy(true);
    setGalat(null);
    try {
      const qs = new URLSearchParams({ limit: String(HALAMAN), offset: String(offset) });
      for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
      // Cookie sesi terkirim sendiri; tidak ada header identitas yang dikarang.
      const res = await fetch(`/api/audit?${qs}`);
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) throw new Error(body.detail ?? body.title ?? `HTTP ${res.status}`);
      // Offset 0 berarti kueri baru; selain itu baris ditambahkan ke bawah.
      setRows((prev) => (offset === 0 ? body.rows : [...prev, ...body.rows]));
      setFacets(body.facets);
      setTotal(body.total);
      setHasMore(body.has_more);
      setViewer(body.viewer ?? null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
      if (offset === 0) { setRows([]); setTotal(0); setHasMore(false); }
      setViewer(null);
    } finally {
      setBusy(false);
    }
  }, []);

  // Tautan masuk dari konsol membawa entity_id, supaya "lihat jejak klaim ini"
  // mendarat pada hasil yang sudah tersaring, bukan pada daftar penuh.
  useEffect(() => {
    const awal = new URLSearchParams(window.location.search).get("entity_id") ?? "";
    const f = awal ? { ...KOSONG, entity_id: awal } : KOSONG;
    filterRef.current = f;
    setFilter(f);
  }, []);

  // Menunggu sesi: memanggil API sebelum identitasnya pasti hanya menghasilkan
  // 401 dan pengalihan yang tidak perlu.
  useEffect(() => {
    if (sesi) void muat(filterRef.current, 0);
  }, [sesi, muat]);

  const ubah = (k: keyof Filter, v: string) => {
    const f = { ...filter, [k]: v };
    filterRef.current = f;
    setFilter(f);
    void muat(f, 0);
  };

  /**
   * Koreksi tidak menyunting apa pun: ia menambahkan entri baru yang menunjuk
   * entri lama. Kata-kata pada konfirmasi sengaja menyebutkan itu, supaya tidak
   * ada yang mengira entri keliru akan hilang setelahnya.
   */
  const koreksi = async (entryId: string) => {
    const alasan = window.prompt(k.tanyaKoreksi);
    if (alasan === null) return;
    if (!alasan.trim()) { setGalat(k.alasanKosong); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_id: entryId, reason: alasan }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.detail ?? b.title ?? `HTTP ${res.status}`);
      setGalat(null);
      await muat(filterRef.current, 0);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const bersih = Object.values(filter).every((v) => !v);

  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      {viewer && (
        <div className={`banner ${viewer.can_annotate ? "info" : "warn"} sp`}>
          <b>
            {viewer.can_annotate
              ? k.peranBisa(viewer.role) : k.peranBaca(viewer.role)}
          </b>
          {viewer.can_annotate ? k.kabarBisa : k.kabarBaca}
        </div>
      )}

      <div className="panel sp">
        <h2>
          {k.saring}
          <span className="pill">{k.entriCocok(total, !bersih)}</span>
        </h2>

        <div className="filters">
          <div>
            <div className="lbl">{k.cari}</div>
            <input value={filter.q} placeholder={k.contohCari}
                   onChange={(e) => ubah("q", e.target.value)} />
          </div>
          <div>
            <div className="lbl">{k.aktor}</div>
            <select value={filter.actor} onChange={(e) => ubah("actor", e.target.value)}>
              <option value="">{k.semua}</option>
              {facets.actors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <div className="lbl">{k.aksi}</div>
            <select value={filter.action} onChange={(e) => ubah("action", e.target.value)}>
              <option value="">{k.semua}</option>
              {facets.actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <div className="lbl">{k.jenisEntitas}</div>
            <select value={filter.entity_type}
                    onChange={(e) => ubah("entity_type", e.target.value)}>
              <option value="">{k.semua}</option>
              {facets.entity_types.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <div className="lbl">{k.sejak}</div>
            <input type="date" value={filter.since}
                   onChange={(e) => ubah("since", e.target.value)} />
          </div>
          <div>
            <div className="lbl">{k.sampai}</div>
            <input type="date" value={filter.until}
                   onChange={(e) => ubah("until", e.target.value)} />
          </div>
        </div>

        {filter.entity_id && (
          <div className="banner info" style={{ marginTop: 12, marginBottom: 0 }}>
            <b>{k.tersaringJudul}</b>
            <code>{filter.entity_id}</code> {k.tersaringIsi}{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); ubah("entity_id", ""); }}>
              {k.tampilkanSemua}
            </a>
          </div>
        )}

        {!bersih && (
          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button onClick={() => { setFilter(KOSONG); void muat(KOSONG, 0); }}>
              {k.bersihkan}
            </button>
          </div>
        )}
      </div>

      {galat && (
        <div className="banner stop">
          <b>{k.galatBaca}</b>
          {galat}
        </div>
      )}

      <div className="panel">
        <h2>
          {k.entri}
          <span className="pill">{k.dariDitampilkan(rows.length, total)}</span>
        </h2>

        <div className="tscroll">
        <table>
          <tbody>
            <tr>
              <th style={{ width: 150 }}>{k.thWaktu}</th>
              <th style={{ width: 110 }}>{k.thAktor}</th>
              <th>{k.thAksi}</th>
              <th style={{ width: 150 }}>{k.thEntitas}</th>
              <th>{k.thAlasan}</th>
              <th style={{ width: 1 }}></th>
            </tr>
            {rows.map((e) => {
              const diff = perubahan(e.before, e.after);
              const terbuka = buka === e.id;
              const adaRincian = diff.length > 0 || Boolean(e.ip_address);
              return (
                <tr key={e.id} className={terbuka ? "terbuka" : undefined}>
                  <td style={{ whiteSpace: "nowrap" }}>{waktu(e.occurred_at)}</td>
                  <td>{e.actor ?? <span style={{ color: "var(--mut)" }}>system</span>}</td>
                  <td>
                    <code>{e.action}</code>
                    {e.action === "audit_correction" && (
                      <>
                        {" "}
                        <span className="pill warn">{k.pillKoreksi}</span>
                      </>
                    )}
                  </td>
                  <td>
                    {e.entity_type}
                    {e.entity_id && (
                      <>
                        <br />
                        <a href="#" style={{ fontSize: 11 }}
                           onClick={(ev) => { ev.preventDefault(); ubah("entity_id", e.entity_id!); }}>
                          {e.entity_id.slice(0, 8)}…
                        </a>
                      </>
                    )}
                  </td>
                  <td>
                    {e.reason ?? <span style={{ color: "var(--mut)" }}>—</span>}
                    {terbuka && (
                      <div className="rincian">
                        {diff.length > 0 ? (
                          <table>
                            <tbody>
                              <tr><th>{k.thBidang}</th><th>{k.thDari}</th>
                                  <th>{k.thMenjadi}</th></tr>
                              {diff.map((d) => (
                                <tr key={d.k}>
                                  <td><code>{d.k}</code></td>
                                  <td>{d.dari}</td>
                                  <td style={{ color: "var(--ink)" }}>{d.ke}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ margin: 0, color: "var(--mut)" }}>
                            {k.takBerubah}
                          </p>
                        )}
                        {e.ip_address && (
                          <p style={{ margin: "6px 0 0", color: "var(--mut)" }}>
                            IP: <code>{e.ip_address}</code>
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {adaRincian && (
                      <button style={{ padding: "2px 7px", fontSize: 11 }}
                              onClick={() => setBuka(terbuka ? null : e.id)}>
                        {terbuka ? k.tutup : k.rincian}
                      </button>
                    )}
                    {/* Tombol ini hanya kenyamanan; penolakannya tetap di server. */}
                    {viewer?.can_annotate && e.action !== "audit_correction" && (
                      <button style={{ padding: "2px 7px", fontSize: 11, marginLeft: 4 }}
                              disabled={busy} onClick={() => void koreksi(e.id)}>
                        {k.koreksi}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && !busy && (
              <tr>
                <td colSpan={6} style={{ color: "var(--mut)" }}>
                  {bersih ? k.belumAda : k.takCocok}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
          {hasMore && (
            <button onClick={() => void muat(filter, rows.length)} disabled={busy}>
              {busy ? k.memuat
                    : k.muatBerikutnya(Math.min(HALAMAN, total - rows.length))}
            </button>
          )}
          <button onClick={() => void muat(filter, 0)} disabled={busy}>
            {k.muatUlang}
          </button>
        </div>
      </div>
    </Kerangka>
  );
}
