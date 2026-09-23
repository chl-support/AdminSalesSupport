import { handler, projectAktif } from "@/lib/api";
import { query } from "@/lib/db";
import { dapatDiklaim, eligibility, type ClaimType } from "@/lib/calc";

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
  // Seluruh daftar disaring ke project yang sedang dikerjakan. Penyaringnya ada
  // di kueri, bukan di layar: layar yang lupa menyaring akan menampilkan
  // penjualan project lain sebagai penjualan yang dapat diklaim.
  const projectId = await projectAktif(req);
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
           m.email AS marketing_email, m.category AS marketing_category,
           a.address AS agency_address,
           sk.full_name AS sub_coordinator_name, sk.status AS sub_coordinator_status,
           sk.npwp AS sub_coordinator_npwp, sk.phone AS sub_coordinator_phone,
           sk.email AS sub_coordinator_email, sk.marketing_type AS sub_coordinator_type,
           sk.category AS sub_coordinator_category,
           ko.category AS coordinator_category,
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

  /**
   * Unit batal tidak ikut saat daftarnya diminta untuk pengajuan fee.
   *
   * Yang dilihat di layar Pengajuan Fee adalah penjualan bersih: unit yang
   * pesanannya dibatalkan bukan penjualan, dan tidak akan pernah menghasilkan
   * fee. Menampilkannya berikut keterangan "unit sudah dibatalkan" hanya
   * memanjangkan daftar dengan baris yang tidak pernah menjadi pekerjaan siapa
   * pun — dan membuat jumlah "N penjualan" di atasnya tidak cocok dengan angka
   * penjualan bersih yang dipakai di tempat lain.
   *
   * Penyaringnya hanya berlaku bila daftar ini diminta untuk satu atau seluruh
   * jenis fee. Tanpa `eligible_for`, endpoint ini adalah daftar unit apa
   * adanya, dan yang memanggilnya memang perlu melihat yang batal juga.
   */
  const saring = eligibleFor ? " AND u.status <> 'cancelled'" : "";

  const rows = await query(
    cluster
      ? `${SELECT} WHERE u.project_id=$1 AND u.cluster_code=$2${saring}
         ORDER BY u.code`
      : `${SELECT} WHERE u.project_id=$1${saring} ORDER BY u.code`,
    cluster ? [projectId, cluster] : [projectId]);
  if (!eligibleFor) return rows;

  /**
   * `eligible_for=all` menjawab keempat jenis sekaligus.
   *
   * Daftar penjualan tidak lagi dibuka satu jenis pada satu waktu: keempatnya
   * berdiri berdampingan pada baris yang sama. Memanggil endpoint ini empat
   * kali dari peramban akan mengirim seluruh kolom unit empat kali pula, dan
   * keempat jawabannya tiba pada saat yang berbeda — klaim yang dibuat orang
   * lain di sela-selanya membuat satu baris menyebut dua keadaan sekaligus.
   */
  const SEMUA: ClaimType[] =
    ["closing_fee", "cash_reward", "continuity_reward",
     "commission", "overriding"];
  const semuaJenis = (eligibleFor as string) === "all";
  const diminta: ClaimType[] = semuaJenis ? SEMUA : [eligibleFor];

  const klaim = await query<{
    unit_id: string; claim_type: ClaimType; id: string; claim_number: string;
    status: string; net_amount: number; recipient_role: string;
  }>(
    `SELECT unit_id, claim_type, id, claim_number, status, net_amount,
            recipient_role
       FROM claims
      WHERE claim_type = ANY($1) AND project_id = $2
        AND status NOT IN ('rejected','cancelled','clawback')`,
    [diminta, projectId]);

  /** Klaim aktif per unit per jenis. */
  const perUnitJenis = new Map(
    klaim.map((k) => [`${k.unit_id}:${k.claim_type}`, k]));

  /**
   * Penerima fee untuk jenis klaim ini.
   *
   * Closing Fee, Komisi, dan Cash Reward dibayarkan kepada yang menjual.
   * Overriding justru membayar tingkat di atasnya — memakai Sales untuk
   * Overriding berarti membayar orang yang sama dua kali atas satu unit.
   */
  const penerima = (u: any, jenis: ClaimType) =>
    jenis === "overriding"
      ? { id: u.sub_coordinator_id ?? u.coordinator_id,
          nama: u.sub_coordinator_name ?? u.coordinator_name,
          status: u.sub_coordinator_status ?? u.coordinator_status,
          peran: u.sub_coordinator_id ? "Sub Koordinator" : "Koordinator",
          jenis: u.sub_coordinator_type,
          npwp: u.sub_coordinator_npwp, telepon: u.sub_coordinator_phone,
          email: u.sub_coordinator_email,
          kategori: u.sub_coordinator_id ? u.sub_coordinator_category
                                         : u.coordinator_category,
          kantor: u.sub_coordinator_agency,
          alamat_kantor: u.sub_coordinator_agency_address }
      : { id: u.marketing_id, nama: u.marketing_name,
          status: u.marketing_status, peran: "Sales",
          jenis: u.marketing_type,
          npwp: u.marketing_npwp, telepon: u.marketing_phone,
          email: u.marketing_email,
          kategori: u.marketing_category,
          kantor: u.agency_name, alamat_kantor: u.agency_address };

  /** Keadaan satu unit untuk satu jenis klaim. */
  const keadaan = (u: any, jenis: ClaimType) => {
    const { ok, missing, codes } = eligibility(u, jenis);
    const ada = perUnitJenis.get(`${u.id}:${jenis}`) ?? null;
    const p = penerima(u, jenis);
    return {
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
        type: p.jenis ?? null,
        // Kategori penerima fee — bukan jenis marketing. Dialog pengajuan
        // memakainya sebagai pilihan awal pemilih kategorinya.
        category: p.kategori ?? null, npwp: p.npwp ?? null, phone: p.telepon ?? null,
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
      // Aturannya ada di lib/calc — dipakai juga oleh pemberitahuan saat masuk,
      // yang menghitung berapa fee sudah dapat diklaim tapi belum diajukan.
      // Ditulis dua kali, keduanya akan berbeda cepat atau lambat.
      claimable: dapatDiklaim(u, jenis, Boolean(ada)),
    };
  };

  return rows.map((u) => semuaJenis
    ? {
        ...u,
        // Bentuknya sengaja berbeda dari jawaban satu jenis, bukan gabungan
        // keduanya: baris yang memuat `eligible` di akarnya sekaligus `fees` di
        // dalamnya mengundang layar memakai yang mana saja yang lebih dekat,
        // dan yang di akar tidak pernah menyebut jenis apa yang dimaksud.
        fees: Object.fromEntries(SEMUA.map((j) => [j, keadaan(u, j)])),
      }
    : { ...u, ...keadaan(u, eligibleFor) });
});
