"use client";

/**
 * Membaca tulisan di dalam memo hasil pindaian, di peramban.
 *
 * Memo yang sudah ditandatangani hampir selalu berupa gambar: tidak ada satu
 * huruf pun di dalamnya yang dapat dibaca tanpa OCR. Yang terbaca dari nama
 * berkasnya hanya nomor, perihal, dan periode — nama pengaju, penyetuju, nilai
 * fee, dan daftar dokumen pendukung semuanya hanya ada di lembar memonya.
 *
 * Dikerjakan di peramban, bukan di server. Dua alasan:
 *
 *  1. Fungsi serverless dibatasi waktu dan ingatan. Satu pindaian dua halaman
 *     menghabiskan belasan detik dan ratusan megabita — dijalankan di sana, ia
 *     akan berebut dengan permintaan lain dan sesekali mati di tengah jalan.
 *  2. Komputer yang mengunggah sedang menganggur menunggu hasilnya.
 *
 * Seluruh berkasnya — mesin OCR, data bahasa, dan pekerja PDF — disajikan dari
 * domain ini sendiri, bukan dari CDN luar. Jaringan kantor yang menyaring
 * lalu lintas keluar akan membuat unduhan dari CDN gagal diam-diam, dan yang
 * terlihat di layar hanya OCR yang tidak pernah selesai.
 */

const JALUR = {
  worker: "/ocr/worker.min.js",
  core: "/ocr",
  bahasa: "/ocr",
  pdfWorker: "/ocr/pdf.worker.min.mjs",
};

/** Halaman yang dibaca. Memo persetujuan hampir selalu satu sampai dua
 *  halaman; sisanya lampiran, dan membacanya hanya menambah menit tanpa
 *  menambah kolom yang terisi. */
const BATAS_HALAMAN = 3;

/** Perbesaran saat halaman PDF digambar ulang sebelum dibaca. Di bawah ini
 *  huruf pada pindaian 150 dpi pecah dan terbaca sebagai aksara lain. */
const SKALA = 2;

export type Kemajuan = {
  tahap: "menyiapkan" | "menggambar" | "membaca" | "selesai";
  halaman?: number; dari?: number; persen?: number;
};

async function halamanPdf(berkas: File, lapor: (k: Kemajuan) => void) {
  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = JALUR.pdfWorker;

  const dok = await pdfjs.getDocument({
    data: new Uint8Array(await berkas.arrayBuffer()),
  }).promise;

  const jumlah = Math.min(dok.numPages, BATAS_HALAMAN);
  const kanvas: HTMLCanvasElement[] = [];
  for (let i = 1; i <= jumlah; i++) {
    lapor({ tahap: "menggambar", halaman: i, dari: jumlah });
    const halaman = await dok.getPage(i);
    const ukuran = halaman.getViewport({ scale: SKALA });
    const c = document.createElement("canvas");
    c.width = Math.ceil(ukuran.width);
    c.height = Math.ceil(ukuran.height);
    await halaman.render({
      canvas: c, canvasContext: c.getContext("2d")!, viewport: ukuran,
    }).promise;
    kanvas.push(c);
  }
  await dok.destroy?.();
  return kanvas;
}

/**
 * Teks seluruh halaman sebuah memo pindaian.
 *
 * Mengembalikan kosong bila jenis berkasnya memang bukan gambar maupun PDF —
 * bukan melempar galat. Yang memanggil sudah punya jalan lain (nama berkas),
 * dan galat di sini hanya akan menghentikan jalan itu juga.
 */
export async function bacaPindaian(
  berkas: File, lapor: (k: Kemajuan) => void = () => {},
): Promise<string> {
  const nama = berkas.name.toLowerCase();
  const pdf = berkas.type.includes("pdf") || nama.endsWith(".pdf");
  const gambar = berkas.type.startsWith("image/") ||
                 /\.(jpe?g|png|webp)$/.test(nama);
  if (!pdf && !gambar) return "";

  lapor({ tahap: "menyiapkan" });
  const { createWorker } = await import("tesseract.js");

  const sumber: (HTMLCanvasElement | File)[] = pdf
    ? await halamanPdf(berkas, lapor)
    : [berkas];

  const pekerja = await createWorker("ind", 1, {
    workerPath: JALUR.worker,
    corePath: JALUR.core,
    langPath: JALUR.bahasa,
    // Data bahasa disajikan dalam bentuk terkompresi, sebagaimana ia
    // diterbitkan; tanpa penanda ini pekerjanya mencari berkas tanpa .gz dan
    // berhenti pada 404.
    gzip: true,
    logger: (m: any) => {
      if (m.status === "recognizing text") {
        lapor({ tahap: "membaca", persen: Math.round((m.progress ?? 0) * 100) });
      }
    },
  });

  try {
    const bagian: string[] = [];
    for (let i = 0; i < sumber.length; i++) {
      lapor({ tahap: "membaca", halaman: i + 1, dari: sumber.length });
      const { data } = await pekerja.recognize(sumber[i] as any);
      bagian.push(data.text ?? "");
    }
    lapor({ tahap: "selesai" });
    return bagian.join("\n");
  } finally {
    await pekerja.terminate();
  }
}
