"use client";

/**
 * Langkah 2: data penjualan, dengan kolom klaim di kanan.
 *
 * Tiga keadaan per baris, dan ketiganya sengaja ditampilkan — bukan disaring
 * habis menjadi "yang bisa diklaim saja":
 *
 *   - belum diklaim dan prasyaratnya terpenuhi  → tombol Klaim
 *   - sudah ada klaim aktif                     → nomor dan statusnya
 *   - prasyaratnya belum terpenuhi              → apa yang kurang
 *
 * Menyembunyikan dua keadaan terakhir membuat unit yang hilang dari daftar tidak
 * dapat dijelaskan: orang yang mencarinya tidak punya cara tahu apakah unitnya
 * sudah diklaim orang lain atau memang belum memenuhi syarat.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useBahasa, useKata } from "../../bahasa";
import { Kerangka, MemeriksaSesi } from "../../kerangka";
import { useSesi } from "../../session";
import { NAMA_EN, PRASYARAT_EN, jenisDari } from "../jenis";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;

/** Prasyarat pencairan, sama urutannya dengan yang dicatat di basis data. */
const PRASYARAT = [
  { kolom: "spu_signed",
    id: ["SPU sudah ditandatangani pemesan",
         "Syarat Closing Fee, Komisi, dan Cash Reward."],
    en: ["The SPU has been signed by the buyer",
         "Required for Closing Fee, Commission, and Cash Reward."] },
  { kolom: "ppjb_signed",
    id: ["PPJB sudah ditandatangani pemesan",
         "Syarat Komisi dan Cash Reward."],
    en: ["The PPJB has been signed by the buyer",
         "Required for Commission and Cash Reward."] },
  { kolom: "dp_received",
    id: ["DP / angsuran pertama sudah diterima", "Syarat Cash Reward."],
    en: ["The down payment or first instalment has been received",
         "Required for Cash Reward."] },
  { kolom: "sign_p3u",
    id: ["Unit sudah Sign P3U", "Syarat Overriding."],
    en: ["The unit has been Sign P3U", "Required for Overriding."] },
] as const;

/**
 * Sebab unit belum dapat diklaim, dari kode yang dikirim server.
 *
 * Nomor BR-nya mengikuti jenis klaim yang sedang dibuka, sama seperti saat
 * kalimatnya masih dirakit di server — aturan yang sama, ditulis sekali.
 */
const BR: Record<string, string> = {
  closing_fee: "BR-01", commission: "BR-02",
  cash_reward: "BR-03", overriding: "BR-04",
};

const SEBAB = {
  id: {
    unit_cancelled: () => "Unit sudah dibatalkan.",
    unit_moved: () => "Unit sudah dipindahkan ke unit lain.",
    unit_management: () => "Unit management — tidak menghasilkan insentif.",
    spu_unsigned: (br: string) => `SPU belum ditandatangani pemesan (${br}).`,
    ppjb_unsigned: (br: string) => `PPJB belum ditandatangani pemesan (${br}).`,
    dp_not_received: (br: string) => `DP / angsuran 1 belum diterima (${br}).`,
    not_sign_p3u: (br: string) => `Unit belum Sign P3U (${br}).`,
  } as Record<string, (br: string) => string>,
  en: {
    unit_cancelled: () => "The unit has been cancelled.",
    unit_moved: () => "The unit has been moved to another unit.",
    unit_management: () => "Management unit — it earns no incentive.",
    spu_unsigned: (br: string) => `The SPU has not been signed by the buyer (${br}).`,
    ppjb_unsigned: (br: string) => `The PPJB has not been signed by the buyer (${br}).`,
    dp_not_received: (br: string) =>
      `The down payment or first instalment has not been received (${br}).`,
    not_sign_p3u: (br: string) => `The unit has not been Sign P3U (${br}).`,
  } as Record<string, (br: string) => string>,
};

