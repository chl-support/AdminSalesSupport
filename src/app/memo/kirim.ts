"use client";

/**
 * Mengirim berkas ke server tanpa pernah melampaui batas satu permintaan.
 *
 * Fungsi serverless membatasi besar permintaan masuk — di Vercel 4,5 MB.
 * Permintaan yang melampauinya diputus di tepi jaringan sebelum mencapai kode
 * aplikasi, sehingga peramban tidak menerima status maupun keterangan apa pun
 * dan hanya dapat melaporkan "Failed to fetch". Dari layar, unggahan tampak
 * gagal tanpa sebab.
 *
 * Berkas di bawah ambang dikirim apa adanya, seperti sebelumnya. Yang di
 * atasnya dipecah di sini, tiap potong dikirim sebagai permintaan tersendiri,
 * lalu dirakit kembali di server. Batas ukuran berkas kini sepenuhnya
 * ditentukan aturan aplikasi, bukan batas fungsi yang tidak dapat diubah.
 */

/**
 * Berkas sampai sebesar ini dikirim utuh dalam satu permintaan.
 *
 * Satu megabita, jauh di bawah batas 4,5 MB yang berlaku. Sempat disetel tiga
 * megabita — cukup, tetapi hanya menyisakan satu setengah megabita bagi isian
 * formulir, pembatas multipart, dan apa pun yang kelak ditambahkan ke
 * permintaan yang sama. Kelonggaran yang tipis itulah yang membuat batas ini
 * terlampaui tanpa ada yang menyadarinya.
 *
 * Yang dikorbankan hanya satu perjalanan bolak-balik tambahan bagi berkas
 * satu sampai tiga megabita; yang didapat, seluruh jenjang ukuran di atas
 * satu megabita menempuh jalan yang sudah terbukti tidak pernah melampaui
 * batas.
 */
export const AMBANG_LANGSUNG = 1024 * 1024;

/** Besar tiap potong bagi berkas yang dipecah. */
const BESAR_POTONG = 2 * 1024 * 1024;

export type KemajuanKirim = { terkirim: number; dari: number };

/**
 * Menitipkan berkas besar, sepotong demi sepotong.
 *
 * Mengembalikan pengenal titipannya. Berkas yang cukup kecil tidak pernah
 * sampai ke sini — lihat perluDipecah().
 */
export async function titipBerkas(
  berkas: File, lapor: (k: KemajuanKirim) => void = () => {},
): Promise<string> {
  let id: string | null = null;
  const jumlah = Math.max(1, Math.ceil(berkas.size / BESAR_POTONG));

  for (let i = 0; i < jumlah; i++) {
    const potong = berkas.slice(i * BESAR_POTONG, (i + 1) * BESAR_POTONG);
    const fd = new FormData();
    if (id) fd.append("unggah_id", id);
    else {
      fd.append("nama", berkas.name);
      fd.append("tipe", berkas.type || "application/octet-stream");
    }
    fd.append("urutan", String(i));
    fd.append("data", potong);

    const res = await fetch("/api/memos/bagian", { method: "POST", body: fd });
    if (res.status === 401) { location.href = "/login"; throw new Error("401"); }
    const b = await res.json().catch(() => ({}));
    // Potongan pun dapat ditolak di tepi jaringan, dan jawabannya kemudian
    // berupa halaman HTML tanpa medan detail. Tanpa kalimat ini, yang tampil
    // hanya "HTTP 413" — angka yang tidak memberi tahu apa pun.
    if (!res.ok) {
      throw new Error(b.detail ?? (res.status === 413
        ? `Potongan ke-${i + 1} ditolak karena terlalu besar. ` +
          `Besar potongan ${Math.round(BESAR_POTONG / 1024 / 1024)} MB.`
        : `HTTP ${res.status}`));
    }
    id = b.id as string;
    lapor({ terkirim: Math.min((i + 1) * BESAR_POTONG, berkas.size),
            dari: berkas.size });
  }
  return id!;
}

export const perluDipecah = (berkas: File) => berkas.size > AMBANG_LANGSUNG;

/**
 * Menaruh berkasnya pada formulir, dengan cara yang sesuai besarnya.
 *
 * Titipan yang sudah dibuat dipakai ulang, tidak dikirim dua kali: satu berkas
 * dibaca dulu untuk mengusulkan isian, lalu disimpan ketika tombol ditekan,
 * dan keduanya membutuhkan berkas yang sama.
 */
export function pasangBerkas(fd: FormData, berkas: File, titipan: string | null) {
  if (titipan) fd.append("unggah_id", titipan);
  else fd.append("file", berkas);
}

/** Batas ukuran berkas, sama dengan yang dipakai server. */
export const BATAS_BERKAS = 10 * 1024 * 1024;

/**
 * Menolak berkas yang pasti ditolak server, sebelum satu bita pun terkirim.
 *
 * Mengunggah sepuluh megabita hanya untuk diberi tahu bahwa ia terlalu besar
 * adalah menit yang terbuang, dan pada sambungan lambat menit itu terasa
 * seperti sistem yang menggantung.
 */
export function periksaUkuran(berkas: File): string | null {
  if (berkas.size <= BATAS_BERKAS) return null;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1).replace(".", ",");
  return `Berkas ${mb(berkas.size)} MB melebihi batas ` +
         `${mb(BATAS_BERKAS)} MB. Perkecil dulu berkasnya, ` +
         `misalnya dengan memindai pada resolusi yang lebih rendah.`;
}
