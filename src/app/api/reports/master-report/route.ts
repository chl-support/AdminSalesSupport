import { NextResponse } from "next/server";
import { currentUser, handler, projectAktif } from "@/lib/api";
import { exportBuffer, preview, rincian } from "@/lib/report";

export const GET = handler(async (req) => {
  const q = new URL(req.url).searchParams;
  // Disaring ke project yang sedang dikerjakan. Judul laporannya menyebut nama
  // project itu, dan laporan berjudul satu project yang memuat unit project
  // lain adalah laporan yang salah tanpa terlihat salah.
  const user = await currentUser(req);
  const filters = {
    projectId: await projectAktif(req),
    clusterCode: q.get("cluster_code"),
    contractFrom: q.get("contract_from"),
    contractTo: q.get("contract_to"),
  };
  if (q.get("format") === "json") return preview(filters);
  // Isi laporannya untuk ditampilkan di layar, bukan diunduh. Dilayani alamat
  // yang sama dengan unduhannya supaya keduanya tidak mungkin menyaring dua
  // himpunan unit yang berbeda.
  if (q.get("format") === "rincian") return rincian(filters);
  const namaProject = user.project_name ?? "—";
  const buf = await exportBuffer(filters, namaProject);
  const bersih = namaProject.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const name = `Laporan_Closing_Fee_Komisi_Reward_${bersih}_` +
               `${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
});
