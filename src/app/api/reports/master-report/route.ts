import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { exportBuffer, preview } from "@/lib/report";

export const GET = handler(async (req) => {
  const q = new URL(req.url).searchParams;
  const filters = {
    clusterCode: q.get("cluster_code"),
    contractFrom: q.get("contract_from"),
    contractTo: q.get("contract_to"),
  };
  if (q.get("format") === "json") return preview(filters);
  const buf = await exportBuffer(filters);
  const name = `Laporan_BIO_District_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
});
