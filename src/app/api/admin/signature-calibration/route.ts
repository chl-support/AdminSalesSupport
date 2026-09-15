/**
 * Kalibrasi ambang tanda tangan dari konsol.
 *
 * Ada di sini, bukan sebagai skrip baris perintah, karena yang perlu menjalankannya
 * tidak punya akses terminal — dan karena ambang yang diubah tanpa jejak siapa yang
 * mengubah dan atas dasar apa adalah persis yang membuat angka 75 hari ini tidak
 * dapat dipertanggungjawabkan.
 */

import { handler, requireRole, body } from "@/lib/api";
import { audit, setSetting, setting } from "@/lib/db";
import { kalibrasi } from "@/lib/kalibrasi";
import { WorkflowError } from "@/lib/workflow";

export const GET = handler(async (req) => {
  await requireRole(req, "admin_system");
  return {
    ambang: Number(await setting("signature_threshold_claim")),
    dikalibrasi_pada: (await setting("signature_calibrated_at")) || null,
    bukti: (await setting("signature_calibration_note")) || null,
  };
});

export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_system");
  const p = await body(req);

  if (p.apply === undefined) {
    const hasil = await kalibrasi();
    await audit({
      entityType: "setting", entityId: "signature_threshold_claim",
      action: "calibration_run", actor: user.username,
      after: { bahan: hasil.bahan, usul: hasil.usul },
    });
    return hasil;
  }

  const ambang = Number(p.apply);
  if (!Number.isInteger(ambang) || ambang < 1 || ambang > 100) {
    throw new WorkflowError("Ambang harus bilangan bulat 1–100.",
                            "threshold_invalid", 422);
  }
  const sebelum = await setting("signature_threshold_claim");

  // Bukti disimpan bersama ambangnya. Angka tanpa keterangan dari mana ia berasal
  // akan menjadi "75" berikutnya: dipakai bertahun-tahun tanpa ada yang ingat
  // dasarnya.
  const bukti = {
    orang: p.evidence?.orang ?? null,
    spesimen: p.evidence?.spesimen ?? null,
    pasangan_asli: p.evidence?.pasangan_asli ?? null,
    pasangan_tiruan: p.evidence?.pasangan_tiruan ?? null,
    far: p.evidence?.far ?? null,
    frr: p.evidence?.frr ?? null,
    sumber_sintetis: p.evidence?.sumber_sintetis ?? null,
    protokol_terpenuhi: false,
    oleh: user.username,
  };

  await setSetting("signature_threshold_claim", String(ambang));
  await setSetting("signature_calibrated_at", new Date().toISOString());
  await setSetting("signature_calibration_note", JSON.stringify(bukti));
  await audit({
    entityType: "setting", entityId: "signature_threshold_claim",
    action: "calibration_apply", actor: user.username,
    before: { value: sebelum }, after: { value: String(ambang), bukti },
  });

  return { ambang, bukti };
});
