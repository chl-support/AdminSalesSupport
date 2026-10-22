/**
 * Perkecil berkas Excel di peramban sebelum diunggah: gambar (xl/media) dan
 * gambar-gambar lembar (drawing) dibuang, isi lembar tersembunyi
 * dikosongkan. Impor dan pencocokan hanya membaca isi sel, sedangkan
 * server (Vercel) menolak unggahan di atas ±4,5 MB — berkas PL Mazenta 7 MB,
 * sebagian besar gambar. Bila gagal diperkecil, berkas asli yang dipakai.
 */

import JSZip from "jszip";

const LEMBAR_KOSONG = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';

export async function ringkasXlsx(berkas: File): Promise<File> {
  try {
    const zip = await JSZip.loadAsync(await berkas.arrayBuffer());
    const buang = new Set<string>();
    zip.forEach((p) => {
      if (/^xl\/media\//.test(p) || /^xl\/drawings\/(_rels\/)?drawing\d+\.xml(\.rels)?$/.test(p)
          || /^xl\/printerSettings\//.test(p)) buang.add(p);
    });
    buang.forEach((p) => zip.remove(p));

    // Rujukan ke drawing yang dibuang: tag <drawing> di lembar dan
    // relasinya, juga daftar jenis isi berkas.
    for (const p of Object.keys(zip.files)) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(p)) {
        const x = await zip.file(p)!.async("string");
        if (/<drawing\b/.test(x)) zip.file(p, x.replace(/<drawing\b[^>]*\/>/g, ""));
      } else if (/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(p)) {
        const x = await zip.file(p)!.async("string");
        zip.file(p, x.replace(/<Relationship\b[^>]*Type="[^"]*\/(drawing|image|printerSettings)"[^>]*\/>/g, ""));
      }
    }
    const jenis = await zip.file("[Content_Types].xml")?.async("string");
    if (jenis) {
      zip.file("[Content_Types].xml", jenis.replace(/<Override\b[^>]*PartName="\/xl\/(drawings\/drawing\d+\.xml|printerSettings\/[^"]+)"[^>]*\/>/g, ""));
    }

    // Lembar tersembunyi tidak dibaca impor: isinya dikosongkan.
    const wb = await zip.file("xl/workbook.xml")?.async("string");
    const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
    if (wb && rels) {
      const target = new Map<string, string>();
      for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
        const id = /\bId="([^"]+)"/.exec(m[0])?.[1], t = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
        if (id && t) target.set(id, t.replace(/^\/?(xl\/)?/, "xl/"));
      }
      for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
        if (!/\bstate="(hidden|veryHidden)"/.test(m[0])) continue;
        const p = target.get(/\br:id="([^"]+)"/.exec(m[0])?.[1] ?? "");
        if (p && zip.file(p)) {
          zip.file(p, LEMBAR_KOSONG);
          zip.remove(p.replace(/([^/]+)$/, "_rels/$1.rels"));
        }
      }
    }

    const isi = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return isi.byteLength < berkas.size
      ? new File([isi], berkas.name, { type: berkas.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      : berkas;
  } catch {
    return berkas;
  }
}
