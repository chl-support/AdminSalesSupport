import { handler } from "@/lib/api";
import { configReport, explainDbError, one, setting } from "@/lib/db";

/**
 * Pemeriksaan kesehatan yang benar-benar menyentuh basis data.
 *
 * Endpoint yang selalu membalas "ok" tanpa menguji dependensinya tidak berguna
 * saat deploy: ia hijau justru ketika aplikasinya tidak dapat melayani apa pun.
 *
 * Blok `config` melaporkan apa yang benar-benar terbaca oleh fungsi yang sedang
 * berjalan — tanpa kredensial. Ini yang membedakan "variabel belum diisi" dari
 * "variabel diisi tetapi deployment ini dibuat sebelum variabel ditambahkan".
 */
export const GET = handler(async () => {
  const config = configReport();
  try {
    const dikalibrasi = await setting("signature_calibrated_at");
    const row = await one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM claims");
    return {
      status: "ok",
      database: "connected",
      claims: row?.count ?? 0,
      signature_threshold: await setting("signature_threshold_claim"),
      config,
      // Peringatan menyebutkan keadaan sebenarnya, bukan kalimat tetap.
      // Peringatan yang tidak pernah berubah berhenti dibaca, dan yang hilang
      // setelah satu kali pengukuran atas data contoh akan menyatakan sistemnya
      // terbukti padahal tidak.
      warning: dikalibrasi
        ? `Ambang disetel ${await setting("signature_threshold_claim")} pada ` +
          `${dikalibrasi.slice(0, 10)} atas data yang tersedia. Protokol PRD 12.2 ` +
          "(30–50 agent, 10 tanda tangan asli per orang, ditambah percobaan " +
          "peniruan sungguhan) belum terpenuhi — lihat bukti pada menu " +
          "Administrasi."
        : "Ambang tanda tangan belum dikalibrasi. Jalankan pengukuran dari menu " +
          "Administrasi, dan protokol PRD 12.2 sebelum dipakai produksi.",
    };
  } catch (err: any) {
    // Skema yang belum dimigrasikan bukan kegagalan koneksi: query sampai ke
    // Postgres dan Postgres-lah yang menjawab. Melaporkannya sebagai
    // "unreachable" mengirim orang memeriksa DATABASE_URL yang sebenarnya sudah
    // benar — persis kesalahan yang endpoint ini seharusnya cegah.
    if (err?.code === "42P01") {
      return Response.json(
        {
          status: "setup_required",
          database: "connected",
          detail: "Koneksi ke basis data berhasil, tetapi skemanya belum dibuat. " +
                  "Jalankan penyiapan sekali lewat /setup, atau dari mesin lokal " +
                  "dengan: DATABASE_URL='<url>' npm run db:migrate",
          pgCode: err.code,
          config,
        },
        { status: 503 },
      );
    }

    const hint = !config.database_url.present
      ? "Fungsi ini tidak melihat DATABASE_URL. Bila variabelnya sudah ada di " +
        "Settings, kemungkinan besar deployment ini dibuat sebelum variabel " +
        "ditambahkan — jalankan Redeploy, dan pastikan environment yang dicentang " +
        `sesuai dengan yang sedang dibuka (sekarang: ${config.vercel.env ?? "lokal"}).`
      : explainDbError(err);
    return Response.json(
      {
        status: "degraded",
        database: "unreachable",
        detail: hint,
        pgCode: err?.code ?? null,
        config,
      },
      { status: 503 },
    );
  }
}, { publik: true });
