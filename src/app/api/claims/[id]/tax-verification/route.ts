import { handler, requireRole, body, idemKey, claimView } from "@/lib/api";
import { idempotent, query } from "@/lib/db";
import { getClaim, taxVerify } from "@/lib/workflow";

export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  await requireRole(req, "finance_tax", "finance_manager");
  const claim = await getClaim(id);
  return {
    claim: await claimView(claim),
    supporting_documents: await query(
      "SELECT * FROM claim_documents WHERE claim_id=$1", [id]),
    system_amounts: {
      gross_amount: claim.gross_amount, vat: claim.vat,
      withholding_tax: claim.withholding_tax, net_amount: claim.net_amount,
      amount_in_words: claim.amount_in_words,
    },
    snapshot: claim.snapshot,
    hint: "Panel snapshot menunjukkan asal angka — versi skema, basis, tarif, " +
          "status PKP, jenis NPWP. Periksa parameternya, bukan hanya hasilnya.",
  };
});

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "finance_tax", "finance_manager");
  const p = await body(req);
  return idempotent(idemKey(req), "POST tax-verification", async () =>
    claimView(await taxVerify({
      claimId: id, decision: p.decision, actor: user.username,
      corrected: p.corrected_amounts, reason: p.reason,
    })));
});
