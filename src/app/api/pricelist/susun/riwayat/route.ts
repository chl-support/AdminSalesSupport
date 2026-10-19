import { handler, projectAktif } from "@/lib/api";
import { bacaRiwayat } from "@/lib/susun-pricelist-riwayat";

/** Riwayat perubahan pricelist project ini: siapa, kapan, apa yang diubah. */
export const GET = handler(async (req) => {
  const projectId = await projectAktif(req);
  return { riwayat: await bacaRiwayat(projectId) };
});
