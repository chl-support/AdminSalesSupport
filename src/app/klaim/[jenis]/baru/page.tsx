"use client";

/**
 * Langkah 3: formulir pengajuan klaim.
 *
 * Susunannya mengikuti Form Pengajuan yang dipakai BIO District — Informasi Data
 * Marketing, Informasi Data Pemesanan, Perhitungan, Penjelasan Pengajuan,
 * Syarat/Dokumen, Tujuan Transfer, Pengesahan — supaya yang mengisi di layar
 * melihat urutan yang sama dengan yang selama ini ditandatangani di kertas.
 *
 * Yang berbeda dari kertasnya, dan disengaja:
 *
 *   - **Nominal tidak diketik.** Bruto, PPN, PPh, dan nilai bersih dihitung
 *     server dari skema insentif pada memo yang berlaku di tanggal kontrak
 *     (lihat lib/calc.ts). Pada kertas, angka itu diisi tangan dan setiap
 *     salinannya bisa berbeda.
 *   - **Penerima tidak dipilih.** Ia diambil dari data penjualan: Sales untuk
 *     Closing Fee, Komisi, dan Cash Reward; Sub Koordinator untuk Overriding.
 *   - **Data marketing dan pemesanan tidak diketik ulang**, melainkan dibaca
 *     dari basis data. Mengetik ulang berarti dua versi dari fakta yang sama.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { useBahasa, useKata } from "../../../bahasa";
import { Kerangka, MemeriksaSesi } from "../../../kerangka";
import { useSesi } from "../../../session";
import { FormPengajuan } from "../../form-pengajuan";
import {
  DOKUMEN, LABEL_PERAN, NAMA_EN, PERAN_PENERIMA, TINGKAT_EN,
  TINGKAT_OVERRIDING, jenisDari,
} from "../../jenis";

/** Isian di dalam tabel formulir: selebar kolomnya, rata kanan seperti isinya. */
const ISIAN: React.CSSProperties = { width: "100%", textAlign: "right" };

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;
const tgl = (v?: string | null) => (v ? String(v).slice(0, 10) : "—");

type Rekening = {
  holder_name: string; holder_type: "individual" | "company";
  account_number: string; bank_name: string; branch: string | null;
};

type Penerima = {
  id: string | null; name: string | null; status: string | null; source: string;
  type: string | null; npwp: string | null; phone: string | null;
  email: string | null; office: string | null; office_address: string | null;
  bank: Rekening | null;
};

type Unit = {
  id: string; code: string; project_name: string; cluster_code: string;
  buyer_name: string | null; unit_type: string | null; land_area: number | null;
  building_area: number | null; payment_scheme: string | null;
  contract_number: string | null; contract_date: string | null;
  contract_value_incl_vat: number; received_amount: number;
  eligible: boolean; missing_requirements: string[];
  recipient: Penerima;
  marketing_missing: boolean; marketing_inactive: boolean;
  claimable: boolean;
  claim: { claim_number: string; status: string } | null;
};

/**
 * Kata-kata layar ini.
 *
 * Nama dokumen pada checklist (FPU, SPU, PPJB, …) sengaja tidak ikut: itu nama
 * berkas resmi yang tertulis pada formulir perusahaan, dan nilainya tersimpan
 * sebagai checklist_item pada basis data. Menerjemahkannya membuat berkas yang
 * dicari orang di lemari tidak lagi bernama sama dengan yang tertulis di layar.
 */