const KATA = {
  id: {
    pengantarJudul: "Penjualan yang memenuhi syarat dan belum diklaim dapat " +
                    "diajukan lewat kolom paling kanan.",
    takDikenal: "Jenis klaim tidak dikenal",
    kembali: "Kembali ke pilihan jenis",
    dapatDiklaim: (n: number) => `${n} dapat diklaim`,
    penjualan: (n: number) => `${n} penjualan`,
    galatBaca: "Data penjualan tidak dapat dibaca",
    cari: "Cari (kode unit, pembeli, proyek, cluster)",
    contohCari: "mis. BIOBA2",
    tampilkan: "Tampilkan",
    semuaPenjualan: "semua penjualan",
    yangBisa: "yang dapat diklaim",
    yangSudah: "yang sudah diklaim",
    yangBelum: "yang belum dapat diklaim",
    dataPenjualan: "Data penjualan",
    barisDitampilkan: (n: number) => `${n} baris ditampilkan`,
    thUnit: "Unit", thPembeli: "Pembeli", thPenerima: "Penerima fee",
    thSkema: "Skema / tanggal", thNilai: "Nilai kontrak",
    thPenerimaan: "Penerimaan", thKlaim: "Klaim",
    belumTercatat: "belum tercatat",
    dariKontrak: (p: string) => `${p}% dari kontrak`,
    sudahDiklaim: "sudah diklaim",
    tombolKlaim: "Klaim",
    belumDapatDiklaim: "belum dapat diklaim",
    catatDokumen: "Catat dokumen",
    belumMenyebut: (sumber: string) => `Data penjualan belum menyebut ${sumber}.`,
    belumAktif: (nama: string, status: string) =>
      `${nama} berstatus ${status}, belum aktif.`,
    takAdaCocok: "Tidak ada penjualan yang cocok dengan penyaringan ini.",
    memuat: "Memuat…",
    popupNama: "Catat dokumen unit",
    dokumenUnit: (kode: string) => `Dokumen unit ${kode}`,
    tutup: "Tutup",
    popupPengantar:
      "Tandai yang berkasnya sudah ada di tangan Anda. Penanda inilah yang " +
      "membuka pengajuan atas unit ini, dan setiap perubahannya tercatat pada " +
      "jejak audit beserta nama Anda.",
    penerimaanHariIni: "Penerimaan sampai hari ini (Rp)",
    nilaiKontrak: (v: string) => `Nilai kontrak ${v}.`,
    melebihiJudul: "Penerimaan melebihi nilai kontrak",
    melebihiIsi: "Periksa sekali lagi sebelum disimpan.",
    menyimpan: "Menyimpan…", simpan: "Simpan", batal: "Batal",
    tercatat: (kode: string) => `Dokumen unit ${kode} tercatat.`,
  },
  en: {
    pengantarJudul: "Sales that meet the requirements and have not been " +
                    "claimed can be submitted from the rightmost column.",
    takDikenal: "Unknown claim type",
    kembali: "Back to the type list",
    dapatDiklaim: (n: number) => `${n} claimable`,
    penjualan: (n: number) => `${n} sales`,
    galatBaca: "Sales data could not be read",
    cari: "Search (unit code, buyer, project, cluster)",
    contohCari: "e.g. BIOBA2",
    tampilkan: "Show",
    semuaPenjualan: "all sales",
    yangBisa: "claimable only",
    yangSudah: "already claimed",
    yangBelum: "not yet claimable",
    dataPenjualan: "Sales data",
    barisDitampilkan: (n: number) => `${n} rows shown`,
    thUnit: "Unit", thPembeli: "Buyer", thPenerima: "Fee recipient",
    thSkema: "Scheme / date", thNilai: "Contract value",
    thPenerimaan: "Received", thKlaim: "Claim",
    belumTercatat: "not recorded yet",
    dariKontrak: (p: string) => `${p}% of contract`,
    sudahDiklaim: "claimed",
    tombolKlaim: "Claim",
    belumDapatDiklaim: "not yet claimable",
    catatDokumen: "Record documents",
    belumMenyebut: (sumber: string) =>
      `The sales data does not name a ${sumber} yet.`,
    belumAktif: (nama: string, status: string) =>
      `${nama} is ${status}, not active yet.`,
    takAdaCocok: "No sales match this filter.",
    memuat: "Loading…",
    popupNama: "Record unit documents",
    dokumenUnit: (kode: string) => `Documents for unit ${kode}`,
    tutup: "Close",
    popupPengantar:
      "Tick the ones whose paperwork you already hold. These markers are what " +
      "open up submission for this unit, and every change is written to the " +
      "audit trail along with your name.",
    penerimaanHariIni: "Received to date (Rp)",
    nilaiKontrak: (v: string) => `Contract value ${v}.`,
    melebihiJudul: "Received exceeds the contract value",
    melebihiIsi: "Please check once more before saving.",
    menyimpan: "Saving…", simpan: "Save", batal: "Cancel",
    tercatat: (kode: string) => `Documents for unit ${kode} recorded.`,
  },
};

