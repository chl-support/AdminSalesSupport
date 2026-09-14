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
    const row = await one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM claims");
    return {
      status: "ok",
      database: "connected",
      claims: row?.count ?? 0,
      signature_threshold: await setting("signature_threshold_claim"),
      config,
      warning: "Ambang tanda tangan belum dikalibrasi. Jalankan protokol PRD 12.2 " +
               "sebelum dipakai produksi.",
    };
  } catch (err: any) {
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
});
