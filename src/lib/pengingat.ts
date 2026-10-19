/**
 * Pengingat lewat email: berapa pekerjaan yang sedang menunggu seseorang.
 *
 * Pemberitahuan di dalam aplikasi hanya terbaca oleh yang membuka aplikasinya.
 * Tim pajak yang tidak membuka konsol hari itu tidak tahu ada formulir yang
 * menunggu diverifikasi, dan pekerjaan yang hanya terlihat oleh yang mencarinya
 * tertunda berhari-hari tanpa ada yang tahu. Surel inilah yang menembus itu:
 * ia datang ke tempat orangnya sudah berada sepanjang hari.
 *
 * Tiga keputusan yang membentuknya:
 *
 *  1. **Isinya jumlah, bukan satu surel per dokumen.** Sepuluh pengajuan yang
 *     diteruskan berturut-turut menghasilkan satu kalimat — "ada 10 pengajuan
 *     menunggu" — bukan sepuluh surel yang akan disaring ke folder lain
 *     sesudah hari kedua.
 *  2. **Dibatasi satu surel per peran per jeda** (bawaan 60 menit, diatur
 *     lewat `kabar_jeda_menit`). Tanpa jeda, satu sore sibuk di layar Admin
 *     Sales menjadi dua puluh surel ke tim pajak.
 *  3. **Kegagalannya tidak pernah menjatuhkan pekerjaannya.** Surel yang tidak
 *     terkirim tidak boleh membuat pengajuan gagal diteruskan; ia dicatat dan
 *     ditinggalkan. Pengirimannya pun tidak ditunggu oleh yang memanggilnya.
 *
 * Tanpa RESEND_API_KEY dan SUREL_PENGIRIM terpasang, seluruh berkas ini diam —
 * lihat src/lib/surel.ts.
 */

import { one, query, setting, setSetting } from "./db";
import { kirimSurel, surelSiap } from "./surel";

/**
 * Status tempat pekerjaan benar-benar berhenti menunggu sebuah peran.
 *
 * Disalin dari /api/claims/menunggu dengan sengaja dijaga sama: angka di surel
 * yang berbeda dari angka di layar membuat yang membacanya berhenti percaya
 * pada keduanya.
 */
export const MENUNGGU: Record<string, string[]> = {
  admin_sales: ["pending_admin_review", "tax_verified",
                "signature_review_required", "awaiting_scan_upload"],
  finance_tax: ["pending_tax_verification"],
  finance_manager: ["pending_tax_verification", "approved",
                    "awaiting_settlement_date"],
  finance_payment: ["approved", "awaiting_settlement_date"],
  head_finance: ["circulating_head_finance"],
  management: ["circulating_management"],
  admin_system: [],
};

/** Kalimat untuk tiap status, dari sudut pandang yang menunggunya. */
const TUGAS: Record<string, string> = {
  pending_admin_review: "menunggu diperiksa sebelum diteruskan ke tim pajak",
  pending_tax_verification: "menunggu verifikasi pajak",
  tax_verified: "sudah diperiksa tim pajak — menunggu tautan tanda tangan dikirim",
  signature_review_required: "menunggu tanda tangan diperiksa manual",
  awaiting_scan_upload: "menunggu unggahan pindaian dokumen bertanda tangan",
  circulating_head_finance: "menunggu tanda tangan Head Finance",
  circulating_management: "menunggu tanda tangan manajemen",
  approved: "menunggu penetapan tanggal pembayaran",
  awaiting_settlement_date: "menunggu tanggal pembayaran",
};

/** Peran mana yang menunggui status ini. */
export function peranYangMenunggu(status: string): string[] {
  return Object.entries(MENUNGGU)
    .filter(([, daftar]) => daftar.includes(status))
    .map(([peran]) => peran);
}

const JEDA_BAWAAN = 60;

async function bolehKirim(peran: string): Promise<boolean> {
  const jeda = Number(await setting("kabar_jeda_menit")) || JEDA_BAWAAN;
  const kunci = `kabar_terakhir_${peran}`;
  const lalu = await setting(kunci);
  if (lalu) {
    const selisih = (Date.now() - new Date(lalu).getTime()) / 60000;
    if (selisih < jeda) return false;
  }
  await setSetting(kunci, new Date().toISOString());
  return true;
}

/** Satu baris hitungan: berapa pekerjaan, pada status apa, di project mana. */
export type Rincian = { project: string; status: string; jumlah: number };

/** Nama pengganti bagi klaim lama yang belum punya project. */
export const TANPA_PROJECT = "Tanpa project";

