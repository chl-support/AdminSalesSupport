/**
 * Helper bersama untuk route handler.
 *
 * Identitas berasal dari cookie sesi yang diterbitkan /api/auth/login. Header
 * `X-User` yang dipakai sebelumnya sudah dihapus: ia membiarkan siapa pun mengaku
 * sebagai siapa pun hanya dengan mengganti satu baris pada permintaan, sehingga
 * selama masih diterima, halaman masuk tidak menambah keamanan apa pun.
 *
 * Pemeriksaan peran tetap dijalankan di server, terpisah dari cara identitasnya
 * dibuktikan, supaya penggantian lapisan auth berikutnya (OIDC/JWT, PRD 14) tidak
 * mengubah kebijakan wewenangnya.
 */

import { NextResponse, type NextRequest } from "next/server";
import { explainDbError, one, query } from "./db";
import { COOKIE, userFromToken } from "./auth";
import { WorkflowError } from "./workflow";
import { ensureKolomMarketing } from "./kolom";

export type User = {
  id: string; username: string; full_name: string; role: string;
  project_id?: string | null;
  project_slug?: string | null;
  project_name?: string | null;
  project_company?: string | null;
};

export async function currentUser(req: NextRequest): Promise<User> {
  // Tambahan skema yang tertinggal dari migrasi dipasang di sini, satu titik
  // untuk seluruh route: tiap route yang butuh sesi melewati fungsi ini, dan
  // melewatinya sebelum membuka transaksi apa pun — ALTER TABLE di tengah
  // transaksi yang sudah memegang kunci atas tabel yang sama akan saling
  // menunggu. Sekali per proses; pemanggilan berikutnya hanya menunggu janji
  // yang sudah selesai. Lihat src/lib/kolom.ts.
  await ensureKolomMarketing();

  const token = req.cookies.get(COOKIE)?.value ?? "";
  const user = await userFromToken(token);
  if (!user) {
    throw new WorkflowError(
      "Sesi tidak ditemukan atau sudah berakhir. Silakan masuk kembali.",
      "unauthenticated", 401);
  }
  return user;
}

/**
 * Project yang sedang dikerjakan, dan keharusan memilihnya lebih dulu.
 *
 * Satu pemasangan melayani beberapa project sekaligus, dan hampir seluruh data disaring
 * menurut project ini. Route yang lupa memanggilnya akan bekerja atas seluruh
 * project sekaligus — sesuatu yang tidak akan terlihat sampai ada klaim yang
 * dibayarkan dari data project lain. Karena itu ia mengembalikan galat, bukan
 * nilai kosong yang boleh diabaikan.
 */
export async function projectAktif(req: NextRequest): Promise<string> {
  const user = await currentUser(req);
  if (!user.project_id) {
    throw new WorkflowError(
      "Project belum dipilih. Pilih project yang akan dikerjakan lebih dulu.",
      "project_required", 409);
  }
  return user.project_id;
}

export async function requireRole(
  req: NextRequest, ...roles: string[]
): Promise<User> {
  const user = await currentUser(req);
  if (roles.length && !roles.includes(user.role)) {
    throw new WorkflowError(
      `Peran '${user.role}' tidak berwenang. Diperlukan: ${roles.join(", ")}.`,
      "forbidden", 403);
  }
  return user;
}

/**
 * Bungkus handler: menuntut sesi, lalu mengubah WorkflowError menjadi respons
 * problem+json (RFC 9457).
 *
 * Sesi dituntut secara bawaan, bukan diserahkan pada masing-masing route.
 * Sebelumnya autentikasi hanya terjadi pada route yang kebetulan memanggil
 * currentUser, dan sembilan route lain — di antaranya unduhan Laporan Master
 * yang memuat seluruh nilai klaim — terbuka bagi siapa pun yang tahu URL-nya.
 * Route yang lupa diberi pemeriksaan seharusnya gagal tertutup, bukan terbuka.
 *
 * Yang benar-benar publik menyatakannya sendiri lewat `{ publik: true }`, dan
 * masing-masing punya pengaman tersendiri: token tanda tangan, hash dokumen,
 * atau SETUP_SECRET.
 */
