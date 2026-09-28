import { handler, requireRole, body, projectAktif } from "@/lib/api";
import { berlakukan, cabut } from "@/lib/rujukan";

/**
 * Berlakukan satu baris rujukan menjadi skema insentif.
 *
 * Admin Sales dan Admin IT: keduanya memang yang membaca memo dan mengurus
 * pengajuannya. Peran lain membacanya saja — menerbitkan tarif adalah
 * menentukan berapa uang keluar.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const p = await body(req);

  return berlakukan({
    barisId: id, projectId, actor: user.username,
    claimType: String(p.claim_type ?? ""),
    recipientRole: p.recipient_role ?? null,
    overridingLevel: p.overriding_level ?? null,
    basis: p.basis ?? null,
    percentage: p.percentage,
    flatAmount: p.flat_amount,
    flatAmountIsNet: Boolean(p.flat_amount_is_net),
    from: String(p.effective_from ?? ""),
    to: p.effective_to ?? null,
  });
});

/** Cabut pemberlakuannya; barisnya kembali menjadi usulan. */
export const DELETE = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  return cabut(id, projectId, user.username);
});