/**
 * Isi surel bagian tengahnya: pekerjaan yang menunggu, dikelompokkan per
 * project dan disebut nama project-nya.
 *
 * Dipisah dari pengirimannya supaya bentuknya dapat diuji tanpa mengirim
 * surel — dan supaya yang mengubah susunannya melihat contoh hasilnya di
 * rangkaian uji, bukan di kotak masuk orang.
 */
export function susunRincian(rincian: Rincian[]): string {
  const perProject = new Map<string, Rincian[]>();
  for (const r of rincian) {
    const daftar = perProject.get(r.project) ?? [];
    daftar.push(r);
    perProject.set(r.project, daftar);
  }
  return [...perProject.entries()]
    .map(([project, baris]) => {
      const jumlah = baris.reduce((t, b) => t + b.jumlah, 0);
      return `${project} (${jumlah}):\n` + baris
        .map((b) => `  • ${b.jumlah} ${TUGAS[b.status] ?? b.status}`)
        .join("\n");
    })
    .join("\n\n");
}

/**
 * Mengabari satu peran bahwa ada pekerjaan menunggu.
 *
 * Dipanggil tanpa ditunggu (`void`) dari tempat status klaim berpindah.
 */
export async function kabariPeran(peran: string, alamatAplikasi?: string) {
  const status = MENUNGGU[peran] ?? [];
  if (!status.length || !surelSiap()) return;

  const penerima = await query<{ id: string; username: string;
                                 full_name: string; email: string }>(
    `SELECT id, username, full_name,
            NULLIF(to_jsonb(users) ->> 'email','') AS email
       FROM users
      WHERE role = $1::user_role AND active
        AND NULLIF(to_jsonb(users) ->> 'email','') IS NOT NULL`, [peran]);
  if (!penerima.length) return;

  // Dipilah per project, bukan satu angka gabungan: satu peran mengerjakan
  // beberapa project, dan "ada 7 pengajuan menunggu" tanpa menyebut project
  // tidak memberi tahu di mana ketujuhnya berada — yang membacanya tetap harus
  // membuka satu per satu untuk tahu harus mulai dari mana.
  const rincian = await query<Rincian>(
    `SELECT COALESCE(p.name, $2) AS project, c.status, count(*)::int AS jumlah
       FROM claims c LEFT JOIN projects p ON p.id = c.project_id
      WHERE c.status = ANY($1::claim_status[])
      GROUP BY 1, 2
      ORDER BY 1, 3 DESC`, [status, TANPA_PROJECT]);
  const total = rincian.reduce((t, r) => t + r.jumlah, 0);
  if (!total) return;

  // Jedanya diperiksa paling akhir: bila tidak ada yang menunggu, tidak ada
  // gunanya menghabiskan jatah satu surel per jam untuk peran itu.
  if (!await bolehKirim(peran)) return;

  const baris = susunRincian(rincian);
  const alamat = alamatAplikasi
    ?? process.env.ALAMAT_APLIKASI
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : "");

  for (const p of penerima) {
    try {
      await kirimSurel({
        kepada: p.email,
        jenis: "pengingat",
        userId: p.id,
        perihal: `${total} pekerjaan menunggu Anda — CHL Sales Admin`,
        isi:
          `Halo ${p.full_name},\n\n` +
          `Ada ${total} pengajuan yang sedang menunggu giliran Anda:\n\n` +
          `${baris}\n\n` +
          (alamat ? `Buka: ${alamat}\n\n` : "") +
          `Surel ini dikirim sendiri oleh sistem ketika ada pekerjaan baru ` +
          `yang jatuh ke peran Anda, paling sering satu kali per jam — bukan ` +
          `satu surel untuk tiap dokumen.\n`,
      });
    } catch (e) {
      // Satu alamat yang ditolak tidak boleh menghentikan yang lain, dan tidak
      // satu pun boleh menjatuhkan pekerjaan yang memicunya.
      console.error(`pengingat gagal ke ${p.email}:`, e);
    }
  }
}

/**
 * Mengabari peran-peran yang menunggui status baru sebuah klaim.
 *
 * Tidak ditunggu pemanggilnya: pengiriman surel memakan ratusan milidetik, dan
 * orang yang menekan "Teruskan ke Pajak" tidak perlu menunggunya.
 */
export function kabariStatus(status: string): void {
  if (!surelSiap()) return;
  for (const peran of peranYangMenunggu(status)) {
    void kabariPeran(peran).catch((e) =>
      console.error(`pengingat peran ${peran} gagal:`, e));
  }
}
