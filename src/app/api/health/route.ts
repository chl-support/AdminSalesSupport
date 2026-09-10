import { handler } from "@/lib/api";
import { explainDbError, one, setting } from "@/lib/db";

/**
 * Pemeriksaan kesehatan yang benar-benar menyentuh basis data.
 *
 * Endpoint yang selalu membalas "ok" tanpa menguji dependensinya tidak berguna
 * saat deploy: ia hijau justru ketika aplikasinya tidak dapat melayani apa pun.
 */
export const GET = handler(async () => {
  try {
    const row = await one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM claims");
    return {
      status: "ok",
      database: "connected",
      claims: row?.count ?? 0,
      signature_threshold: await setting("signature_threshold_claim"),
      warning: "Ambang tanda tangan belum dikalibrasi. Jalankan protokol PRD 12.2 " +
               "sebelum dipakai produksi.",
    };
  } catch (err: any) {
    return Response.json(
      {
        status: "degraded",
        database: "unreachable",
        detail: explainDbError(err),
        pgCode: err?.code ?? null,
      },
      { status: 503 },
    );
  }
});
