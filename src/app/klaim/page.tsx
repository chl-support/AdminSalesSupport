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

/**
 * Ambang penerimaan yang membuka pengajuan, disalin dari server.
 *
 * Yang menentukan tombolnya muncul atau tidak tetap jawaban server; angka ini
 * hanya dipakai menuliskan kalimatnya di kolom Keterangan.
 */
const AMBANG = 0.20;

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;

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
    pengantar: "Keempat jenis fee berdiri pada baris yang sama. Syaratnya " +
               "satu: penerimaan sudah mencapai 20% dari nilai kontrak. Yang " +
               "sudah memenuhinya dapat langsung diajukan lewat tombolnya; " +
               "yang belum, keadaannya ada di kolom Keterangan.",
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
    thUnit: "Unit", thPembeli: "Pembeli", thPenerima: "Sales/Agent",
    thSkema: "Skema Cara Bayar", thNilai: "Nilai kontrak",
    thPenerimaan: "Penerimaan", thKlaim: "Klaim", thKeterangan: "Keterangan",
    belumTercatat: "belum tercatat",
    dariKontrak: (p: string) => `${p}% dari kontrak`,
    tombolKlaim: "Klaim",
    belum: "belum",
    syaratLengkap: "Syarat terpenuhi",
    penerimaanKurang: (p: number) =>
      `Penerimaan baru ${p.toFixed(1)}%, syaratnya ${AMBANG * 100}%`,
    belumMenyebut: (sumber: string) => `Data penjualan belum menyebut ${sumber}.`,
    belumAktif: (nama: string, status: string) =>
      `${nama} berstatus ${status}, belum aktif.`,
    takAdaCocok: "Tidak ada penjualan yang cocok dengan penyaringan ini.",
    memuat: "Memuat…",
  },
  en: {
    judul: "Fee Submission",
    pengantar: "All four fee types sit on the same row. There is one " +
               "requirement: receipts have reached 20% of the contract value. " +
               "Those that meet it can be submitted straight from their " +
               "button; for the rest, the state is in the Notes column.",
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
    thUnit: "Unit", thPembeli: "Buyer", thPenerima: "Sales/Agent",
    thSkema: "Payment Scheme", thNilai: "Contract value",
    thPenerimaan: "Received", thKlaim: "Claim", thKeterangan: "Notes",
    belumTercatat: "not recorded yet",
    dariKontrak: (p: string) => `${p}% of contract`,
    tombolKlaim: "Claim",
    belum: "not yet",
    syaratLengkap: "Requirement met",
    penerimaanKurang: (p: number) =>
      `Received is only ${p.toFixed(1)}%, the requirement is ${AMBANG * 100}%`,
    belumMenyebut: (sumber: string) =>
      `The sales data does not name a ${sumber} yet.`,
    belumAktif: (nama: string, status: string) =>
      `${nama} is ${status}, not active yet.`,
    takAdaCocok: "No sales match this filter.",
    memuat: "Loading…",
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
  id: string; code: string; project_name: string; cluster_code: string;
  buyer_name: string | null; unit_type: string | null;
  payment_scheme: string | null; contract_date: string | null;
  contract_value_incl_vat: number; received_amount: number; status: string;
  agency_name: string | null;
  fees: Record<Jenis, Fee>;
};

type Saring = "semua" | "bisa" | "sudah" | "belum_syarat";

export default function PengajuanFeePage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);

  const [units, setUnits] = useState<Unit[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
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
          <table className="tabel-penjualan">
            <tbody>
              <tr>
                <th className="sel-unit">{k.thUnit}</th>
                <th>{k.thPembeli}</th>
                <th className="sel-penerima">{k.thPenerima}</th>
                <th className="sel-skema">{k.thSkema}</th>
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
                // Satu syarat saja: penerimaan sudah mencapai ambangnya.
                // Persentasenya dihitung di sini juga, bukan hanya dinilai
                // lulus-tidaknya — yang belum cukup perlu tahu tinggal berapa.
                const persen = u.contract_value_incl_vat
                  ? (u.received_amount / u.contract_value_incl_vat) * 100 : 0;
                const cukup = u.contract_value_incl_vat > 0 &&
                              persen >= AMBANG * 100;
                // Sebab yang melekat pada unitnya diambil dari jenis mana pun —
                // ia sama untuk keempatnya.
                const sebabUnit = (u.fees.closing_fee?.missing_codes ?? [])
                  .filter((c) => KODE_UNIT.includes(c));

                return (
                  <tr key={u.id}>
                    <td className="sel-unit"><b>{u.code}</b></td>
                    <td>{u.buyer_name ?? "—"}</td>
                    {/* Nama saja. Peran dan nama kantornya dibuang atas
                        permintaan: keduanya sudah diketahui orang yang
                        mengerjakan berkasnya, dan tiga baris keterangan per
                        orang membuat satu baris tabel setinggi lima baris. */}
                    <td className="sel-penerima">
                      {sales?.name ?? (
                        <span style={{ color: "var(--mut)" }}>{k.belumTercatat}</span>
                      )}
                      {atas?.name && atas.id !== sales?.id && (
                        <><br />{atas.name}</>
                      )}
                    </td>
                    <td className="sel-skema">{u.payment_scheme ?? "—"}</td>
                    <td className="n">{rp(u.contract_value_incl_vat)}</td>
                    {/* Penerimaan bersama persentasenya terhadap nilai kontrak:
                        Komisi dihitung dari persentase pembayaran, jadi angka
                        rupiahnya sendiri belum menjawab pertanyaan yang dibawa
                        orang ke layar ini. */}
                    <td className="n">
                      {rp(u.received_amount)}<br />
                      <span style={{ color: "var(--mut)" }}>
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
                        <div key={c} className="pill stop"
                             style={{ marginBottom: 4 }}>
                          {SEBAB_UNIT[bahasa][c]}
                        </div>
                      ))}

                      {/* Saat unitnya sendiri yang menghalangi — dibatalkan,
                          dipindahkan, unit management — keadaan penerimaannya
                          tidak disebut. Angka yang sudah memenuhi syarat
                          berdampingan dengan unit yang dibatalkan terbaca
                          seolah tinggal selangkah lagi, padahal tidak ada
                          langkah yang tersisa. */}
                      {sebabUnit.length === 0 && (
                        cukup ? (
                          <span className="pill ok">{k.syaratLengkap}</span>
                        ) : (
                          <span className="pill warn">
                            {k.penerimaanKurang(persen)}
                          </span>
                        )
                      )}

                      <ul className="syarat-daftar">
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

    </Kerangka>
  );
}