type Unit = {
  spu_signed: boolean; ppjb_signed: boolean;
  dp_received: boolean; sign_p3u: boolean;
  id: string; code: string; project_name: string; cluster_code: string;
  buyer_name: string | null; unit_type: string | null;
  payment_scheme: string | null; contract_date: string | null;
  contract_value_incl_vat: number; received_amount: number; status: string;
  eligible: boolean; missing_requirements: string[];
  missing_codes: string[];
  marketing_name: string | null; agency_name: string | null;
  recipient: { id: string | null; name: string | null;
               status: string | null; source: string };
  marketing_missing: boolean; marketing_inactive: boolean;
  claimable: boolean;
  claim: { id: string; claim_number: string; status: string;
           net_amount: number; recipient_role: string } | null;
};

type Saring = "semua" | "bisa" | "sudah" | "belum_syarat";

export default function DaftarPenjualanPage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);
  const params = useParams<{ jenis: string }>();
  const jenis = jenisDari(params.jenis);

  const [units, setUnits] = useState<Unit[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  // Unit yang sedang dicatat dokumennya, beserta isian pop-upnya.
  const [catat, setCatat] = useState<Unit | null>(null);
  const [isian, setIsian] = useState<Record<string, any>>({});
  const [simpan, setSimpan] = useState(false);
  const [kabar, setKabar] = useState<{ kind: string; teks: string } | null>(null);
  const [saring, setSaring] = useState<Saring>("semua");

  const muat = useCallback(async () => {
    if (!jenis) return;
    setBusy(true);
    setGalat(null);
    try {
      const res = await fetch(`/api/units?eligible_for=${jenis.slug}`);
      if (res.status === 401) { location.href = "/login"; return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? body.title ?? `HTTP ${res.status}`);
      setUnits(body);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [jenis]);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  const bukaCatat = (u: Unit) => {
    setKabar(null);
    setCatat(u);
    setIsian({
      spu_signed: u.spu_signed, ppjb_signed: u.ppjb_signed,
      dp_received: u.dp_received, sign_p3u: u.sign_p3u,
      received_amount: String(u.received_amount ?? 0),
    });
  };

  const simpanCatat = async () => {
    if (!catat) return;
    setSimpan(true);
    try {
      const res = await fetch(`/api/units/${catat.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...isian,
          received_amount: Number(String(isian.received_amount).replace(/[^\d]/g, "")) || 0,
        }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? body.title ?? `HTTP ${res.status}`);
      setKabar({ kind: "ok", teks: k.tercatat(catat.code) });
      setCatat(null);
      await muat();
    } catch (e: any) {
      setKabar({ kind: "stop", teks: String(e?.message ?? e) });
    } finally { setSimpan(false); }
  };

  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

  if (!jenis) {
    return (
      <div className="wrap narrow">
        <div className="banner stop" style={{ marginTop: 30 }}>
          <b>{k.takDikenal}</b>
          <Link href="/klaim">{k.kembali}</Link>
        </div>
      </div>
    );
  }

  const q = cari.trim().toLowerCase();
  const terlihat = units.filter((u) => {
    if (q && ![u.code, u.buyer_name, u.project_name, u.cluster_code]
                .some((v) => v?.toLowerCase().includes(q))) return false;
    if (saring === "bisa") return u.claimable;
    if (saring === "sudah") return Boolean(u.claim);
    if (saring === "belum_syarat") return !u.claim && !u.claimable;
    return true;
  });

  const bisa = units.filter((u) => u.claimable).length;
  // Penanda prasyarat membuka pembayaran atas unit, jadi hanya Admin Sales dan
  // Admin IT yang boleh mencatatnya — bukan yang mengajukan klaimnya.
  const boleh = sesi.role === "admin_sales" || sesi.role === "admin_system";

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{bahasa === "en" ? NAMA_EN[jenis.slug] : jenis.nama}</h1>
        <p>
          {bahasa === "en" ? PRASYARAT_EN[jenis.slug] : jenis.prasyarat}{" "}
          {k.pengantarJudul}
        </p>
      </div>
    }>

      {/* Tanpa "← Ganti jenis fee" di sini: kepala halaman sudah memuat
          tautan kembali ke Pengajuan Fee, dan dua tautan ke tempat yang sama
          dalam satu layar membuat orang mengira keduanya berbeda tujuan. */}
      <div className="row sp">
        <span className="pill">{k.dapatDiklaim(bisa)}</span>
        <span className="pill">{k.penjualan(units.length)}</span>
      </div>

      {kabar && (
        <div className={`banner ${kabar.kind}`}>{kabar.teks}</div>
      )}

      {galat && (
        <div className="banner stop">
          <b>{k.galatBaca}</b>
          {galat}
        </div>
      )}

      <div className="panel sp">
        <div className="filters">
          <div>
            <div className="lbl">{k.cari}</div>
            <input value={cari} placeholder={k.contohCari}
                   onChange={(e) => setCari(e.target.value)} />
          </div>
          <div>
            <div className="lbl">{k.tampilkan}</div>
            <select value={saring} onChange={(e) => setSaring(e.target.value as Saring)}>
              <option value="semua">{k.semuaPenjualan}</option>
              <option value="bisa">{k.yangBisa}</option>
              <option value="sudah">{k.yangSudah}</option>
              <option value="belum_syarat">{k.yangBelum}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          {k.dataPenjualan}
          <span className="pill">{k.barisDitampilkan(terlihat.length)}</span>
        </h2>

        <div className="tscroll">
          <table>
            <tbody>
              <tr>
                <th>{k.thUnit}</th>
                <th>{k.thPembeli}</th>
                <th>{k.thPenerima}</th>
                <th>{k.thSkema}</th>
                <th style={{ textAlign: "right" }}>{k.thNilai}</th>
                <th style={{ textAlign: "right" }}>{k.thPenerimaan}</th>
                <th style={{ width: 230 }}>{k.thKlaim}</th>
              </tr>

              {terlihat.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.code}</b><br />
                    <span style={{ color: "var(--mut)" }}>
                      {u.cluster_code} · {u.unit_type ?? "—"}
                    </span>
                  </td>
                  <td>{u.buyer_name ?? "—"}</td>
                  <td>
                    {u.recipient.name ?? (
                      <span style={{ color: "var(--mut)" }}>{k.belumTercatat}</span>
                    )}
                    <br />
                    <span style={{ color: "var(--mut)", fontSize: 11 }}>
                      {u.recipient.source}
                      {u.agency_name && u.recipient.source === "Sales"
                        ? ` · ${u.agency_name}` : ""}
                    </span>
                  </td>
                  <td>
                    {u.payment_scheme ?? "—"}<br />
                    <span style={{ color: "var(--mut)" }}>
                      {u.contract_date ? String(u.contract_date).slice(0, 10) : "—"}
                    </span>
                  </td>
                  <td className="n">{rp(u.contract_value_incl_vat)}</td>
                  {/* Penerimaan ditampilkan bersama persentasenya terhadap nilai
                      kontrak: Komisi dihitung dari persentase pembayaran, jadi
                      angka rupiahnya sendiri belum menjawab pertanyaan yang
                      dibawa orang ke layar ini. */}
                  <td className="n">
                    {rp(u.received_amount)}<br />
                    <span style={{ color: "var(--mut)", fontSize: 11 }}>
                      {u.contract_value_incl_vat
                        ? k.dariKontrak(((u.received_amount /
                             u.contract_value_incl_vat) * 100).toFixed(1))
                        : "—"}
                    </span>
                  </td>
                  <td>
                    {u.claim ? (
                      <>
                        <span className="pill ok">{k.sudahDiklaim}</span><br />
                        <span style={{ fontSize: 11 }}>
                          {u.claim.claim_number} · {u.claim.status}
                        </span>
                      </>
                    ) : u.claimable ? (
                      <Link className="tombol-klaim"
                            href={`/klaim/${jenis.slug}/baru?unit=${u.id}`}>
                        {k.tombolKlaim}
                      </Link>
                    ) : (
                      <>
                        <span className="pill warn">{k.belumDapatDiklaim}</span>
                        {boleh && (
                          <button style={{ marginLeft: 6, padding: "2px 8px",
                                           fontSize: 11 }}
                                  onClick={() => bukaCatat(u)}>
                            {k.catatDokumen}
                          </button>
                        )}
                        <ul className="kurang">
                          {/* Kalimat dari server dipakai sebagai cadangan: kode
                              yang tidak dikenal — misalnya sebab baru yang
                              ditambahkan di server sebelum layar ini menyusul —
                              tetap terbaca, alih-alih hilang tanpa jejak. */}
                          {u.missing_requirements.map((m, i) => {
                            const kode = u.missing_codes?.[i];
                            const buat = kode ? SEBAB[bahasa][kode] : undefined;
                            return (
                              <li key={kode ?? m}>
                                {buat ? buat(BR[jenis.slug] ?? "") : m}
                              </li>
                            );
                          })}
                          {u.marketing_missing && (
                            <li>{k.belumMenyebut(u.recipient.source)}</li>
                          )}
                          {u.marketing_inactive && (
                            <li>
                              {k.belumAktif(u.recipient.name ?? "—",
                                            u.recipient.status ?? "—")}
                            </li>
                          )}
                        </ul>
                      </>
                    )}
                  </td>
                </tr>
              ))}

              {!terlihat.length && !busy && (
                <tr>
                  <td colSpan={7} style={{ color: "var(--mut)" }}>
                    {k.takAdaCocok}
                  </td>
                </tr>
              )}
              {busy && (
                <tr><td colSpan={7} style={{ color: "var(--mut)" }}>{k.memuat}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pencatatan dokumen. Keempat penanda ini tidak ada di Laporan Penjualan
          — impor sengaja tidak menyentuhnya — sehingga tanpa layar ini setiap
          unit hasil impor berhenti pada "belum dapat diklaim" tanpa jalan
          keluar. Yang mencatat adalah Admin Sales yang memegang berkasnya. */}
      {catat && (
        <div className="tirai"
             onMouseDown={(e) => {
               if (e.target === e.currentTarget && !simpan) setCatat(null);
             }}>
          <div className="popup lebar" role="dialog" aria-modal="true"
               aria-label={k.popupNama} style={{ maxWidth: 520 }}>
            <div className="popup-kepala">
              <h2>
                {k.dokumenUnit(catat.code)}
                <span className="pill">{catat.buyer_name ?? "—"}</span>
              </h2>
              <button className="tautan" aria-label={k.tutup}
                      onClick={() => setCatat(null)}>✕</button>
            </div>

            <div className="popup-isi">
              <p className="hint" style={{ textAlign: "left", margin: "0 0 12px" }}>
                {k.popupPengantar}
              </p>

              {PRASYARAT.map((pra) => {
                const [label, ket] = pra[bahasa];
                return (
                  <label key={pra.kolom} className="tandai-syarat">
                    <input type="checkbox" checked={Boolean(isian[pra.kolom])}
                           onChange={(e) =>
                             setIsian({ ...isian, [pra.kolom]: e.target.checked })} />
                    <span>
                      {label}
                      <span className="lbl" style={{ margin: 0 }}>{ket}</span>
                    </span>
                  </label>
                );
              })}

              {/* Penerimaan ikut di sini: Komisi dihitung dari persentase
                  pembayaran, dan angkanya pun tidak ada di laporan penjualan. */}
              <div className="lbl" style={{ marginTop: 14 }}>
                {k.penerimaanHariIni}
              </div>
              <input value={isian.received_amount ?? ""} inputMode="numeric"
                     style={{ width: "100%" }}
                     onChange={(e) =>
                       setIsian({ ...isian, received_amount: e.target.value })} />
              <div className="lbl" style={{ marginTop: 4 }}>
                {k.nilaiKontrak(rp(catat.contract_value_incl_vat))}
              </div>
              {/* Diperingatkan, bukan ditolak: pembayaran melebihi nilai kontrak
                  memang terjadi (denda, penyesuaian), tetapi jauh lebih sering
                  ia adalah angka yang salah ketik — dan Komisi dihitung dari
                  persentase pembayaran, jadi salah ketiknya ikut terbawa. */}
              {Number(String(isian.received_amount).replace(/[^\d]/g, "")) >
                 catat.contract_value_incl_vat && (
                <div className="banner warn" style={{ marginTop: 8 }}>
                  <b>{k.melebihiJudul}</b>
                  {k.melebihiIsi}
                </div>
              )}
            </div>

            <div className="popup-kaki">
              <div className="row">
                <button className="pri" disabled={simpan}
                        onClick={() => void simpanCatat()}>
                  {simpan ? k.menyimpan : k.simpan}
                </button>
                <button disabled={simpan}
                        onClick={() => setCatat(null)}>{k.batal}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Kerangka>
  );
}
