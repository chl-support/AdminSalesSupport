import { handler } from "@/lib/api";
import { query } from "@/lib/db";

export const GET = handler(async (req) => {
  const status = new URL(req.url).searchParams.get("status");
  const base = `SELECT pi.*, c.claim_number FROM payment_instructions pi
                JOIN claims c ON c.id = pi.claim_id`;
  return status
    ? query(`${base} WHERE pi.status=$1`, [status])
    : query(base);
});