const KATA = {
  id: {
    judul: (jenis: string) => `Form Pengajuan ${jenis}`,
    pengantar:
      "PT. Serpong Bangun Lestari. Nominal dihitung sistem dari memo skema " +
      "yang berlaku pada tanggal kontrak, tidak diisi tangan.",
    kembali: "← Kembali ke data penjualan",
    memuatUnit: "Memuat data unit…",
    takAdaUnitJudul: "Unit tidak ditemukan",
    takAdaUnitIsi: "Unit yang diminta tidak ada pada daftar penjualan.",
    sudahAdaJudul: (jenis: string) =>
      `Unit ini sudah punya klaim ${jenis} yang aktif`,
    sudahAdaIsi:
      "Satu unit hanya boleh punya satu klaim aktif per jenis dan peran " +
      "penerima (BR-05).",
    takAdaPenerimaJudul: (sumber: string) =>
      `Data penjualan ini belum menyebut ${sumber}`,
    takAdaPenerimaIsi: (jenis: string, sumber: string) =>
      `Penerima klaim ${jenis} diambil dari kolom ${sumber} pada data ` +
      `penjualan, jadi klaim tidak dapat dibuat sebelum unit ini dikaitkan ` +
      `dengan orangnya.`,
    belumAktifJudul: "Penerima pada penjualan ini belum aktif",
    belumAktifIsi: (nama: string, status: string) =>
      `${nama} berstatus ${status}. Pendaftaran dan perekaman spesimen tanda ` +
      `tangan harus selesai lebih dulu sebelum ia dapat menerima pembayaran.`,
    prasyaratJudul: "Prasyarat pencairan belum terpenuhi",
    blokMarketing: "INFORMASI DATA MARKETING",
    namaMarketing: "Nama Marketing", status: "Status",
    namaKantor: "Nama Kantor Marketing", alamatKantor: "Alamat Kantor",
    npwp: "NPWP", telepon: "No. Telepon / HP", email: "Email",
    catatanOverriding: (sumber: string) =>
      `Overriding dibayarkan kepada ${sumber}, bukan kepada Sales yang ` +
      `menutup penjualannya.`,
    blokPemesanan: "INFORMASI DATA PEMESANAN",
    project: "Project", namaPemesan: "Nama Pemesan", kluster: "Kluster",
    noUnit: "No. Unit", tipe: "Tipe", luasTanah: "Luas Tanah",
    luasBangunan: "Luas Bangunan", noKontrak: "No. Kontrak",
    tanggalPenjualan: "Tanggal Penjualan", skemaBayar: "Skema Cara Bayar",
    hargaTransaksi: "Harga Transaksi",
    blokPeran: "PERAN PENERIMA",
    diterimaDalamPeran: "Diterima dalam peran",
    pilihPeran: "— pilih peran —",
    catatanPeran: "Menentukan tarif mana yang dipakai pada memo skema.",
    tingkatOverriding: "Tingkat overriding",
    pilihTingkat: "— pilih tingkat —",
    blokTransfer: "TUJUAN TRANSFER",
    namaPenerima: "Nama Penerima", bank: "BANK", noRekening: "No. Rekening",
    kantorCabang: "Kantor Cabang", atasNama: "Atas nama",
    phNamaPenerima: "nama sesuai buku tabungan", phBank: "mis. BCA",
    phRekening: "tanpa spasi", phCabang: "mis. Gading Serpong",
    badanUsaha: "Badan Usaha (PT)", pribadi: "Pribadi (Perorangan)",
    catatanPphAwal: "Rekening tujuan inilah yang menentukan jenis PPh: " +
                    "ditransfer ke badan usaha dipotong ",
    catatanPphTengah: ", ke perorangan dipotong ",
    catatanPphPilihan: "Pilihan sekarang ",
    pilihanBadan: "Badan Usaha (PT), jadi dipotong PPh 23",
    pilihanPribadi: "Pribadi (Perorangan), jadi dipotong PPh 21",
    rekBelumVerifJudul: "Rekening ini belum pernah diverifikasi",
    rekBelumVerifIsi:
      "Klaim tetap dapat diajukan, tetapi pembayarannya menunggu Finance " +
      "memverifikasi rekening tujuannya.",
    blokPenjelasan: (jenis: string) => `PENJELASAN PENGAJUAN ${jenis}`,
    phPenjelasan: "mis. Full Payment. Pembayaran sudah mencapai 20%.",
    catatanPenjelasan:
      "Ikut tercetak pada paket dokumen yang diedarkan untuk persetujuan — " +
      "bukan catatan internal.",
    blokDokumen: (jenis: string) => `SYARAT / DOKUMEN PENGAJUAN ${jenis}`,
    dokumenBelumLengkap:
      "Seluruh dokumen harus dicentang sebelum klaim dapat diajukan.",
    menyimpan: "Menyimpan…", ajukan: "Ajukan klaim",
    catatanDraft:
      "Klaim tersimpan sebagai draft. Nominalnya dihitung saat itu juga dan " +
      "baru dikunci setelah Finance (Pajak) memverifikasinya.",
    galatJudul: "Klaim tidak dapat dibuat",
    tersimpanJudul: (nomor: string) =>
      `Klaim ${nomor} tersimpan sebagai draft`,
    tersimpanIsi:
      "Berikut Form Pengajuan yang terisi. Nominalnya dihitung sistem dan " +
      "belum dikunci — Finance (Pajak) yang memverifikasinya.",
    cetak: "Cetak formulir", ajukanLain: "Ajukan klaim lain",
    bukaKonsol: "Buka konsol klaim",
  },
  en: {
    judul: (jenis: string) => `${jenis} Submission Form`,
    pengantar:
      "PT. Serpong Bangun Lestari. The amount is computed by the system from " +
      "the scheme memo in force on the contract date; it is not typed in.",
    kembali: "← Back to sales data",
    memuatUnit: "Loading unit data…",
    takAdaUnitJudul: "Unit not found",
    takAdaUnitIsi: "The requested unit is not in the sales list.",
    sudahAdaJudul: (jenis: string) =>
      `This unit already has an active ${jenis} claim`,
    sudahAdaIsi:
      "A unit may hold only one active claim per type and recipient role " +
      "(BR-05).",
    takAdaPenerimaJudul: (sumber: string) =>
      `This sales record does not name a ${sumber} yet`,
    takAdaPenerimaIsi: (jenis: string, sumber: string) =>
      `The ${jenis} recipient is taken from the ${sumber} column in the sales ` +
      `data, so the claim cannot be created until this unit is linked to that ` +
      `person.`,
    belumAktifJudul: "The recipient on this sale is not active yet",
    belumAktifIsi: (nama: string, status: string) =>
      `${nama} is ${status}. Registration and signature specimen capture must ` +
      `be completed before they can receive a payment.`,
    prasyaratJudul: "Payout prerequisites are not met",
    blokMarketing: "MARKETING DATA",
    namaMarketing: "Marketing name", status: "Status",
    namaKantor: "Marketing office name", alamatKantor: "Office address",
    npwp: "NPWP", telepon: "Phone / mobile", email: "Email",
    catatanOverriding: (sumber: string) =>
      `Overriding is paid to the ${sumber}, not to the Sales who closed the ` +
      `sale.`,
    blokPemesanan: "BOOKING DATA",
    project: "Project", namaPemesan: "Buyer name", kluster: "Cluster",
    noUnit: "Unit no.", tipe: "Type", luasTanah: "Land area",
    luasBangunan: "Building area", noKontrak: "Contract no.",
    tanggalPenjualan: "Sale date", skemaBayar: "Payment scheme",
    hargaTransaksi: "Transaction price",
    blokPeran: "RECIPIENT ROLE",
    diterimaDalamPeran: "Received in the role of",
    pilihPeran: "— pick a role —",
    catatanPeran: "This decides which rate the scheme memo applies.",
    tingkatOverriding: "Overriding tier",
    pilihTingkat: "— pick a tier —",
    blokTransfer: "TRANSFER DESTINATION",
    namaPenerima: "Account holder", bank: "BANK", noRekening: "Account no.",
    kantorCabang: "Branch office", atasNama: "Held by",
    phNamaPenerima: "name as printed in the passbook", phBank: "e.g. BCA",
    phRekening: "no spaces", phCabang: "e.g. Gading Serpong",
    badanUsaha: "Company (PT)", pribadi: "Individual",
    catatanPphAwal: "The destination account decides the withholding type: " +
                    "transferred to a company it is withheld as ",
    catatanPphTengah: ", to an individual it is withheld as ",
    catatanPphPilihan: "Currently ",
    pilihanBadan: "Company (PT), so PPh 23 is withheld",
    pilihanPribadi: "Individual, so PPh 21 is withheld",
    rekBelumVerifJudul: "This account has never been verified",
    rekBelumVerifIsi:
      "The claim can still be submitted, but its payment waits for Finance to " +
      "verify the destination account.",
    blokPenjelasan: (jenis: string) => `${jenis} SUBMISSION NOTES`,
    phPenjelasan: "e.g. Full Payment. Payment has reached 20%.",
    catatanPenjelasan:
      "This is printed on the document package circulated for approval — it " +
      "is not an internal note.",
    blokDokumen: (jenis: string) => `${jenis} SUBMISSION REQUIREMENTS`,
    dokumenBelumLengkap:
      "Every document must be ticked before the claim can be submitted.",
    menyimpan: "Saving…", ajukan: "Submit claim",
    catatanDraft:
      "The claim is saved as a draft. Its amount is computed right away and is " +
      "locked only after Finance (Tax) verifies it.",
    galatJudul: "The claim could not be created",
    tersimpanJudul: (nomor: string) => `Claim ${nomor} saved as a draft`,
    tersimpanIsi:
      "Here is the filled-in Submission Form. The amount is computed by the " +
      "system and is not locked yet — Finance (Tax) verifies it.",
    cetak: "Print the form", ajukanLain: "Submit another claim",
    bukaKonsol: "Open the claim console",
  },
};

