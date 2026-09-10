import { handler } from "@/lib/api";
import { query } from "@/lib/db";

export const GET = handler(async () =>
  query(`SELECT id, claim_number, print_copy_number, physical_location,
                physical_since,
                EXTRACT(DAY FROM now() - physical_since)::int AS age_days
         FROM claims
         WHERE status IN ('printed','circulating_head_finance',
                          'circulating_management','awaiting_scan_upload')
         ORDER BY age_days DESC NULLS LAST`));
