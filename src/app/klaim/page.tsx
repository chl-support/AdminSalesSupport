"use client";

/**
 * Pengajuan Fee — data penjualan dengan keempat jenis fee pada baris yang sama.
 *
 * Sebelumnya layar ini dibuka satu jenis pada satu waktu, lewat daftar pilihan
 * di atasnya. Bentuk itu memaksa orang membuka empat kali layar yang sama untuk
 * menjawab satu pertanyaan yang selalu muncul bersamaan — unit ini sudah
 * diklaim apa saja, dan yang mana yang masih bisa diajukan. Empat kali membuka
 * juga berarti empat kali mengetik ulang penyaringnya.
 *
 * Karena itu kolom Klaim memuat keempatnya bertumpuk, masing-masing dengan
 * keadaannya sendiri: tombol bila dapat diajukan, nomor klaim bila sudah, dan
 * diam bila belum memenuhi syarat. Sebabnya tidak ditulis empat kali di sana —
 * ia ada di kolom Keterangan paling kanan, karena prasyaratnya melekat pada
 * unitnya, bukan pada jenis fee-nya.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { JENIS, namaJenis, type Jenis } from "./jenis";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;

/**
 * Prasyarat pencairan, sama urutannya dengan yang dicatat di basis data.
 *
 * `singkat` dipakai kolom Keterangan, yang memuat keempatnya berdampingan;
 * kalimat panjangnya dipakai pop-up pencatatan, tempat orang memutuskan
 * mencentangnya.
 */
const PRASYARAT = [
  { kolom: "spu_signed",
    singkat: { id: "SPU", en: "SPU" },
    id: ["SPU sudah ditandatangani pemesan",
         "Syarat Closing Fee, Komisi, dan Cash Reward."],
    en: ["The SPU has been signed by the buyer",
         "Required for Closing Fee, Commission, and Cash Reward."] },
  { kolom: "ppjb_signed",
    singkat: { id: "PPJB", en: "PPJB" },
    id: ["PPJB sudah ditandatangani pemesan",
         "Syarat Komisi dan Cash Reward."],
    en: ["The PPJB has been signed by the buyer",
         "Required for Commission and Cash Reward."] },
  { kolom: "dp_received",
    singkat: { id: "DP / angsuran 1", en: "Down payment" },
    id: ["DP / angsuran pertama sudah diterima", "Syarat Cash Reward."],
    en: ["The down payment or first instalment has been received",
         "Required for Cash Reward."] },
  { kolom: "sign_p3u",
    singkat: { id: "Sign P3U", en: "Sign P3U" },
    id: ["Unit sudah Sign P3U", "Syarat Overriding."],
    en: ["The unit has been Sign P3U", "Required for Overriding."] },
] as const;

/**
 * Sebab yang melekat pada unitnya, bukan pada jenis fee-nya.
 *
 * Unit yang dibatalkan, dipindahkan, atau milik management tidak menghasilkan
 * insentif apa pun — jadi ia menjelaskan keempat kolom fee sekaligus, dan
 * ditulis sekali di kolom Keterangan alih-alih empat kali.
 */
const SEBAB_UNIT = {
  id: {
    unit_cancelled: "Unit sudah dibatalkan.",
    unit_moved: "Unit sudah dipindahkan ke unit lain.",
    unit_management: "Unit management — tidak menghasilkan insentif.",
  } as Record<string, string>,
  en: {
    unit_cancelled: "The unit has been cancelled.",
    unit_moved: "The unit has been moved to another unit.",
    unit_management: "Management unit — it earns no incentive.",
  } as Record<string, string>,
};

const KODE_UNIT = ["unit_cancelled", "unit_moved", "unit_management"];

