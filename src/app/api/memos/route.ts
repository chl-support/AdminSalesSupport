import { handler, currentUser, projectAktif } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { daftarMemo, lampiranProject, namaDikenal, rakitUnggah, simpanMemo }
  from "@/lib/memo";
import { bedahSkemaExcel, type KolomMemo } from "@/lib/memo-excel";
import { bisaDibacaExcel } from "@/lib/lembar-kerja";

/** Menulis berkas memo ke basis data; beri waktu yang cukup. */
export const maxDuration = 60;

/** Memo pada project yang sedang dikerjakan. */
export const GET = handler(async (req) => {
  const projectId = await projectAktif(req);
  // Lampirannya ikut, sekali ambil. Layar rekapitulasi menampilkan semuanya
  // sekaligus; satu permintaan per memo berarti sepuluh perjalanan bolak-balik
  // untuk sesuatu yang sudah diketahui seluruhnya di sini.
  return {
    memos: await daftarMemo(projectId),
    lampiran: await lampiranProject(projectId),
    // Acuan ejaan nama penanda tangan bagi pembacaan OCR di peramban. Tidak
    // disaring per project: penanda tangan memo berulang lintas project.
    nama: await namaDikenal(),
    // Rincian skema tidak ikut: layarnya tidak lagi menampilkannya, dan
    // mengambilnya berarti satu kueri per pembukaan layar tanpa pembaca.
    // Rekap Excel mengambilnya sendiri lewat skemaProject().
  };
});

/**
 * Unggah memo.
 *
 * Terbuka bagi semua peran yang sudah masuk: memo adalah rujukan bersama, dan
 * yang memegang berkasnya belum tentu Admin IT. Penghapusannya yang dibatasi.
 */
export const POST = handler(async (req) => {
  const user = await currentUser(req);
  const projectId = await projectAktif(req);

  const form = await req.formData().catch(() => null);
  const teks = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  // Berkasnya boleh tiba dengan dua cara: utuh dalam permintaan ini, atau
  // sebagai titipan yang tadi dikirim sepotong demi sepotong. Yang kedua
  // dipakai untuk berkas besar — lihat mulaiUnggah() di @/lib/memo.
  const titipan = teks("unggah_id");
  const berkas = form?.get("file");
  if (!titipan && (!berkas || typeof berkas === "string")) {
    throw new WorkflowError("Berkas memo belum dipilih.", "file_required", 422);
  }
  const isi = titipan
    ? await rakitUnggah(titipan, user.username)
    : {
        buf: Buffer.from(await (berkas as File).arrayBuffer()),
        file_name: (berkas as File).name,
        content_type: (berkas as File).type || "application/octet-stream",
      };

  // Rincian skemanya dikirim sebagai JSON dalam satu medan formulir: jumlah
  // barisnya berbeda tiap memo, dan medan bernomor akan memaksa kedua sisi
  // menghitung hal yang sama dengan cara yang berbeda.
  let skema = null;
  const mentah = form?.get("skema");
  if (typeof mentah === "string" && mentah.trim()) {
    try {
      const x = JSON.parse(mentah);
      if (Array.isArray(x)) skema = x;
    } catch { /* rinciannya hilang; memonya sendiri tetap tersimpan */ }
  }

  // Memo yang datang sebagai lembar kerja dibaca di sini, bukan di peramban.
  // Pembedah di peramban bekerja dari koordinat tiap kata hasil OCR, dan lembar
  // kerja tidak punya halaman maupun koordinat: ia sudah berupa baris dan
  // kolom. Lihat bedahSkemaExcel() pada @/lib/memo-excel.
  let dariExcel: KolomMemo = {};
  if (!skema?.length && bisaDibacaExcel(isi.file_name, isi.content_type)) {
    try {
      const hasil = await bedahSkemaExcel(isi.buf);
      dariExcel = hasil.kolom;
      if (hasil.skema.length) skema = hasil.skema;
    } catch {
      // Lembarnya tidak tersusun seperti memo, atau berkasnya cacat. Memonya
      // sendiri tetap tersimpan sebagai lampiran, dan barisnya dapat diisi
      // tangan — kegagalan membaca bukan alasan menolak berkasnya.
    }
  }

  // Yang diisi di formulir selalu menang: pembacaan otomatis hanya mengisi
  // yang dibiarkan kosong.
  return simpanMemo(projectId, user.username, {
    skema,
    judul: teks("judul") ?? dariExcel.judul ?? isi.file_name,
    nomor: teks("nomor") ?? dariExcel.nomor ?? null,
    keterangan: teks("keterangan"),
    berlaku_dari: teks("berlaku_dari") ?? dariExcel.berlaku_dari ?? null,
    berlaku_sampai: teks("berlaku_sampai") ?? dariExcel.berlaku_sampai ?? null,
    tanggal_memo: teks("tanggal_memo") ?? dariExcel.tanggal_memo ?? null,
    dari: teks("dari") ?? dariExcel.dari ?? null,
    kepada: teks("kepada"),
    nilai_skema: teks("nilai_skema"),
    dokumen_wajib: teks("dokumen_wajib"),
    diajukan_oleh: teks("diajukan_oleh"),
    diketahui_oleh: teks("diketahui_oleh"),
    disetujui_oleh: teks("disetujui_oleh"),
    file_name: isi.file_name,
    content_type: isi.content_type,
    buf: isi.buf,
  });
});