export function handler<T>(
  fn: (req: NextRequest, ctx: any) => Promise<T>,
  opsi: { publik?: boolean } = {},
) {
  return async (req: NextRequest, ctx: any) => {
    try {
      if (!opsi.publik) await currentUser(req);
      const result = await fn(req, ctx);
      if (result instanceof NextResponse || result instanceof Response) return result;
      return NextResponse.json(result as any);
    } catch (err: any) {
      if (err instanceof WorkflowError) {
        return NextResponse.json(
          {
            type: `https://klaim.sbl.co.id/problems/${err.code}`,
            title: err.message, status: err.status, detail: err.message,
            ...err.extra,
          },
          { status: err.status, headers: { "content-type": "application/problem+json" } },
        );
      }
      console.error(err);
      // Galat basis data diterjemahkan menjadi pesan yang menyebut langkah
      // perbaikannya — tanpa ini, kegagalan konfigurasi di produksi muncul sebagai
      // kode pg mentah yang tidak menuntun ke mana pun.
      const isDbError = typeof err?.code === "string" &&
        /^[0-9A-Z]{5}$/.test(err.code) || ["ECONNREFUSED", "ENOTFOUND",
        "ETIMEDOUT"].includes(err?.code);
      return NextResponse.json(
        {
          type: isDbError ? "https://klaim.sbl.co.id/problems/database"
                          : "about:blank",
          title: isDbError ? "Basis data tidak dapat diakses" : "Kesalahan internal",
          status: 500,
          detail: isDbError ? explainDbError(err) : String(err?.message ?? err),
          ...(isDbError ? { pgCode: err.code } : {}),
        },
        { status: 500, headers: { "content-type": "application/problem+json" } },
      );
    }
  };
}

export async function body<T = any>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export const idemKey = (req: NextRequest) => req.headers.get("idempotency-key");

export function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Tampilan klaim beserta unit dan marketing-nya. */
/**
 * Klaim beserta segala yang diperlukan untuk mencetak Form Pengajuan-nya.
 *
 * Agensi, email, dan rekening tujuan ikut diambil karena ketiganya ada pada
 * formulir kertas — nama kantor marketing, alamatnya, dan blok Tujuan Transfer.
 * Mengambilnya terpisah di setiap layar berarti tiap layar menyusun ulang
 * gabungannya sendiri, dan cepat atau lambat salah satunya lupa satu bidang.
 */
export async function claimView(claim: any) {
  const unit = await one("SELECT * FROM units WHERE id=$1", [claim.unit_id]);
  const mkt = await one(
    `SELECT m.id, m.full_name, m.marketing_type, m.category, m.phone, m.email,
            m.npwp, m.npwp_type, m.recipient_type, m.status,
            a.name AS agency_name, a.address AS agency_address, a.npwp AS agency_npwp
       FROM marketings m LEFT JOIN agencies a ON a.id = m.agency_id
      WHERE m.id = $1`,
    [claim.marketing_id]);
  const bank = claim.bank_account_id
    ? await one(
        `SELECT holder_name, holder_type, account_number, bank_name, branch
           FROM bank_accounts WHERE id = $1`, [claim.bank_account_id])
    : null;

  // Tanda tangan yang lolos verifikasi, untuk ditempel pada kolom Pemohon.
  //
  // Diambil dari percobaan yang berhasil, bukan dari percobaan terakhir: setelah
  // satu tanda tangan diterima, percobaan sesudahnya (kalau ada) bukan lagi yang
  // mengesahkan formulir ini.
  const ttd = await one(
    `SELECT image_png, occurred_at FROM signature_attempts
      WHERE claim_id = $1 AND outcome = 'verified'
      ORDER BY occurred_at DESC LIMIT 1`, [claim.id]);

  // Lampiran: nama dan ukurannya saja. Isi berkas tidak ikut dibawa ke layar —
  // satu klaim dengan tiga pindaian akan membuat setiap pemuatan konsol
  // mengangkut berkasnya sekali lagi. Isinya diambil per berkas saat dibuka.
  const dokumen = await query(
    `SELECT id, checklist_item, file_name, content_type, size_bytes, source,
            uploaded_by, uploaded_at, (content IS NOT NULL) AS has_content
       FROM claim_documents WHERE claim_id = $1 ORDER BY uploaded_at`,
    [claim.id]);

  // Project ikut dibawa: kop formulir memakai nama PT project-nya, dan klaim
  // lama harus tetap mencetak nama yang berlaku bagi project itu — bukan nama
  // project yang kebetulan sedang dibuka orang yang mencetaknya.
  const proyek = claim.project_id
    ? await one(
        "SELECT slug, name, company_name FROM projects WHERE id=$1",
        [claim.project_id])
    : null;

  // Siapa yang mengajukan. Tidak ada kolomnya pada tabel claims, tetapi
  // jejak auditnya mencatat pelakunya saat klaim dibuat — dan jejak itu
  // memang sumber yang benar: ia tidak dapat diubah belakangan.
  const pengaju = await one<{ actor: string; full_name: string | null }>(
    `SELECT a.actor, u.full_name
       FROM audit_log a LEFT JOIN users u ON u.username = a.actor
      WHERE a.entity_type = 'claim' AND a.entity_id = $1 AND a.action = 'create'
      ORDER BY a.occurred_at LIMIT 1`,
    [String(claim.id)]);

  return {
    ...claim, unit, marketing: mkt, bank_account: bank,
    project: proyek,
    diajukan_oleh: pengaju?.actor ?? null,
    diajukan_oleh_nama: pengaju?.full_name ?? null,
    documents: dokumen,
    signature_png: ttd?.image_png ?? null,
    signed_display_at: ttd?.occurred_at ?? claim.signed_at ?? null,
  };
}