export default function FormKlaimPage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);
  const params = useParams<{ jenis: string }>();
  const search = useSearchParams();
  const jenis = jenisDari(params.jenis);
  const unitId = search.get("unit") ?? "";

  const [unit, setUnit] = useState<Unit | null>(null);
  const [peran, setPeran] = useState("");
  const [tingkat, setTingkat] = useState("");
  const [penjelasan, setPenjelasan] = useState("");
  // Tujuan transfer diketik pada formulirnya: ia berubah dari satu pengajuan ke
  // pengajuan berikutnya, jadi tidak dapat diambil sekali dari data marketing.
  const [tf, setTf] = useState({
    holder_name: "", bank_name: "", account_number: "", branch: "",
    holder_type: "individual",
  });
  const [ceklis, setCeklis] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(true);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kurang, setKurang] = useState<string[]>([]);
  const [hasil, setHasil] = useState<any>(null);

  const muat = useCallback(async () => {
    if (!jenis || !unitId) { setBusy(false); return; }
    setBusy(true);
    try {
      const u = await fetch(`/api/units?eligible_for=${jenis.slug}`);
      if (u.status === 401) { location.href = "/login"; return; }
      const units: Unit[] = await u.json();
      setUnit(units.find((x) => x.id === unitId) ?? null);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [jenis, unitId]);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  // Rekening yang sudah tercatat dipakai sebagai isian awal — yang paling
  // sering benar, tetapi tetap dapat diubah sebelum dikirim.
  useEffect(() => {
    const b = unit?.recipient.bank;
    if (!b) return;
    setTf({
      holder_name: b.holder_name ?? "", bank_name: b.bank_name ?? "",
      account_number: b.account_number ?? "", branch: b.branch ?? "",
      holder_type: b.holder_type === "company" ? "company" : "individual",
    });
  }, [unit]);

  // Peran bawaan mengikuti jenis marketing pada data penjualan. Tetap dapat
  // diubah, karena satu orang dapat menerima dalam peran berbeda (mis. markom).
  useEffect(() => {
    if (!unit?.recipient.type || !jenis) return;
    const usul = jenis.slug === "overriding"
      ? "sales_manager_inhouse"
      : unit.recipient.type === "agent" ? "agent" : "sales_inhouse";
    if (PERAN_PENERIMA[jenis.slug].includes(usul)) setPeran(usul);
  }, [unit, jenis]);

  const ajukan = async () => {
    if (!jenis) return;
    setKirim(true);
    setGalat(null);
    setKurang([]);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: unitId,
          marketing_id: unit?.recipient.id,
          claim_type: jenis.slug,
          recipient_role: peran,
          overriding_level: jenis.slug === "overriding" ? tingkat : null,
          notes: penjelasan,
          transfer: tf,
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) {
        setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`);
        setKurang(Array.isArray(b.missing) ? b.missing : []);
        return;
      }
      setHasil(b);
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally {
      setKirim(false);
    }
  };

  if (memuat || !sesi) {
    return <MemeriksaSesi />;
  }

  if (!jenis || !unitId) {
    return (
      <div className="wrap narrow">
        <div className="banner stop" style={{ marginTop: 30 }}>
          <b>Unit atau jenis klaim tidak disebutkan</b>
          <Link href="/klaim">Kembali ke pilihan jenis</Link>
        </div>
      </div>
    );
  }

  // Nama jenisnya dipakai di lima tempat pada layar ini; dihitung sekali di
  // sini supaya kelimanya tidak bisa berbeda.
  const namaJenis = bahasa === "en" ? NAMA_EN[jenis.slug] : jenis.nama;
  const dokumen = DOKUMEN[jenis.slug];
  const dokumenLengkap = dokumen.every((d) => ceklis[d]);
  const siap = Boolean(unit?.claimable && peran && dokumenLengkap &&
                       (jenis.slug !== "overriding" || tingkat));

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul(namaJenis)}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>

      <div className="row sp">
        <Link href={`/klaim/${jenis.slug}`}>{k.kembali}</Link>
      </div>

      {busy && <p className="hint">{k.memuatUnit}</p>}

      {!busy && !unit && (
        <div className="banner stop">
          <b>{k.takAdaUnitJudul}</b>
          {k.takAdaUnitIsi}
        </div>
      )}

      {unit && (
        <>
          {unit.claim && (
            <div className="banner warn sp">
              <b>{k.sudahAdaJudul(namaJenis)}</b>
              {unit.claim.claim_number} · {unit.claim.status}. {k.sudahAdaIsi}
            </div>
          )}

          {unit.marketing_missing && (
            <div className="banner stop sp">
              <b>{k.takAdaPenerimaJudul(unit.recipient.source)}</b>
              {k.takAdaPenerimaIsi(namaJenis, unit.recipient.source)}
            </div>
          )}

          {unit.marketing_inactive && (
            <div className="banner stop sp">
              <b>{k.belumAktifJudul}</b>
              {k.belumAktifIsi(unit.recipient.name ?? "—",
                               unit.recipient.status ?? "—")}
            </div>
          )}

          {!unit.eligible && (
            <div className="banner stop sp">
              <b>{k.prasyaratJudul}</b>
              <ul style={{ margin: "4px 0 0 16px" }}>
                {unit.missing_requirements.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}

          {/* Ringkasan pengisian hanya relevan sebelum klaim tersimpan. Setelah
              itu Form Pengajuan di bawah memuat data yang sama, dan menampilkan
              keduanya membuat pembacanya menebak mana yang berlaku. */}
          {!hasil && (
          <div className="grid sp">
            <div className="panel">
              <div className="form-blok">
                <h3>{k.blokMarketing}</h3>
                <table><tbody>
                  <tr><td>{k.namaMarketing}</td>
                      <td>{unit.recipient.name ?? "—"}</td></tr>
                  <tr><td>{k.status}</td>
                      <td>{unit.recipient.type === "agent" ? "Agent" :
                           unit.recipient.type === "inhouse" ? "Inhouse" : "—"}</td></tr>
                  <tr><td>{k.namaKantor}</td>
                      <td>{unit.recipient.office ?? "PT. Serpong Bangun Lestari"}</td></tr>
                  <tr><td>{k.alamatKantor}</td>
                      <td>{unit.recipient.office_address ?? "—"}</td></tr>
                  <tr><td>{k.npwp}</td><td>{unit.recipient.npwp || "—"}</td></tr>
                  <tr><td>{k.telepon}</td>
                      <td>{unit.recipient.phone || "—"}</td></tr>
                  <tr><td>{k.email}</td><td>{unit.recipient.email || "—"}</td></tr>
                </tbody></table>
                {jenis.slug === "overriding" && (
                  <p className="hint" style={{ textAlign: "left" }}>
                    {k.catatanOverriding(unit.recipient.source)}
                  </p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="form-blok">
                <h3>{k.blokPemesanan}</h3>
                <table><tbody>
                  <tr><td>{k.project}</td><td>{unit.project_name}</td></tr>
                  <tr><td>{k.namaPemesan}</td><td>{unit.buyer_name ?? "—"}</td></tr>
                  <tr><td>{k.kluster}</td><td>{unit.cluster_code}</td></tr>
                  <tr><td>{k.noUnit}</td><td><b>{unit.code}</b></td></tr>
                  <tr><td>{k.tipe}</td><td>{unit.unit_type ?? "—"}</td></tr>
                  <tr><td>{k.luasTanah}</td>
                      <td>{unit.land_area ? `${unit.land_area} m²` : "—"}</td></tr>
                  <tr><td>{k.luasBangunan}</td>
                      <td>{unit.building_area ? `${unit.building_area} m²` : "—"}</td></tr>
                  <tr><td>{k.noKontrak}</td><td>{unit.contract_number ?? "—"}</td></tr>
                  <tr><td>{k.tanggalPenjualan}</td><td>{tgl(unit.contract_date)}</td></tr>
                  <tr><td>{k.skemaBayar}</td>
                      <td>{unit.payment_scheme ?? "—"}</td></tr>
                  <tr><td>{k.hargaTransaksi}</td>
                      <td>{rp(unit.contract_value_incl_vat)}</td></tr>
                </tbody></table>
              </div>
            </div>
          </div>
          )}

          {!hasil && (
            <>
              <div className="panel sp">
                <div className="form-blok">
                  <h3>{k.blokPeran}</h3>
                  <div className="lbl">{k.diterimaDalamPeran}</div>
                  <select value={peran} style={{ width: "100%" }}
                          onChange={(e) => setPeran(e.target.value)}>
                    <option value="">{k.pilihPeran}</option>
                    {PERAN_PENERIMA[jenis.slug].map((r) => (
                      <option key={r} value={r}>{LABEL_PERAN[r] ?? r}</option>
                    ))}
                  </select>
                  <p className="hint" style={{ textAlign: "left", marginTop: 4 }}>
                    {k.catatanPeran}
                  </p>

                  {jenis.slug === "overriding" && (
                    <>
                      <div className="lbl" style={{ marginTop: 12 }}>
                        {k.tingkatOverriding}
                      </div>
                      <select value={tingkat} style={{ width: "100%" }}
                              onChange={(e) => setTingkat(e.target.value)}>
                        <option value="">{k.pilihTingkat}</option>
                        {TINGKAT_OVERRIDING.map(([v, l]) => (
                          <option key={v} value={v}>
                            {bahasa === "en" ? (TINGKAT_EN[v] ?? l) : l}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>

                <div className="form-blok">
                  <h3>{k.blokTransfer}</h3>
                  {/* Diketik, bukan diambil dari data marketing. Orang yang
                      sama dapat minta dibayar ke rekening pribadinya kali ini
                      dan ke rekening agensinya lain kali, dan yang menentukan
                      jenis PPh adalah tujuan transfer pengajuan ini. Bila sudah
                      ada rekening tercatat, ia dipakai sebagai isian awal. */}
                  <table><tbody>
                    <tr>
                      <td>{k.namaPenerima}</td>
                      <td>
                        <input value={tf.holder_name} style={ISIAN}
                               placeholder={k.phNamaPenerima}
                               onChange={(e) =>
                                 setTf({ ...tf, holder_name: e.target.value })} />
                      </td>
                    </tr>
                    <tr>
                      <td>{k.bank}</td>
                      <td>
                        <input value={tf.bank_name} style={ISIAN}
                               placeholder={k.phBank}
                               onChange={(e) =>
                                 setTf({ ...tf, bank_name: e.target.value })} />
                      </td>
                    </tr>
                    <tr>
                      <td>{k.noRekening}</td>
                      <td>
                        <input value={tf.account_number} style={ISIAN}
                               inputMode="numeric" placeholder={k.phRekening}
                               onChange={(e) =>
                                 setTf({ ...tf, account_number: e.target.value })} />
                      </td>
                    </tr>
                    <tr>
                      <td>{k.kantorCabang}</td>
                      <td>
                        <input value={tf.branch} style={ISIAN}
                               placeholder={k.phCabang}
                               onChange={(e) =>
                                 setTf({ ...tf, branch: e.target.value })} />
                      </td>
                    </tr>
                    <tr>
                      <td>{k.atasNama}</td>
                      <td>
                        <select value={tf.holder_type} style={ISIAN}
                                onChange={(e) =>
                                  setTf({ ...tf, holder_type: e.target.value })}>
                          <option value="company">{k.badanUsaha}</option>
                          <option value="individual">{k.pribadi}</option>
                        </select>
                      </td>
                    </tr>
                  </tbody></table>

                  <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                    {k.catatanPphAwal}<b>PPh 23</b>{k.catatanPphTengah}
                    <b>PPh 21</b>. {k.catatanPphPilihan}
                    <b>{tf.holder_type === "company"
                          ? k.pilihanBadan : k.pilihanPribadi}</b>.
                  </p>

                  {/* Rekening yang baru diketik masuk sebagai belum
                      terverifikasi. Verifikasi pekerjaan Finance; mengetiknya
                      pada formulir pengajuan bukan verifikasi. */}
                  {!unit.recipient.bank && (
                    <div className="banner warn" style={{ marginBottom: 0 }}>
                      <b>{k.rekBelumVerifJudul}</b>
                      {k.rekBelumVerifIsi}
                    </div>
                  )}
                </div>

                <div className="form-blok">
                  <h3>{k.blokPenjelasan(namaJenis.toUpperCase())}</h3>
                  <textarea className="reason" value={penjelasan}
                            placeholder={k.phPenjelasan}
                            onChange={(e) => setPenjelasan(e.target.value)} />
                  <p className="hint" style={{ textAlign: "left" }}>
                    {k.catatanPenjelasan}
                  </p>
                </div>

                {dokumen.length > 0 && (
                  <div className="form-blok">
                    <h3>{k.blokDokumen(namaJenis.toUpperCase())}</h3>
                    <ul className="ceklis">
                      {dokumen.map((d, i) => (
                        <li key={d}>
                          <label>
                            <input type="checkbox" checked={Boolean(ceklis[d])}
                                   onChange={(e) =>
                                     setCeklis({ ...ceklis, [d]: e.target.checked })} />
                            <span>{i + 1}. {d}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {!dokumenLengkap && (
                      <p className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                        {k.dokumenBelumLengkap}
                      </p>
                    )}
                  </div>
                )}

                <div className="row" style={{ marginTop: 4, marginBottom: 0 }}>
                  <button className="pri" disabled={!siap || kirim}
                          onClick={() => void ajukan()}>
                    {kirim ? k.menyimpan : k.ajukan}
                  </button>
                </div>
                <p className="hint" style={{ textAlign: "left", marginTop: 8 }}>
                  {k.catatanDraft}
                </p>
              </div>
            </>
          )}

          {galat && (
            <div className="banner stop">
              <b>{k.galatJudul}</b>
              {galat}
              {kurang.length > 0 && (
                <ul style={{ margin: "4px 0 0 16px" }}>
                  {kurang.map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
            </div>
          )}

          {hasil && (
            <>
              <div className="banner ok sp">
                <b>{k.tersimpanJudul(hasil.claim_number)}</b>
                {k.tersimpanIsi}
              </div>

              <FormPengajuan klaim={hasil} />

              <div className="row" style={{ marginTop: 14, marginBottom: 0 }}>
                <button onClick={() => window.print()}>{k.cetak}</button>
                <Link href={`/klaim/${jenis.slug}`}>
                  <button>{k.ajukanLain}</button>
                </Link>
                <Link href="/konsol">
                  <button className="pri">{k.bukaKonsol}</button>
                </Link>
              </div>
            </>
          )}
        </>
      )}
    </Kerangka>
  );
}
