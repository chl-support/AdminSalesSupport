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

/**
 * Angka rupiah tanpa lambangnya.
 *
 * "Rp" disebut sekali di kepala kolom, bukan diulang pada tiap baris. Lambang
 * yang berulang di setiap sel membuat mata harus melewatinya puluhan kali untuk
 * membandingkan dua angka yang sebenarnya berdampingan.
 */
const rp = (n?: number | null) => (n ?? 0).toLocaleString("id-ID");

/**
 * Nilai kontrak tanpa PPN.
 *
 * Tarifnya berganti 1 April 2022: penjualan sebelum tanggal itu memakai 10%,
 * sejak tanggal itu 11%. Yang menentukan tarifnya adalah tanggal kontraknya,
 * bukan tanggal layar ini dibuka — nilai exclude sebuah kontrak 2021 tidak
 * berubah hanya karena dilihat hari ini.
 *
 * Tanggal kontrak yang kosong dianggap sesudah peralihan: seluruh penjualan
 * yang berjalan sekarang memang di atas 2022, dan memakai 10% untuk baris yang
 * tanggalnya belum terisi akan melebihkan nilai exclude-nya.
 */
const PERALIHAN_PPN = "2022-04-01";

function tanpaPpn(incl?: number | null, tglKontrak?: string | null): number {
  const nilai = Number(incl ?? 0);
  if (!nilai) return 0;
  const tgl = tglKontrak ? String(tglKontrak).slice(0, 10) : "";
  const tarif = tgl && tgl < PERALIHAN_PPN ? 1.10 : 1.11;
  return Math.round(nilai / tarif);
}

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
    pengantar: "Proses Pengajuan Fee dapat dilakukan setelah penerimaan " +
               "mencapai minimal 20% dari nilai kontrak. Fee yang memenuhi " +
               "syarat dapat langsung diajukan.",
    dapatDiklaim: (n: number) => `${n} dapat diklaim`,
    penjualan: (n: number) => `${n} penjualan`,
    galatBaca: "Data penjualan tidak dapat dibaca",
    cari: "Cari (Unit, Konsumen, Sales)",
    // Contohnya diambil dari unit pertama project ini, bukan kode tetap.
    // "mis. BIOBA2" pada project Naraya menyuruh orang mencari kode yang tidak
    // akan pernah ada di sana.
    contohCari: (kode: string) => `mis. ${kode}`,
    tampilkan: "Tampilkan",
    semuaPenjualan: "semua penjualan",
    yangBisa: "yang ada fee dapat diklaim",
    yangSudah: "yang sudah ada klaimnya",
    yangBelum: "yang belum dapat diklaim sama sekali",
    dataPenjualan: "Data penjualan",
    barisDitampilkan: (n: number) => `${n} baris ditampilkan`,
    thUnit: "Unit", thPembeli: "Konsumen", thPenerima: "Sales",
    thKoordinator: "Sales Koordinator",
    thSkema: "Skema Cara Bayar",
    thNilai: "Nilai Kontrak", thInclude: "(Include PPN)",
    thNilaiExcl: "Nilai Kontrak", thExclude: "(Exclude PPN)",
    thPenerimaan: "Penerimaan s/d Bulan Ini", thPersen: "Persentase Lunas",
    thKlaim: "Klaim", thKeterangan: "Keterangan",
    ajukanTerpilih: (n: number) => `Ajukan ${n} fee`,
    ajukanKosong: "Klaim",
    mengajukan: "Mengajukan…",
    gagalAjukan: "Sebagian pengajuan tidak dapat dibuat",
    dialogNama: "Penjelasan pengajuan",
    dialogJudul: (kode: string) => `Ajukan fee untuk unit ${kode}`,
    dialogPengantar:
      "Penjelasan ini tercetak pada Form Pengajuan masing-masing fee, jadi ia " +
      "dibaca yang menandatangani — bukan catatan internal. Boleh dikosongkan.",
    dialogContoh: "mis. Full Payment. Pembayaran sudah mencapai 20%.",
    dialogSamakan: "Samakan untuk semua",
    tfJudul: "Tujuan transfer",
    tfNama: "Nama penerima", tfJenis: "Atas nama",
    tfBadan: "Badan Usaha (PT)", tfPribadi: "Pribadi (Perorangan)",
    tfBank: "Bank", tfRekening: "No. rekening", tfCabang: "Kantor cabang",
    tfCatatan:
      "Atas nama siapa rekeningnya menentukan PPh 23 atau PPh 21, jadi " +
      "periksa sebelum diajukan.",
    untukSiapa: (nama: string, peran: string) => `${peran}: ${nama}`,
    dialogAjukan: "Ajukan",
    dialogBatal: "Batal",
    dialogTutup: "Tutup",
    belumTercatat: "belum tercatat",
    dariKontrak: (p: string) => `${p}% dari kontrak`,
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
    pengantar: "Fee submission can proceed once receipts reach at least 20% " +
               "of the contract value. Fees that meet the requirement can be " +
               "submitted directly.",
    dapatDiklaim: (n: number) => `${n} claimable`,
    penjualan: (n: number) => `${n} sales`,
    galatBaca: "Sales data could not be read",
    cari: "Search (Unit, Customer, Sales)",
    contohCari: (kode: string) => `e.g. ${kode}`,
    tampilkan: "Show",
    semuaPenjualan: "all sales",
    yangBisa: "with a claimable fee",
    yangSudah: "with an existing claim",
    yangBelum: "with nothing claimable yet",
    dataPenjualan: "Sales data",
    barisDitampilkan: (n: number) => `${n} rows shown`,
    thUnit: "Unit", thPembeli: "Customer", thPenerima: "Sales",
    thKoordinator: "Sales Coordinator",
    thSkema: "Payment Scheme",
    thNilai: "Contract Value", thInclude: "(VAT included)",
    thNilaiExcl: "Contract Value", thExclude: "(VAT excluded)",
    thPenerimaan: "Received to Date", thPersen: "Paid Percentage",
    thKlaim: "Claim", thKeterangan: "Notes",
    ajukanTerpilih: (n: number) => `Submit ${n} fees`,
    ajukanKosong: "Claim",
    mengajukan: "Submitting…",
    gagalAjukan: "Some submissions could not be created",
    dialogNama: "Submission notes",
    dialogJudul: (kode: string) => `Submit fees for unit ${kode}`,
    dialogPengantar:
      "These notes are printed on each fee's submission form, so whoever " +
      "signs it will read them — they are not internal remarks. May be left " +
      "blank.",
    dialogContoh: "e.g. Full payment. Payments have reached 20%.",
    dialogSamakan: "Use for all",
    tfJudul: "Transfer destination",
    tfNama: "Recipient name", tfJenis: "Held by",
    tfBadan: "Company (PT)", tfPribadi: "Individual",
    tfBank: "Bank", tfRekening: "Account number", tfCabang: "Branch",
    tfCatatan:
      "Whether the account is held by a company or an individual decides " +
      "PPh 23 or PPh 21, so check it before submitting.",
    untukSiapa: (nama: string, peran: string) => `${peran}: ${nama}`,
    dialogAjukan: "Submit",
    dialogBatal: "Cancel",
    dialogTutup: "Close",
    belumTercatat: "not recorded yet",
    dariKontrak: (p: string) => `${p}% of contract`,
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
               status: string | null; source: string; type: string | null;
               bank?: { holder_name: string | null; holder_type: string | null;
                        bank_name: string | null; account_number: string | null;
                        branch: string | null } | null };
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
  /**
   * Fee yang dicentang, sebagai kunci "<unit>:<jenis>".
   *
   * Disimpan datar, bukan bertingkat per unit: yang dibaca selalu "apakah
   * kotak ini tercentang", dan peta bertingkat memaksa tiap pembacaan
   * memeriksa dulu apakah unitnya sudah punya entri.
   */
  const [pilih, setPilih] = useState<Record<string, boolean>>({});
  const [mengajukan, setMengajukan] = useState<string | null>(null);
  /**
   * Unit yang sedang disiapkan pengajuannya, beserta penjelasan tiap fee.
   *
   * Penjelasannya per fee, bukan satu untuk semua: pada formulir aslinya ia
   * berjudul "PENJELASAN PENGAJUAN <jenis>", dan alasan Komisi dapat diajukan
   * memang tidak sama dengan alasan Closing Fee.
   */
  const [siapkan, setSiapkan] =
    useState<{ unit: Unit; jenis: Jenis[] } | null>(null);
  const [penjelasan, setPenjelasan] = useState<Record<string, string>>({});
  /**
   * Tujuan transfer per fee, bukan satu untuk seluruh unit.
   *
   * Overriding dibayarkan kepada tingkat di atas yang menjual — orang lain,
   * dengan rekening lain. Satu isian untuk seluruh unit akan mengirim
   * Overriding ke rekening Sales-nya.
   */
  const [transfer, setTransfer] = useState<Record<string, any>>({});

  /** Isian awal tujuan transfer: rekening penerima yang sudah tercatat. */
  const bawaanTransfer = (u: Unit, daftar: Jenis[]) =>
    Object.fromEntries(daftar.map((slug) => {
      const b = u.fees[slug]?.recipient?.bank;
      return [slug, {
        holder_name: b?.holder_name ?? u.fees[slug]?.recipient?.name ?? "",
        bank_name: b?.bank_name ?? "",
        account_number: b?.account_number ?? "",
        branch: b?.branch ?? "",
        holder_type: b?.holder_type === "company" ? "company" : "individual",
      }];
    }));

  const toggle = (unitId: string, jenis: Jenis) =>
    setPilih((lama) => {
      const kunci = `${unitId}:${jenis}`;
      const baru = { ...lama };
      if (baru[kunci]) delete baru[kunci]; else baru[kunci] = true;
      return baru;
    });

  const terpilihPada = (unitId: string) =>
    JENIS.filter((j) => pilih[`${unitId}:${j.slug}`]).map((j) => j.slug);

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

  /**
   * Ajukan seluruh fee yang dicentang pada satu unit, lalu buka pratinjaunya.
   *
   * Jendelanya dibuka lebih dulu, sebelum satu pun permintaan dikirim: peramban
   * hanya mengizinkan window.open yang lahir langsung dari tekanan jari. Dibuka
   * sesudah pengajuan selesai, ia akan diblokir sebagai pop-up.
   *
   * Pengajuannya berurutan, bukan serentak. Keempatnya menyentuh unit yang
   * sama, dan mengirim empat permintaan sekaligus membuat pemeriksaan
   * anti-duplikat saling berlomba.
   */
  const ajukan = async (u: Unit, jenisTerpilih: Jenis[],
                        catatan: Record<string, string>,
                        tujuan: Record<string, any>) => {
    if (!jenisTerpilih.length) return;

    const jendela = window.open("", "_blank");
    setMengajukan(u.id);
    setGalat(null);

    const dibuat: string[] = [];
    const gagal: string[] = [];
    try {
      for (const slug of jenisTerpilih) {
        const f = u.fees[slug];
        const res = await fetch("/api/claims", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unit_id: u.id,
            marketing_id: f?.recipient?.id,
            claim_type: slug,
            // Peran bawaannya mengikuti jenis penerima fee ini — bukan jenis
            // marketing unitnya, karena Overriding dibayarkan kepada orang
            // lain yang jenisnya dapat berbeda. Aturan yang sama dipakai
            // sebagai isian awal pada formulir pengajuan satuan.
            recipient_role: slug === "overriding"
              ? "sales_manager_inhouse"
              : f?.recipient?.type === "agent" ? "agent" : "sales_inhouse",
            overriding_level: slug === "overriding"
              ? "sales_manager_inhouse" : null,
            notes: (catatan[slug] ?? "").trim() || null,
            transfer: tujuan[slug] ?? null,
          }),
        });
        if (res.status === 401) { location.href = "/login"; return; }
        const b = await res.json().catch(() => ({}));
        if (!res.ok) {
          gagal.push(`${namaJenis(slug, bahasa)}: ${b.detail ?? b.title ?? res.status}`);
          continue;
        }
        dibuat.push(b.id);
      }

      if (gagal.length) setGalat(`${k.gagalAjukan} — ${gagal.join(" · ")}`);

      if (dibuat.length && jendela) {
        jendela.location.href = `/klaim/pratinjau?ids=${dibuat.join(",")}`;
      } else if (jendela) {
        jendela.close();
      }

      setPilih((lama) => {
        const baru = { ...lama };
        for (const slug of jenisTerpilih) delete baru[`${u.id}:${slug}`];
        return baru;
      });
      setSiapkan(null);
      setPenjelasan({});
      setTransfer({});
      await muat();
    } catch (e: any) {
      jendela?.close();
      setGalat(String(e?.message ?? e));
    } finally { setMengajukan(null); }
  };

  if (memuat || !sesi) return <MemeriksaSesi />;

  const q = cari.trim().toLowerCase();
  const adaKlaim = (u: Unit) => JENIS.some((j) => u.fees[j.slug]?.claim);
  const adaBisa = (u: Unit) => JENIS.some((j) => u.fees[j.slug]?.claimable);

  /**
   * Contoh pada kotak cari: kode unit pertama pada project ini.
   *
   * Diambil dari datanya sendiri supaya tidak pernah menyebut kode dari
   * project lain. Saat daftarnya masih kosong, kotaknya dibiarkan tanpa
   * contoh — menebak bentuk kodenya berarti mengarang.
   */
  const contoh = units[0]?.code ?? "";

  const terlihat = units.filter((u) => {
    // Yang dicari sama dengan yang disebut judul kotaknya: unit, konsumen,
    // dan nama Sales beserta koordinatornya. Menyaring diam-diam atas kolom
    // yang tidak disebut membuat hasil pencarian tidak dapat dijelaskan.
    if (q && ![u.code, u.buyer_name,
               u.fees.closing_fee?.recipient?.name,
               u.fees.overriding?.recipient?.name]
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
    <Kerangka sesi={sesi} lebar judul={
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
            <input value={cari}
                   placeholder={contoh ? k.contohCari(contoh) : ""}
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
                <th className="sel-penerima">{k.thKoordinator}</th>
                <th className="sel-skema">{k.thSkema}</th>
                {/* Keterangan PPN di kepala kolom, pada barisnya sendiri:
                    dua kolom bernama "Nilai Kontrak" berdampingan hanya dapat
                    dibedakan dari baris keduanya. */}
                <th>{k.thNilai}<br /><span className="satuan">{k.thInclude}</span></th>
                <th>
                  {k.thNilaiExcl}<br /><span className="satuan">{k.thExclude}</span>
                </th>
                <th>{k.thPenerimaan}</th>
                <th>{k.thPersen}</th>
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
                    {/* Sales dan koordinatornya berdiri di kolom masing-masing.
                        Dua nama bertumpuk dalam satu kolom tidak menyebut siapa
                        yang mana, dan yang membacanya harus hafal urutannya. */}
                    <td className="sel-penerima">
                      {sales?.name ?? (
                        <span style={{ color: "var(--mut)" }}>{k.belumTercatat}</span>
                      )}
                    </td>
                    <td className="sel-penerima">
                      {atas?.name && atas.id !== sales?.id ? atas.name : (
                        <span style={{ color: "var(--mut)" }}>—</span>
                      )}
                    </td>
                    <td className="sel-skema">{u.payment_scheme ?? "—"}</td>
                    <td className="n">{rp(u.contract_value_incl_vat)}</td>
                    <td className="n">
                      {rp(tanpaPpn(u.contract_value_incl_vat, u.contract_date))}
                    </td>
                    <td className="n">{rp(u.received_amount)}</td>
                    {/* Persentase lunas berdiri sebagai kolom tersendiri:
                        Komisi dihitung dari persentase pembayaran, jadi ia
                        angka yang dibaca, bukan keterangan di bawah angka
                        lain. */}
                    <td className="n">
                      {u.contract_value_incl_vat
                        ? `${persen.toFixed(1)}%`
                        : <span style={{ color: "var(--mut)" }}>—</span>}
                    </td>

                    {/* Keempat jenis fee, masing-masing dengan keadaannya. */}
                    <td className="sel-fee">
                      <div className="fee-kolom">
                        {JENIS.map((j) => {
                          const f = u.fees[j.slug];
                          const kunci = `${u.id}:${j.slug}`;
                          return (
                            <div key={j.slug} className="fee-baris">
                              {/* Kotak centang hanya untuk yang memang dapat
                                  diajukan. Kotak yang dapat dicentang tetapi
                                  tidak menghasilkan apa-apa saat tombolnya
                                  ditekan adalah janji yang tidak ditepati. */}
                              <label className="fee-pilih">
                                <input type="checkbox"
                                       disabled={!f?.claimable}
                                       checked={Boolean(pilih[kunci])}
                                       onChange={() => toggle(u.id, j.slug)} />
                                <span className="fee-nama">
                                  {namaJenis(j.slug, bahasa)}
                                </span>
                              </label>
                              {f?.claim ? (
                                <span className="fee-keadaan">
                                  <span className="pill ok">
                                    {f.claim.claim_number}
                                  </span>
                                  <span className="fee-status">
                                    {f.claim.status}
                                  </span>
                                </span>
                              ) : f?.claimable ? null : (
                                <span className="fee-belum">{k.belum}</span>
                              )}
                            </div>
                          );
                        })}

                        {/* Satu tombol untuk seluruh yang dicentang. Tombol per
                            fee memaksa empat kali bolak-balik untuk satu unit,
                            padahal keempatnya diajukan bersamaan. */}
                        <div className="fee-kaki">
                          <button className="pri"
                                  disabled={!terpilihPada(u.id).length ||
                                            mengajukan !== null}
                                  onClick={() => {
                                    const daftar = terpilihPada(u.id);
                                    setPenjelasan({});
                                    setTransfer(bawaanTransfer(u, daftar));
                                    setSiapkan({ unit: u, jenis: daftar });
                                  }}>
                            {mengajukan === u.id ? k.mengajukan
                              : terpilihPada(u.id).length
                                ? k.ajukanTerpilih(terpilihPada(u.id).length)
                                : k.ajukanKosong}
                          </button>
                        </div>
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
                  <td colSpan={11} style={{ color: "var(--mut)" }}>
                    {k.takAdaCocok}
                  </td>
                </tr>
              )}
              {busy && (
                <tr>
                  <td colSpan={11} style={{ color: "var(--mut)" }}>{k.memuat}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Penjelasan pengajuan diisi sebelum jendela pratinjau terbuka.
          Jendelanya dibuka dari tombol di dalam dialog ini — tekanan jari itu
          yang mengizinkan window.open; dibuka dari proses yang berjalan
          sesudahnya, ia diblokir sebagai pop-up. */}
      {siapkan && (
        <div className="tirai"
             onMouseDown={(e) => {
               if (e.target === e.currentTarget && !mengajukan) setSiapkan(null);
             }}>
          <div className="popup lebar" role="dialog" aria-modal="true"
               aria-label={k.dialogNama} style={{ maxWidth: 560 }}>
            <div className="popup-kepala">
              <h2>
                {k.dialogJudul(siapkan.unit.code)}
                <span className="pill">
                  {k.ajukanTerpilih(siapkan.jenis.length)}
                </span>
              </h2>
              <button className="tautan" aria-label={k.dialogTutup}
                      disabled={Boolean(mengajukan)}
                      onClick={() => setSiapkan(null)}>✕</button>
            </div>

            <div className="popup-isi">
              <p className="hint" style={{ textAlign: "left", margin: "0 0 12px" }}>
                {k.dialogPengantar}
              </p>

              {siapkan.jenis.map((slug, i) => {
                const pen = siapkan.unit.fees[slug]?.recipient;
                const tf = transfer[slug] ?? {};
                const ubah = (kolom: string, nilai: string) =>
                  setTransfer({ ...transfer,
                                [slug]: { ...tf, [kolom]: nilai } });
                return (
                  <div key={slug} className="blok-fee">
                    <h4>
                      {namaJenis(slug, bahasa)}
                      {pen?.name && (
                        <span className="pill">
                          {k.untukSiapa(pen.name, pen.source)}
                        </span>
                      )}
                    </h4>

                    <div className="lbl">{k.dialogNama}</div>
                    <textarea value={penjelasan[slug] ?? ""}
                              placeholder={k.dialogContoh}
                              style={{ width: "100%", minHeight: 52 }}
                              onChange={(e) => setPenjelasan(
                                { ...penjelasan, [slug]: e.target.value })} />
                    {/* Menyalin penjelasan pertama ke sisanya. Keempatnya
                        sering sama persis, dan mengetiknya empat kali membuat
                        orang menyingkatnya sampai tidak lagi menjelaskan apa
                        pun. Tujuan transfer sengaja tidak ikut disalin:
                        penerimanya memang berbeda orang. */}
                    {i === 0 && siapkan.jenis.length > 1 && (
                      <button style={{ marginTop: 6, padding: "2px 8px" }}
                              disabled={!(penjelasan[slug] ?? "").trim()}
                              onClick={() => setPenjelasan(
                                Object.fromEntries(siapkan.jenis.map(
                                  (j) => [j, penjelasan[slug] ?? ""])))}>
                        {k.dialogSamakan}
                      </button>
                    )}

                    <div className="lbl" style={{ marginTop: 12 }}>
                      {k.tfJudul}
                    </div>
                    <div className="filters rapat">
                      <div>
                        <div className="lbl">{k.tfNama}</div>
                        <input value={tf.holder_name ?? ""}
                               onChange={(e) => ubah("holder_name", e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">{k.tfJenis}</div>
                        <select value={tf.holder_type ?? "individual"}
                                onChange={(e) => ubah("holder_type", e.target.value)}>
                          <option value="company">{k.tfBadan}</option>
                          <option value="individual">{k.tfPribadi}</option>
                        </select>
                      </div>
                      <div>
                        <div className="lbl">{k.tfBank}</div>
                        <input value={tf.bank_name ?? ""}
                               onChange={(e) => ubah("bank_name", e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">{k.tfRekening}</div>
                        <input value={tf.account_number ?? ""} inputMode="numeric"
                               onChange={(e) => ubah("account_number", e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl">{k.tfCabang}</div>
                        <input value={tf.branch ?? ""}
                               onChange={(e) => ubah("branch", e.target.value)} />
                      </div>
                    </div>
                  </div>
                );
              })}

              <p className="hint" style={{ textAlign: "left" }}>
                {k.tfCatatan}
              </p>
            </div>

            <div className="popup-kaki">
              <div className="row">
                <button className="pri" disabled={Boolean(mengajukan)}
                        onClick={() => void ajukan(siapkan.unit, siapkan.jenis,
                                                   penjelasan, transfer)}>
                  {mengajukan ? k.mengajukan : k.dialogAjukan}
                </button>
                <button disabled={Boolean(mengajukan)}
                        onClick={() => setSiapkan(null)}>{k.dialogBatal}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Kerangka>
  );
}
