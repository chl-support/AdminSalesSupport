/**
 * Pembacaan dan impor Laporan Agent.
 *
 * Data marketing selama ini lahir sebagai efek samping impor Laporan Penjualan:
 * nama yang muncul di kolom Sales dibuatkan barisnya, tanpa nomor telepon, tanpa
 * NPWP, tanpa rekening. Akibatnya tautan pendaftaran tidak dapat dikirim — kode
 * verifikasi tidak punya tujuan — dan tujuan transfer harus diketik ulang tiap
 * kali klaim diajukan.
 *
 * Laporan Agent memuat semua itu sekaligus, dan ia memang daftar resmi orangnya,
 * bukan sisa pembacaan laporan lain.
 *
 * Satu hal yang sengaja TIDAK diikuti: kolom Status pada laporan ini
 * (AKTIF/BATAL) adalah status keagenan, sedangkan kolom status pada data
 * marketing menandakan sejauh mana pendaftaran tanda tangannya selesai.
 * Menyamakan keduanya akan menjadikan setiap agen aktif langsung "active" —
 * melewati pemeriksaan yang justru menjaga agar pembayaran tidak keluar kepada
 * orang yang tanda tangannya belum pernah dicatat siapa pun.
 */

import type { PoolClient } from "pg";

import { audit, one, query } from "./db";
import { uraiNama } from "./penjualan";

export type BarisAgen = {
  kode: string; tipe: string; nama_penuh: string;
  nama: string; agensi: string | null;
  level: string; status: string;
  email: string | null; telepon: string | null; npwp: string | null;
  rekening: string | null; bank: string | null; atas_nama: string | null;
};

