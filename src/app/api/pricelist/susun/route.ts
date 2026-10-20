import { body, handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { susunAwal } from "@/lib/susun-pricelist";
import {
  bacaAtauIsiSusun, denganTncPatokan, periksaSusun, samakanTncPatokan, simpanSusun,
} from "@/lib/susun-pricelist-simpan";

/**
 * Penyusunan pricelist lima langkah (Data (IRR), Unit Data, Data Pricelist,
 * Pricelist, T&C) untuk project yang sedang dipilih.
 *
 * GET mengembalikan draf yang tersimpan. Project yang punya isian awal
 * (Naraya Serpong: data PL Excel-nya) langsung diisi dan disimpan saat
 * pertama dibuka; project lain mendapat isian kosong (`baru: true`). Semua
 * peran boleh membaca, sama dengan pricelist-nya.
 */
export const GET = handler(async (req) => {
  const projectId = await projectAktif(req);
  // T&C semua project mengikuti patokan Naraya Serpong (sekali; sesudahnya manual).
  const draf = await samakanTncPatokan(projectId, await bacaAtauIsiSusun(projectId));
  return draf ? { baru: false, ...draf }
    : { baru: true, data: await denganTncPatokan(susunAwal()), diubah_oleh: null, diubah_pada: null };
});

/** Simpan draf. Admin Sales dan Admin IT, sama dengan unggah pricelist. */
export const PUT = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const { data } = await body<{ data?: unknown }>(req);
  let isi;
  try {
    isi = periksaSusun(data);
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
  return { baru: false, ...(await simpanSusun(projectId, isi, user.username)) };
});
