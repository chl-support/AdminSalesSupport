import { handler, requireRole, body, claimView } from "@/lib/api";
import { audit, query } from "@/lib/db";
import { WorkflowError, getClaim, transition } from "@/lib/workflow";
import { BATAS_TITIPAN, simpanLampiran } from "@/lib/lampiran";
import { rakitUnggah } from "@/lib/memo";
import { bolehGerak, tahapDari } from "@/lib/tahap";
import { jalurKe } from "@/lib/tahap-alur";

/** Menulis berkas ke basis data; beri waktu yang cukup. */
export const maxDuration = 60;

/** Penanda lampiran bagi dokumen yang sudah lengkap tanda tangannya. */
export const ITEM_FULL_SIGN = "dokumen_full_sign";

/**
 * Mengunggah dokumen full sign, lalu memajukan klaim ke Persetujuan Final.
 *
 * Tentang pemeriksaan keaslian yang TIDAK dikerjakan di sini.
 *
 * Alur ini punya jalur lain, scanReturn(), yang mencocokkan sidik digital
 * dokumen yang dipindai dengan dokumen yang diterbitkan sistem lalu menolak
 * bila tidak cocok — mencegah dokumen yang beredar ditukar dokumen lain
 * sebelum disetujui. Jalur di sini sengaja tidak memakainya: yang diminta
 * adalah tombol unggah sederhana, dan berkas hasil pindaian tidak akan pernah
 * sama sidik digitalnya dengan PDF terbitan sistem.
 *
 * Keputusan itu diambil sadar, dan karena itu dicatat tegas pada jejak
 * auditnya: tindakan 'full_sign_unggah' menyimpan penanda terverifikasi:false
 * beserta alasannya. Siapa pun yang kelak menelusuri sebuah pembayaran akan
 * menemukan bahwa persetujuan final klaim ini berdasar berkas yang diunggah
 * orang, bukan pindaian yang lolos pencocokan — bukan menemukan catatan yang
 * seolah-olah keduanya sama.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system",
                                 "finance_manager", "head_finance");
  const p = await body(req);
  if (!p.content_base64 && !p.unggah_id) {
    throw new WorkflowError("Dokumen full sign belum dipilih.",
                            "file_required", 422);
  }

  const klaim = await getClaim(id);
  if (!bolehGerak(klaim.status)) {
    throw new WorkflowError(
      "Dokumennya belum ditandatangani, jadi belum memasuki tahap peredaran.",
      "belum_beredar", 422);
  }

  // Dituju "awaiting_settlement_date", bukan berhenti di "approved".
  // Keduanya sama-sama tahap Persetujuan Final; bedanya, settle() — yang
  // mencatat pembayaran pada tahap berikutnya — hanya menerima klaim yang
  // sudah menunggu tanggal pembayaran. Berhenti di "approved", tombol Catat
  // pembayaran muncul lalu ditolak dengan "perpindahan tidak diizinkan".
  // offlineApproval() menempuh kedua langkah itu berurutan pula.
  const sudah = (tahapDari(klaim.status) ?? 0) >= 3;
  const jalur = sudah ? [] : jalurKe(klaim.status, "awaiting_settlement_date");
  if (!jalur) {
    throw new WorkflowError(
      "Tidak ada jalur dari keadaan sekarang ke Persetujuan Final.",
      "tanpa_jalur", 422);
  }

  // Titipan dirakit sesudah klaimnya lolos pemeriksaan, bukan sebelum.
  // rakitUnggah() membuang potongannya begitu selesai merakit, jadi merakit
  // lebih dulu lalu menolak klaimnya berarti berkas yang sudah susah payah
  // dikirim hilang tanpa tersimpan di mana pun — dan yang mengunggah harus
  // mengirim sepuluh megabita itu sekali lagi.
  //
  // Dokumen pindaian belasan halaman datang lewat jalur ini; batasnya
  // BATAS_TITIPAN, sebab potongannya tidak pernah melewati batas satu
  // permintaan. Lihat titipBerkas() di layarnya.
  const titipan = p.unggah_id
    ? await rakitUnggah(String(p.unggah_id), user.username)
    : null;

  // Berkasnya disimpan lebih dulu. Klaim yang sudah berpindah ke "disetujui"
  // tetapi gagal menyimpan berkasnya adalah persetujuan tanpa dasar tertulis;
  // berkas yang tersimpan tanpa perpindahan hanya lampiran yang menunggu.
  const dok = await simpanLampiran(id, {
    checklist_item: ITEM_FULL_SIGN,
    file_name: p.file_name ?? titipan?.file_name ?? "dokumen-full-sign.pdf",
    content_type: titipan?.content_type ?? p.content_type,
    content_base64: titipan ? undefined : p.content_base64,
  }, {
    source: "full_sign", uploadedBy: user.username,
    ...(titipan ? { buf: titipan.buf, batas: BATAS_TITIPAN } : {}),
  });

  await audit({
    entityType: "claim", entityId: id, action: "full_sign_unggah",
    actor: user.username,
    after: {
      file: (dok as any).file_name,
      terverifikasi: false,
      catatan: "Diunggah lewat tombol unggah; sidik digitalnya tidak " +
               "dicocokkan dengan dokumen terbitan sistem.",
    },
  });

  for (const langkah of jalur) await transition(id, langkah, user.username);

  // Instruksi pembayarannya dibuatkan di sini, sebagaimana offlineApproval()
  // membuatnya pada jalur persetujuan yang lain. Tanpa ini klaim sampai di
  // "disetujui" tanpa satu pun instruksi yang menunggu, dan pembayarannya
  // tidak akan pernah dapat dicatat — tahap terakhir menjadi buntu.
  //
  // ON CONFLICT tidak dipakai; yang menjaga agar tidak berganda adalah
  // pemeriksaan tahap di atas, yang menolak klaim yang sudah melewati
  // Persetujuan Final.
  if (!sudah) {
    await query(
      `INSERT INTO payment_instructions (claim_id, recipient_name, bank_name,
         account_number, amount)
       SELECT c.id, COALESCE(b.holder_name, m.full_name), b.bank_name,
              b.account_number, c.net_amount
       FROM claims c JOIN marketings m ON m.id=c.marketing_id
       LEFT JOIN bank_accounts b ON b.id=c.bank_account_id WHERE c.id=$1`,
      [id]);
  }

  return claimView(await getClaim(id));
});