/** Nomor ponsel ke bentuk 62xxxxxxxxxx; null bila bukan nomor yang masuk akal. */
export function rapikanNomor(masuk: string): string | null {
  const angka = String(masuk ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  const nomor = angka.startsWith("62") ? angka
              : angka.startsWith("0") ? "62" + angka.slice(1)
              : angka.startsWith("8") ? "62" + angka
              : angka;
  return /^62\d{8,13}$/.test(nomor) ? nomor : null;
}

/**
 * NPWP dari laporan.
 *
 * Nilainya berawalan kutip tunggal — penanda teks dari sistem ekspornya — dan
 * yang kosong ditulis sebagai "...-." alih-alih dibiarkan kosong. Keduanya
 * bukan NPWP, dan menyimpannya apa adanya berarti formulir pajak mencetak
 * titik-titik sebagai nomor.
 */
export function rapikanNpwp(masuk: string): string | null {
  const s = String(masuk ?? "").trim().replace(/^'/, "");
  const angka = s.replace(/\D/g, "");
  return angka.length >= 15 ? s : null;
}

export function bacaAgen(teks: string): BarisAgen[] {
  const lines = teks.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Kepala dicari lewat isinya: baris judul di atasnya dapat bertambah tanpa
  // pemberitahuan, dan mengandalkan "baris ke-2" berarti seluruh kolom bergeser
  // diam-diam.
  const iHdr = lines.findIndex((l) => {
    const c = l.split("\t").map((x) => x.trim().toLowerCase());
    return c.includes("nama") && c.includes("level");
  });
  if (iHdr < 0) {
    throw new Error(
      "Kepala tabel tidak ditemukan. Pastikan berkasnya adalah Laporan Agent " +
      "hasil ekspor, bukan berkas lain.");
  }

  const hdr = lines[iHdr].split("\t").map((x) => x.trim().toLowerCase());
  const k = (nama: string) => hdr.indexOf(nama);
  const ambil = (c: string[], i: number) => (i >= 0 ? (c[i] ?? "").trim() : "");

  const kNo = k("no"), kTipe = k("tipe"), kNama = k("nama"), kLevel = k("level");
  const kKode = k("kode marketing"), kStatus = k("status"), kEmail = k("email");
  const kTelp = k("no telp"), kHp = k("no hp"), kWa = k("no wa");
  const kNpwp = k("no npwp"), kRek = k("no rekening"), kBank = k("bank");
  const kAtas = k("atas nama");

  if (kNama < 0) throw new Error("Kolom 'Nama' tidak ditemukan.");

  const hasil: BarisAgen[] = [];
  for (let i = iHdr + 1; i < lines.length; i++) {
    const c = lines[i].split("\t");
    if (!/^\d+$/.test(ambil(c, kNo))) continue;
    const penuh = ambil(c, kNama);
    if (!penuh) continue;
    const u = uraiNama(penuh);
    const nama = rapikanNama(u.nama);
    const agensi = u.agensi ? rapikanNama(u.agensi) : null;
    if (!nama) continue;

    // WhatsApp lebih dulu: ke sanalah kode verifikasi pendaftaran dikirim.
    // Nomor kantor pada kolom "No Telp" sering sama dengan HP, dan bila berbeda
    // yang benar tetap yang dipegang orangnya.
    const telepon = rapikanNomor(ambil(c, kWa))
                 ?? rapikanNomor(ambil(c, kHp))
                 ?? rapikanNomor(ambil(c, kTelp));

    hasil.push({
      kode: ambil(c, kKode), tipe: ambil(c, kTipe).toUpperCase(),
      nama_penuh: penuh, nama, agensi,
      level: ambil(c, kLevel).toUpperCase(),
      status: ambil(c, kStatus).toUpperCase(),
      email: ambil(c, kEmail).toLowerCase() || null,
      telepon,
      npwp: rapikanNpwp(ambil(c, kNpwp)),
      rekening: ambil(c, kRek).replace(/\s/g, "") || null,
      bank: ambil(c, kBank) || null,
      atas_nama: ambil(c, kAtas) || null,
    });
  }
  return hasil;
}

/**
 * Nama dari laporan ini seluruhnya huruf besar; Laporan Penjualan menuliskannya
 * biasa. Dibiarkan apa adanya, satu daftar akan memuat "Andy Boy" bersebelahan
 * dengan "ANDY BOY" dan terbaca sebagai dua orang yang berbeda.
 *
 * Hanya yang seluruhnya huruf besar yang diubah — nama yang sudah tertulis
 * biasa tidak disentuh — dan penanda badan usaha tetap kapital.
 */
export function rapikanNama(masuk: string): string {
  const s = String(masuk ?? "").trim().replace(/\s+/g, " ");
  if (!s || s !== s.toUpperCase()) return s;
  return s.split(" ").map((k) => (
    /^(PT|CV|UD|NV|RT|RW)\.?$/.test(k) ? k
      : k.charAt(0) + k.slice(1).toLowerCase()
  )).join(" ");
}

/** AGENT dan KOORDINATOR AGENT bernaung di bawah agensi; sisanya orang kantor. */
const jenisDari = (b: BarisAgen) =>
  b.agensi || /AGENT/.test(b.tipe) ? "agent" : "inhouse";

export type HasilAgen = {
  baris: number; baru: number; diperbarui: number; dilewati: number;
  rekening_baru: number; dry_run: boolean;
  pratinjau: {
    nama: string; agensi: string | null; tipe: string; status: string;
    telepon: string | null; npwp: boolean; rekening: string | null;
    tindakan: string; catatan: string;
  }[];
  catatan: string[];
};

export async function imporAgen(
  teks: string,
  opsi: { dryRun?: boolean; aktor?: string; namaBerkas?: string } = {},
  client?: PoolClient,
): Promise<HasilAgen> {
  const dryRun = Boolean(opsi.dryRun);
  const semua = bacaAgen(teks);

  // Satu orang dapat muncul dua kali — barisnya yang lama berstatus BATAL, yang
  // baru AKTIF. Yang aktif menang; bila keduanya sama statusnya, yang terakhir
  // menang, karena itulah baris yang paling belakangan disunting.
  const per = new Map<string, BarisAgen>();
  for (const b of semua) {
    const kunci = b.nama.toLowerCase();
    const ada = per.get(kunci);
    if (!ada || (ada.status === "BATAL" && b.status !== "BATAL")) per.set(kunci, b);
    else if (ada.status === b.status) per.set(kunci, b);
  }

  let baru = 0, diperbarui = 0, dilewati = 0, rekening_baru = 0;
  const pratinjau: HasilAgen["pratinjau"] = [];

  for (const b of per.values()) {
    const catatan: string[] = [];
    const mkt = await one<any>(
      "SELECT * FROM marketings WHERE lower(full_name)=$1",
      [b.nama.toLowerCase()], client);

    if (!mkt && b.status === "BATAL") {
      dilewati++;
      pratinjau.push({ nama: b.nama, agensi: b.agensi, tipe: b.tipe,
                       status: b.status, telepon: b.telepon,
                       npwp: Boolean(b.npwp), rekening: b.rekening,
                       tindakan: "dilewati",
                       catatan: "keagenan batal dan belum pernah tercatat" });
      continue;
    }

    let agencyId: string | null = mkt?.agency_id ?? null;
    if (b.agensi) {
      const ada = await one<{ id: string }>(
        "SELECT id FROM agencies WHERE lower(name)=$1",
        [b.agensi.toLowerCase()], client);
      if (ada) agencyId = ada.id;
      else if (!dryRun) {
        agencyId = (await query<{ id: string }>(
          "INSERT INTO agencies (name) VALUES ($1) RETURNING id",
          [b.agensi], client))[0].id;
      }
    }

    let marketingId: string | null = mkt?.id ?? null;

    if (!mkt) {
      // Dibuat berstatus 'draft': laporan ini menyatakan orangnya ada, bukan
      // bahwa tanda tangannya sudah terdaftar.
      if (!dryRun) {
        marketingId = (await query<{ id: string }>(
          `INSERT INTO marketings (full_name, marketing_type, agency_id, npwp,
             npwp_type, recipient_type, phone, email, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING id`,
          [b.nama, jenisDari(b), agencyId, b.npwp,
           b.npwp ? (b.agensi ? "company" : "personal") : "none",
           b.agensi ? "company" : "individual",
           b.telepon ?? "", b.email], client))[0].id;
      }
      baru++;
      if (!b.telepon) catatan.push("tanpa nomor telepon");
      pratinjau.push({ nama: b.nama, agensi: b.agensi, tipe: b.tipe,
                       status: b.status, telepon: b.telepon,
                       npwp: Boolean(b.npwp), rekening: b.rekening,
                       tindakan: "baru", catatan: catatan.join("; ") });
    } else {
      // Yang kosong pada laporan tidak menghapus yang sudah ada: laporan ini
      // sumber yang lebih lengkap, bukan satu-satunya sumber.
      if (!dryRun) {
        await query(
          `UPDATE marketings SET
             marketing_type=$2,
             agency_id=COALESCE($3, agency_id),
             npwp=COALESCE($4, npwp),
             phone=CASE WHEN $5::text IS NULL THEN phone ELSE $5 END,
             email=COALESCE($6, email)
           WHERE id=$1`,
          [mkt.id, jenisDari(b), agencyId, b.npwp, b.telepon, b.email], client);
      }
      diperbarui++;
      if (b.telepon && b.telepon !== mkt.phone) catatan.push("nomor diperbarui");
      if (!b.telepon && !mkt.phone) catatan.push("tetap tanpa nomor telepon");
      if (b.status === "BATAL") {
        catatan.push("keagenan batal — status pendaftaran tidak diubah");
      }
      pratinjau.push({ nama: b.nama, agensi: b.agensi, tipe: b.tipe,
                       status: b.status, telepon: b.telepon,
                       npwp: Boolean(b.npwp), rekening: b.rekening,
                       tindakan: "diperbarui", catatan: catatan.join("; ") });
    }

    // Rekening dicatat sebagai belum terverifikasi. Laporan keagenan bukan
    // verifikasi rekening — itu pekerjaan Finance — dan tujuan transfer tiap
    // klaim tetap dapat diubah pada formulirnya.
    // Nama bank kosong pada seluruh ekspor laporan ini, sedangkan nomor
    // rekeningnya ada. Menolak yang tanpa nama bank berarti membuang satu-satunya
    // keterangan yang sulit didapat; namanya dapat dilengkapi saat klaim
    // pertama diajukan, nomornya tidak.
    if (marketingId && b.rekening) {
      const ada = await one<{ id: string }>(
        `SELECT id FROM bank_accounts
          WHERE marketing_id=$1 AND replace(account_number,' ','')=$2`,
        [marketingId, b.rekening], client);
      if (!ada) {
        if (!dryRun) {
          await query(
            `INSERT INTO bank_accounts (marketing_id, holder_name,
               account_number, bank_name, holder_type, verified)
             VALUES ($1,$2,$3,$4,$5,FALSE)`,
            [marketingId, rapikanNama(b.atas_nama || b.nama), b.rekening,
             b.bank ?? "",
             /\b(PT|CV)\b/i.test(b.atas_nama ?? "") ? "company" : "individual"],
            client);
        }
        rekening_baru++;
      }
    }
  }

  if (!dryRun) {
    await audit({
      entityType: "marketing", action: "import_agent_report",
      actor: opsi.aktor ?? "cli",
      after: { file: opsi.namaBerkas ?? null, baris: per.size, baru,
               diperbarui, rekening_baru },
      reason: `Impor Laporan Agent: ${baru} marketing baru, ${diperbarui} ` +
              `diperbarui, ${rekening_baru} rekening dicatat.`,
    }, client);
  }

  return {
    baris: per.size, baru, diperbarui, dilewati, rekening_baru, dry_run: dryRun,
    pratinjau,
    catatan: [
      "Status keagenan (AKTIF/BATAL) pada laporan ini tidak mengubah status " +
      "pendaftaran tanda tangan. Marketing baru selalu masuk sebagai 'draft' " +
      "dan menjadi aktif hanya setelah tanda tangan KTP-nya disetujui.",
      "Nomor WhatsApp didahulukan atas No HP dan No Telp, dan dibakukan ke " +
      "bentuk 62xxxxxxxxxx — ke nomor itulah kode verifikasi dikirim.",
      "Rekening dicatat sebagai belum terverifikasi. Tujuan transfer tiap " +
      "klaim tetap diketik pada formulir pengajuannya.",
      "Kolom yang kosong pada laporan tidak menghapus data yang sudah ada.",
      "Nama bank tidak ada pada laporan ini, jadi rekening tercatat dengan " +
      "nomornya saja — nama banknya dilengkapi pada formulir pengajuan.",
    ],
  };
}
