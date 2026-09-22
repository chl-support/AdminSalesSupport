import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { handler, currentUser } from "@/lib/api";
import { query } from "@/lib/db";
import { getClaim, WorkflowError } from "@/lib/workflow";

/**
 * Lampiran terpilih, digabung menjadi satu PDF untuk dicetak.
 *
 * Peramban tidak dapat mencetak beberapa berkas dalam satu perintah: tiap PDF
 * adalah dokumen tersendiri, dan yang mencentang delapan lampiran akan
 * mendapat delapan tab yang harus dicetak satu per satu. Penggabungannya
 * karenanya dikerjakan di sini — hasilnya satu dokumen, satu kali Ctrl+P.
 *
 * Yang dapat digabung: halaman dari berkas PDF, dan citra JPG atau PNG yang
 * ditempatkan satu per halaman. Format lain (WEBP, HEIC) tidak dapat disisipkan
 * oleh pdf-lib; alih-alih diam-diam menghilang, berkas itu diwakili satu
 * halaman keterangan yang menyebut namanya, supaya yang mencetak tahu ada
 * lampiran yang masih harus dibuka sendiri.
 */
const A4 = { w: 595.28, h: 841.89 };

/**
 * Citra ini masuk akal untuk dibaca pdf-lib?
 *
 * Bukan validasi format yang lengkap, melainkan penjaga terhadap berkas yang
 * rusak: PNG dengan 91 byte dan IDAT yang terpotong membuat pembacanya berputar
 * tanpa selesai, dan permintaan yang menggantung tidak dapat dihentikan dari
 * dalam JavaScript — pekerjaannya sinkron. Yang diperiksa hanya tanda tangan
 * berkas dan ukuran gambarnya; berkas yang tidak lulus diwakili halaman
 * keterangan, bukan dicoba dibaca.
 */
function citraWajar(isi: Uint8Array, jenis: string): boolean {
  if (jenis === "image/png") {
    const tanda = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (isi.length < 100 || tanda.some((b, i) => isi[i] !== b)) return false;
    const lebar = (isi[16] << 24) | (isi[17] << 16) | (isi[18] << 8) | isi[19];
    const tinggi = (isi[20] << 24) | (isi[21] << 16) | (isi[22] << 8) | isi[23];
    return lebar > 0 && tinggi > 0 && lebar < 20000 && tinggi < 20000;
  }
  if (jenis === "image/jpeg") {
    // Diawali SOI dan diakhiri EOI. Yang terpotong di tengah pengunggahan
    // kehilangan penutupnya, dan itulah bentuk kerusakan yang paling sering.
    return isi.length > 125 && isi[0] === 0xff && isi[1] === 0xd8 &&
           isi[isi.length - 2] === 0xff && isi[isi.length - 1] === 0xd9;
  }
  return false;
}

export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  await currentUser(req);
  await getClaim(id);

  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",").map((x) => x.trim()).filter(Boolean);
  if (!ids.length) {
    throw new WorkflowError("Belum ada lampiran yang dipilih.", "no_selection", 422);
  }

  // Urutannya mengikuti urutan unggahan, bukan urutan yang diminta layar:
  // paket cetak yang sama harus selalu tersusun sama, siapa pun yang mencetak.
  const dok = await query<any>(
    `SELECT id, checklist_item, file_name, content_type, content
       FROM claim_documents
      WHERE claim_id = $1 AND id = ANY($2::uuid[]) AND content IS NOT NULL
      ORDER BY uploaded_at`, [id, ids]);
  if (!dok.length) {
    throw new WorkflowError(
      "Lampiran yang dipilih tidak memiliki berkas yang tersimpan.",
      "content_missing", 410);
  }

  const gabungan = await PDFDocument.create();
  const font = await gabungan.embedFont(StandardFonts.Helvetica);

  for (const d of dok) {
    const isi = new Uint8Array(d.content);
    const jenis = String(d.content_type ?? "");
    try {
      if (jenis === "application/pdf") {
        const asal = await PDFDocument.load(isi);
        const halaman = await gabungan.copyPages(asal, asal.getPageIndices());
        halaman.forEach((h) => gabungan.addPage(h));
        continue;
      }
      if (jenis === "image/jpeg" || jenis === "image/png") {
        if (!citraWajar(isi, jenis)) throw new Error("berkas citra rusak");
        const citra = jenis === "image/jpeg"
          ? await gabungan.embedJpg(isi) : await gabungan.embedPng(isi);
        const halaman = gabungan.addPage([A4.w, A4.h]);
        // Diperkecil agar muat seluruhnya, tidak dipotong: pindaian kwitansi
        // yang terpotong separuh bukan lampiran, itu setengah lampiran.
        const skala = Math.min((A4.w - 56) / citra.width,
                               (A4.h - 56) / citra.height, 1);
        const w = citra.width * skala;
        const h = citra.height * skala;
        halaman.drawImage(citra, {
          x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
        continue;
      }
      throw new Error(`format ${jenis || "tidak dikenali"}`);
    } catch (e: any) {
      const halaman = gabungan.addPage([A4.w, A4.h]);
      halaman.drawText("Lampiran ini tidak dapat digabung", {
        x: 48, y: A4.h - 90, size: 13, font, color: rgb(0.08, 0.09, 0.1) });
      for (const [i, baris] of [
        `${d.checklist_item} — ${d.file_name ?? "berkas"}`,
        `Sebab: ${String(e?.message ?? e)}.`,
        "Buka berkasnya sendiri dari daftar lampiran untuk mencetaknya.",
      ].entries()) {
        halaman.drawText(baris, {
          x: 48, y: A4.h - 120 - i * 18, size: 10.5, font,
          color: rgb(0.36, 0.38, 0.4) });
      }
    }
  }

  const keluar = await gabungan.save();
  return new NextResponse(new Uint8Array(keluar), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="lampiran.pdf"',
      "x-content-type-options": "nosniff",
    },
  });
});
