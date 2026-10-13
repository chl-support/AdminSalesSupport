/**
 * Salinan sandi yang dapat dibaca kembali oleh Admin IT.
 *
 * Dipasang atas permintaan tegas pemilik sistem: tim IT perlu dapat
 * mengingatkan sandi kepada orang yang lupa, bukan hanya menggantinya. Perlu
 * diketahui apa yang ditukar dengan itu, dan tertulis di sini supaya siapa pun
 * yang membaca kode ini kelak tahu bahwa ini keputusan, bukan kelalaian:
 *
 *   * `password_hash` tetap yang menentukan boleh-tidaknya masuk. Salinan ini
 *     tidak pernah dipakai memeriksa sandi — ia hanya untuk ditampilkan.
 *   * Sandi tidak disimpan polos, melainkan disandikan AES-256-GCM. Satu
 *     salinan basis data yang bocor tanpa kuncinya tidak menyerahkan satu pun
 *     sandi.
 *   * Kuncinya diambil dari environment (`SANDI_KUNCI`) bila ada. Bila tidak,
 *     kunci dibangkitkan sekali dan disimpan di tabel settings — artinya kunci
 *     dan sandinya berada di satu tempat, jadi bocornya basis data sama
 *     saja dengan bocornya seluruh sandi. Itu sebabnya `SANDI_KUNCI` layak
 *     dipasang, dan layar Admin IT menyebutkan mana yang sedang berlaku.
 *   * Setiap kali sandi dilihat, siapa yang melihat dan sandi siapa yang
 *     dilihat tercatat di jejak audit yang tidak dapat disunting.
 *
 * Sandi yang dipasang SEBELUM berkas ini ada tidak dapat dimunculkan: yang
 * tersimpan waktu itu hanya hash. Salinannya terisi ketika sandinya diganti,
 * atau ketika pemiliknya berhasil masuk — saat itulah sandi aslinya lewat di
 * tangan kita untuk terakhir kalinya.
 */

import {
  createCipheriv, createDecipheriv, randomBytes, scrypt,
} from "node:crypto";
import { promisify } from "node:util";

import { query, one } from "./db";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer, salt: string | Buffer, keylen: number,
) => Promise<Buffer>;

/** Garam tetap: kuncinya sendiri yang rahasia, bukan garamnya. */
const GARAM = "sandi-terlihat/v1";
const KUNCI_SETTING = "sandi_kunci";

let kunciTersimpan: Buffer | null = null;

/** Dari mana kuncinya berasal — ditampilkan di layar Admin IT apa adanya. */
export async function asalKunci(): Promise<"environment" | "basis_data"> {
  return process.env.SANDI_KUNCI ? "environment" : "basis_data";
}

async function kunci(): Promise<Buffer> {
  if (kunciTersimpan) return kunciTersimpan;

  let rahasia = process.env.SANDI_KUNCI ?? "";
  if (!rahasia) {
    // Dibangkitkan sekali lalu dipakai seterusnya. Bila baris ini hilang,
    // seluruh salinan yang ada menjadi tidak terbaca — dan itu memang
    // satu-satunya akibatnya: masuk ke sistem tetap berjalan, karena yang
    // dipakai memeriksa sandi adalah hash-nya.
    const ada = await one<{ value: string }>(
      "SELECT value FROM settings WHERE key=$1", [KUNCI_SETTING]);
    if (ada?.value) {
      rahasia = ada.value;
    } else {
      rahasia = randomBytes(32).toString("hex");
      await query(
        `INSERT INTO settings (key, value) VALUES ($1,$2)
         ON CONFLICT (key) DO NOTHING`, [KUNCI_SETTING, rahasia]);
      const kini = await one<{ value: string }>(
        "SELECT value FROM settings WHERE key=$1", [KUNCI_SETTING]);
      rahasia = kini?.value ?? rahasia;
    }
  }
  kunciTersimpan = await scryptAsync(rahasia, GARAM, 32);
  return kunciTersimpan;
}

/** Menyandikan satu sandi. Bentuknya `v1$iv$tag$sandi-tersandi`, heksadesimal. */
export async function sandikan(sandi: string): Promise<string> {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", await kunci(), iv);
  const isi = Buffer.concat([c.update(sandi, "utf8"), c.final()]);
  return `v1$${iv.toString("hex")}$${c.getAuthTag().toString("hex")}$${
    isi.toString("hex")}`;
}

/**
 * Membuka salinan sandi. Mengembalikan null bila tidak ada salinannya, atau
 * bila kuncinya sudah berganti — keduanya keadaan yang wajar, bukan kerusakan,
 * dan layar menerangkannya sendiri.
 */
export async function buka(tersandi: string | null): Promise<string | null> {
  if (!tersandi) return null;
  const [versi, ivHex, tagHex, isiHex] = tersandi.split("$");
  if (versi !== "v1" || !ivHex || !tagHex || !isiHex) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", await kunci(),
                               Buffer.from(ivHex, "hex"));
    d.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([d.update(Buffer.from(isiHex, "hex")),
                          d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Menyimpan salinan sandi seorang pengguna.
 *
 * Dipanggil di setiap tempat sandi dipasang, dan sekali lagi saat pemiliknya
 * berhasil masuk — yang terakhir itulah yang mengisi salinan bagi akun lama
 * tanpa perlu mengganti sandi siapa pun.
 *
 * Kegagalannya ditelan: kolomnya mungkin belum terpasang pada basis data yang
 * belum menerima pemasangan kolom. Sandi yang tidak tercatat salinannya hanya
 * berarti satu baris yang kosong di layar Admin IT — sedangkan galat di sini
 * akan menggagalkan penggantian sandi maupun proses masuk.
 */
export async function catatSandi(userId: string, sandi: string): Promise<void> {
  try {
    await query("UPDATE users SET password_enc=$1 WHERE id=$2",
                [await sandikan(sandi), userId]);
  } catch { /* kolomnya belum ada; menyusul pada pemasangan berikutnya */ }
}
