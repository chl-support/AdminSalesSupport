import { handler } from "@/lib/api";
import { query } from "@/lib/db";
import { eligibility, type ClaimType } from "@/lib/calc";

/**
 * Data penjualan, dan — bila diminta untuk satu jenis klaim — keadaan klaimnya.
 *
 * Layar "pilih unit untuk diklaim" perlu tiga hal sekaligus per unit: apakah
 * prasyarat pencairannya terpenuhi, apakah jenis klaim itu sudah pernah dibuat,
 * dan kalau sudah, nomor serta statusnya. Memisahkannya menjadi beberapa
 * panggilan memaksa layar menggabungkan sendiri, dan gabungan di peramban akan
 * salah begitu ada klaim yang dibuat orang lain di sela-sela dua panggilan itu.
 *
 * Klaim yang ditolak, dibatalkan, atau di-clawback sengaja tidak dihitung
 * sebagai "sudah diklaim": indeks uniq_active_claim pun mengecualikannya, jadi
 * unitnya memang boleh diklaim ulang. Menandainya sudah diklaim akan menyembunyikan
 * unit yang justru perlu diajukan lagi.
 */
export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const cluster = url.searchParams.get("cluster");
  const eligibleFor = url.searchParams.get("eligible_for") as ClaimType | null;

  // Marketing ikut serta: klaim mengambil penerimanya dari data penjualan, jadi
  // layar yang menampilkannya harus memperlihatkan siapa itu sebelum diklik.
  const SELECT = `
    SELECT u.*,
           m.full_name AS marketing_name, m.marketing_type,
           m.status AS marketing_status, a.name AS agency_name,
           m.npwp AS marketing_npwp, m.phone AS marketing_phone,
           m.email AS marketing_email,
           a.address AS agency_address,
           sk.full_name AS sub_coordinator_name, sk.status AS sub_coordinator_status,
           sk.npwp AS sub_coordinator_npwp, sk.phone AS sub_coordinator_phone,
           sk.email AS sub_coordinator_email, sk.marketing_type AS sub_coordinator_type,
           ska.name AS sub_coordinator_agency, ska.address AS sub_coordinator_agency_address,
           ko.full_name AS coordinator_name, ko.status AS coordinator_status
      FROM units u
      LEFT JOIN marketings m  ON m.id  = u.marketing_id
      LEFT JOIN agencies   a  ON a.id  = m.agency_id
      LEFT JOIN marketings sk ON sk.id = u.sub_coordinator_id
      LEFT JOIN agencies   ska ON ska.id = sk.agency_id
      LEFT JOIN marketings ko ON ko.id = u.coordinator_id`;

  // Rekening tujuan penerima, untuk blok Tujuan Transfer pada formulir — dan
  // karena ia yang menentukan PPh 23 atau PPh 21, layar perlu menampilkannya
  // sebelum klaim diajukan, bukan sesudah.
  const rekening = await query<any>(
    `SELECT DISTINCT ON (marketing_id) marketing_id, holder_name, holder_type,
            account_number, bank_name, branch
       FROM bank_accounts WHERE verified ORDER BY marketing_id, id`);
  const perRekening = new Map(rekening.map((b) => [b.marketing_id, b]));

  const rows = await query(
    cluster ? `${SELECT} WHERE u.cluster_code=$1 ORDER BY u.code`
            : `${SELECT} ORDER BY u.code`,
    cluster ? [cluster] : []);
  if (!eligibleFor) return rows;

  const klaim = await query<{
    unit_id: string; id: string; claim_number: string; status: string;
    net_amount: number; recipient_role: string;
  }>(
    `SELECT unit_id, id, claim_number, status, net_amount, recipient_role
       FROM claims
      WHERE claim_type = $1
        AND status NOT IN ('rejected','cancelled','clawback')`,
    [eligibleFor]);

  const perUnit = new Map(klaim.map((k) => [k.unit_id, k]));

  /**
   * Penerima fee untuk jenis klaim ini.
   *
   * Closing Fee, Komisi, dan Cash Reward dibayarkan kepada yang menjual.
   * Overriding justru membayar tingkat di atasnya — memakai Sales untuk
   * Overriding berarti membayar orang yang sama dua kali atas satu unit.
   */
  const penerima = (u: any) =>
    eligibleFor === "overriding"
      ? { id: u.sub_coordinator_id ?? u.coordinator_id,
          nama: u.sub_coordinator_name ?? u.coordinator_name,
          status: u.sub_coordinator_status ?? u.coordinator_status,
          peran: u.sub_coordinator_id ? "Sub Koordinator" : "Koordinator",
          jenis: u.sub_coordinator_type,
          npwp: u.sub_coordinator_npwp, telepon: u.sub_coordinator_phone,
          email: u.sub_coordinator_email,
          kantor: u.sub_coordinator_agency,
          alamat_kantor: u.sub_coordinator_agency_address }
      : { id: u.marketing_id, nama: u.marketing_name,
          status: u.marketing_status, peran: "Sales",
          jenis: u.marketing_type,
          npwp: u.marketing_npwp, telepon: u.marketing_phone,
          email: u.marketing_email,
          kantor: u.agency_name, alamat_kantor: u.agency_address };

  return rows.map((u) => {
    const { ok, missing, codes } = eligibility(u, eligibleFor);
    const ada = perUnit.get(u.id) ?? null;
    const p = penerima(u);
    return {
      ...u,
      eligible: ok,
      missing_requirements: missing,
      // Kode sebabnya dikirim berdampingan dengan kalimatnya: layar daftar
      // penjualan dua bahasa, dan kalimat yang sudah jadi tidak dapat
      // diterjemahkan lagi setelah sampai di peramban.
      missing_codes: codes,
      // Penerima yang berlaku untuk jenis klaim yang diminta, sudah dipilih di
      // sini supaya layar dan formulir tidak menyusun ulang aturannya sendiri.
      recipient: {
        id: p.id, name: p.nama, status: p.status, source: p.peran,
        type: p.jenis ?? null, npwp: p.npwp ?? null, phone: p.telepon ?? null,
        email: p.email ?? null, office: p.kantor ?? null,
        office_address: p.alamat_kantor ?? null,
        bank: (p.id && perRekening.get(p.id)) || null,
      },
      // Alasan terpisah, supaya layar dapat menjelaskan bedanya "belum memenuhi
      // syarat pencairan" dari "penjualannya belum menyebut marketing".
      marketing_missing: !p.id,
      marketing_inactive: Boolean(p.id) && p.status !== "active",
      claim: ada && {
        id: ada.id, claim_number: ada.claim_number, status: ada.status,
        net_amount: ada.net_amount, recipient_role: ada.recipient_role,
      },
      // Dapat diklaim hanya bila prasyaratnya terpenuhi, belum ada klaim aktif,
      // DAN data penjualannya menyebut marketing yang berstatus aktif. Ketiganya
      // digabung di sini supaya layar memakai satu nilai, bukan menyusun ulang
      // aturannya — dan supaya tombol tidak pernah muncul untuk permintaan yang
      // sudah pasti ditolak createClaim.
      claimable: ok && !ada && Boolean(p.id) && p.status === "active",
    };
  });
});