const KATA = {
  id: {
    judul: "Pengajuan Fee",
    pengantar: "Keempat jenis fee berdiri pada baris yang sama. Yang sudah " +
               "memenuhi syarat dapat langsung diajukan lewat tombolnya; " +
               "yang belum, sebabnya ada di kolom Keterangan.",
    dapatDiklaim: (n: number) => `${n} dapat diklaim`,
    penjualan: (n: number) => `${n} penjualan`,
    galatBaca: "Data penjualan tidak dapat dibaca",
    cari: "Cari (kode unit, pembeli, proyek, cluster)",
    contohCari: "mis. BIOBA2",
    tampilkan: "Tampilkan",
    semuaPenjualan: "semua penjualan",
    yangBisa: "yang ada fee dapat diklaim",
    yangSudah: "yang sudah ada klaimnya",
    yangBelum: "yang belum dapat diklaim sama sekali",
    dataPenjualan: "Data penjualan",
    barisDitampilkan: (n: number) => `${n} baris ditampilkan`,
    thUnit: "Unit", thPembeli: "Pembeli", thPenerima: "Penerima fee",
    thSkema: "Skema / tanggal", thNilai: "Nilai kontrak",
    thPenerimaan: "Penerimaan", thKlaim: "Klaim", thKeterangan: "Keterangan",
    belumTercatat: "belum tercatat",
    dariKontrak: (p: string) => `${p}% dari kontrak`,
    tombolKlaim: "Klaim",
    belum: "belum",
    syaratLengkap: "Syarat lengkap",
    syaratKurang: (n: number) => `${n} syarat belum terpenuhi`,
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
    judul: "Fee Submission",
    pengantar: "All four fee types sit on the same row. Those that meet the " +
               "requirements can be submitted straight from their button; " +
               "for the rest, the reason is in the Notes column.",
    dapatDiklaim: (n: number) => `${n} claimable`,
    penjualan: (n: number) => `${n} sales`,
    galatBaca: "Sales data could not be read",
    cari: "Search (unit code, buyer, project, cluster)",
    contohCari: "e.g. BIOBA2",
    tampilkan: "Show",
    semuaPenjualan: "all sales",
    yangBisa: "with a claimable fee",
    yangSudah: "with an existing claim",
    yangBelum: "with nothing claimable yet",
    dataPenjualan: "Sales data",
    barisDitampilkan: (n: number) => `${n} rows shown`,
    thUnit: "Unit", thPembeli: "Buyer", thPenerima: "Fee recipient",
    thSkema: "Scheme / date", thNilai: "Contract value",
    thPenerimaan: "Received", thKlaim: "Claim", thKeterangan: "Notes",
    belumTercatat: "not recorded yet",
    dariKontrak: (p: string) => `${p}% of contract`,
    tombolKlaim: "Claim",
    belum: "not yet",
    syaratLengkap: "All requirements met",
    syaratKurang: (n: number) => `${n} requirements outstanding`,
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

/** Keadaan satu unit untuk satu jenis fee, sebagaimana dikirim server. */
type Fee = {
  eligible: boolean;
  missing_requirements: string[];
  missing_codes: string[];
  recipient: { id: string | null; name: string | null;
               status: string | null; source: string };
  marketing_missing: boolean; marketing_inactive: boolean;
  claimable: boolean;
  claim: { id: string; claim_number: string; status: string;
           net_amount: number; recipient_role: string } | null;
};

type Unit = {
  spu_signed: boolean; ppjb_signed: boolean;
  dp_received: boolean; sign_p3u: boolean;
  id: string; code: string; project_name: string; cluster_code: string;
  buyer_name: string | null; unit_type: string | null;
  payment_scheme: string | null; contract_date: string | null;
  contract_value_incl_vat: number; received_amount: number; status: string;
  agency_name: string | null;
  fees: Record<Jenis, Fee>;
};

type Saring = "semua" | "bisa" | "sudah" | "belum_syarat";

/**
 * Jenis fee yang tertahan oleh tiap prasyarat.
 *
 * Aturannya sama dengan yang ditegakkan `eligibility()` di server — ditulis
 * ulang di sini hanya untuk menyebut nama jenisnya di kolom Keterangan. Yang
 * menentukan tombolnya muncul atau tidak tetap jawaban server, bukan tabel ini.
 */
const PERLU: Record<string, Jenis[]> = {
  spu_signed: ["closing_fee", "commission", "cash_reward"],
  ppjb_signed: ["commission", "cash_reward"],
  dp_received: ["cash_reward"],
  sign_p3u: ["overriding"],
};

export default function PengajuanFeePage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);

  const [units, setUnits] = useState<Unit[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [catat, setCatat] = useState<Unit | null>(null);
  const [isian, setIsian] = useState<Record<string, any>>({});
  const [simpan, setSimpan] = useState(false);
  const [kabar, setKabar] = useState<{ kind: string; teks: string } | null>(null);
  const [saring, setSaring] = useState<Saring>("semua");

  const muat = useCallback(async () => {
    setBusy(true);
    setGalat(null);
    try {
      // Satu panggilan untuk keempat jenis. Empat panggilan terpisah akan tiba
      // pada saat yang berbeda, dan klaim yang dibuat orang lain di sela-selanya
      // membuat satu baris menyebut dua keadaan sekaligus.
      const res = await fetch("/api/units?eligible_for=all");
      if (res.status === 401) { location.href = "/login"; return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? body.title ?? `HTTP ${res.status}`);
      setUnits(body);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

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
          received_amount:
            Number(String(isian.received_amount).replace(/[^\d]/g, "")) || 0,
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

  if (memuat || !sesi) return <MemeriksaSesi />;

  const q = cari.trim().toLowerCase();
  const adaKlaim = (u: Unit) => JENIS.some((j) => u.fees[j.slug]?.claim);
  const adaBisa = (u: Unit) => JENIS.some((j) => u.fees[j.slug]?.claimable);

  const terlihat = units.filter((u) => {
    if (q && ![u.code, u.buyer_name, u.project_name, u.cluster_code]
                .some((v) => v?.toLowerCase().includes(q))) return false;
    if (saring === "bisa") return adaBisa(u);
    if (saring === "sudah") return adaKlaim(u);
    if (saring === "belum_syarat") return !adaKlaim(u) && !adaBisa(u);
    return true;
  });

  // Dihitung per pasangan unit–jenis, bukan per unit: satu unit dapat memenuhi
  // syarat Closing Fee tetapi belum Overriding, dan menghitungnya sebagai satu
  // akan menyebut lebih sedikit pekerjaan daripada yang sebenarnya menunggu.
  const bisa = units.reduce(
    (n, u) => n + JENIS.filter((j) => u.fees[j.slug]?.claimable).length, 0);

  // Penanda prasyarat membuka pembayaran atas unit, jadi hanya Admin Sales dan
  // Admin IT yang boleh mencatatnya — bukan yang mengajukan klaimnya.
  const boleh = sesi.role === "admin_sales" || sesi.role === "admin_system";

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      <div className="row sp">
        <span className="pill">{k.dapatDiklaim(bisa)}</span>
        <span className="pill">{k.penjualan(units.length)}</span>
      </div>

      {kabar && <div className={`banner ${kabar.kind}`}>{kabar.teks}</div>}

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
            <select value={saring}
                    onChange={(e) => setSaring(e.target.value as Saring)}>
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
                <th className="sel-unit">{k.thUnit}</th>
                <th>{k.thPembeli}</th>
                <th className="sel-penerima">{k.thPenerima}</th>
                <th>{k.thSkema}</th>
                <th style={{ textAlign: "right" }}>{k.thNilai}</th>
                <th style={{ textAlign: "right" }}>{k.thPenerimaan}</th>
                <th className="sel-fee">{k.thKlaim}</th>
                <th className="sel-ket">{k.thKeterangan}</th>
              </tr>

              {terlihat.map((u) => {
                // Penerima berbeda antar jenis: Overriding membayar tingkat di
                // atas yang menjual. Keduanya disebut supaya kolom ini tidak
                // diam-diam hanya mewakili tiga dari empat baris di sebelahnya.
                const sales = u.fees.closing_fee?.recipient;
                const atas = u.fees.overriding?.recipient;
                const kurang = PRASYARAT.filter((p) => !(u as any)[p.kolom]);
                // Sebab yang melekat pada unitnya diambil dari jenis mana pun —
                // ia sama untuk keempatnya.
                const sebabUnit = (u.fees.closing_fee?.missing_codes ?? [])
                  .filter((c) => KODE_UNIT.includes(c));

                return (
                  <tr key={u.id}>
                    <td className="sel-unit">
                      <b>{u.code}</b><br />
                      <span style={{ color: "var(--mut)" }}>
                        {u.cluster_code} · {u.unit_type ?? "—"}
                      </span>
                    </td>
                    <td>{u.buyer_name ?? "—"}</td>
                    <td className="sel-penerima">
                      {sales?.name ?? (
                        <span style={{ color: "var(--mut)" }}>{k.belumTercatat}</span>
                      )}
                      <br />
                      <span style={{ color: "var(--mut)", fontSize: 11 }}>
                        {sales?.source}
                        {u.agency_name && sales?.source === "Sales"
                          ? ` · ${u.agency_name}` : ""}
                      </span>
                      {atas?.name && atas.id !== sales?.id && (
                        <>
                          <br />
                          <span style={{ fontSize: 11 }}>{atas.name}</span>
                          <br />
                          <span style={{ color: "var(--mut)", fontSize: 11 }}>
                            {atas.source}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {u.payment_scheme ?? "—"}<br />
                      <span style={{ color: "var(--mut)" }}>
                        {u.contract_date
                          ? String(u.contract_date).slice(0, 10) : "—"}
                      </span>
                    </td>
                    <td className="n">{rp(u.contract_value_incl_vat)}</td>
                    {/* Penerimaan bersama persentasenya terhadap nilai kontrak:
                        Komisi dihitung dari persentase pembayaran, jadi angka
                        rupiahnya sendiri belum menjawab pertanyaan yang dibawa
                        orang ke layar ini. */}
                    <td className="n">
                      {rp(u.received_amount)}<br />
                      <span style={{ color: "var(--mut)", fontSize: 11 }}>
                        {u.contract_value_incl_vat
                          ? k.dariKontrak(((u.received_amount /
                               u.contract_value_incl_vat) * 100).toFixed(1))
                          : "—"}
                      </span>
                    </td>

                    {/* Keempat jenis fee, masing-masing dengan keadaannya. */}
                    <td className="sel-fee">
                      <div className="fee-kolom">
                        {JENIS.map((j) => {
                          const f = u.fees[j.slug];
                          return (
                            <div key={j.slug} className="fee-baris">
                              <span className="fee-nama">
                                {namaJenis(j.slug, bahasa)}
                              </span>
                              {f?.claim ? (
                                <span className="fee-keadaan">
                                  <span className="pill ok">
                                    {f.claim.claim_number}
                                  </span>
                                  <span className="fee-status">
                                    {f.claim.status}
                                  </span>
                                </span>
                              ) : f?.claimable ? (
                                <Link className="tombol-klaim kecil"
                                      href={`/klaim/${j.slug}/baru?unit=${u.id}`}>
                                  {k.tombolKlaim}
                                </Link>
                              ) : (
                                <span className="fee-belum">{k.belum}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    {/* Keterangan: prasyarat yang melekat pada unitnya, ditulis
                        sekali. Menaruhnya di sebelah tiap jenis fee berarti
                        kalimat yang sama diulang sampai empat kali pada satu
                        baris, dan yang membacanya berhenti membacanya. */}
                    <td className="sel-ket">
                      {sebabUnit.map((c) => (
                        <div key={c} className="pill stop" style={{ marginBottom: 4 }}>
                          {SEBAB_UNIT[bahasa][c]}
                        </div>
                      ))}

                      {/* Saat unitnya sendiri yang menghalangi — dibatalkan,
                          dipindahkan, unit management — "Syarat lengkap" tidak
                          ditampilkan. Keduanya berdampingan terbaca seolah
                          tinggal selangkah lagi, padahal tidak ada langkah yang
                          tersisa: unit itu memang tidak menghasilkan insentif. */}
                      {sebabUnit.length === 0 && (
                        kurang.length === 0 ? (
                          <span className="pill ok">{k.syaratLengkap}</span>
                        ) : (
                          <span className="pill warn">
                            {k.syaratKurang(kurang.length)}
                          </span>
                        )
                      )}

                      <ul className="syarat-daftar">
                        {PRASYARAT.map((p) => {
                          const ada = Boolean((u as any)[p.kolom]);
                          // Jenis fee yang tertahan oleh syarat ini disebut di
                          // belakangnya: tanpa itu, "PPJB belum" tidak memberi
                          // tahu tombol mana di sebelah kiri yang sedang diam.
                          const untuk = PERLU[p.kolom] ?? [];
                          return (
                            <li key={p.kolom} className={ada ? "ya" : "tidak"}>
                              <span aria-hidden="true">{ada ? "✓" : "✕"}</span>
                              {" "}
                              {p.singkat[bahasa]}
                              {!ada && (
                                <span className="untuk">
                                  {" — "}
                                  {untuk.map((j) => namaJenis(j, bahasa))
                                        .join(", ")}
                                </span>
                              )}
                            </li>
                          );
                        })}
                        {u.fees.closing_fee?.marketing_missing && (
                          <li className="tidak">
                            <span aria-hidden="true">✕</span>{" "}
                            {k.belumMenyebut(sales?.source ?? "Sales")}
                          </li>
                        )}
                        {u.fees.closing_fee?.marketing_inactive && (
                          <li className="tidak">
                            <span aria-hidden="true">✕</span>{" "}
                            {k.belumAktif(sales?.name ?? "—",
                                          sales?.status ?? "—")}
                          </li>
                        )}
                      </ul>

                      {boleh && (
                        <button style={{ marginTop: 6, padding: "2px 8px",
                                         fontSize: 11 }}
                                onClick={() => bukaCatat(u)}>
                          {k.catatDokumen}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!terlihat.length && !busy && (
                <tr>
                  <td colSpan={8} style={{ color: "var(--mut)" }}>
                    {k.takAdaCocok}
                  </td>
                </tr>
              )}
              {busy && (
                <tr>
                  <td colSpan={8} style={{ color: "var(--mut)" }}>{k.memuat}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pencatatan dokumen. Keempat penanda ini tidak ada di Laporan Penjualan
          — impor sengaja tidak menyentuhnya — sehingga tanpa layar ini setiap
          unit hasil impor berhenti pada "belum" tanpa jalan keluar. Yang
          mencatat adalah Admin Sales yang memegang berkasnya. */}
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
