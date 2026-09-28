import { handler, projectAktif } from "@/lib/api";
import { query } from "@/lib/db";
import { LANGKAH, langkahDari, sebutanLangkah } from "@/lib/langkah";
import { HANDOFF_NEXT } from "@/lib/workflow";

/**
 * Perjalanan tiap pengajuan, dengan kolom sebagaimana Tabel Sirkulasi Dokumen
 * yang dipakai kantor.
 *
 * Yang ditampilkan seluruh pengajuan project ini — sama dengan yang ada di
 * layar Approval / Persetujuan. Bedanya pertanyaan yang dijawab: Approval
 * menjawab "sedang di mana", sedangkan layar ini menjawab "sudah berapa lama
 * sejak diajukan, dan lamanya di bagian mana".
 *
 * Sebelumnya hanya empat status peredaran fisik yang tampil. Dokumen yang
 * berbulan-bulan tertahan di verifikasi pajak tidak pernah muncul sama sekali,
 * padahal ia persis dokumen yang dicari orang ketika bertanya "kenapa lama".
 *
 * Unit dan jenis dokumennya ikut dibaca: yang mencari berkas di meja orang
 * menyebutnya "berkas unit NS-NR3-01", bukan nomor klaimnya.
 *
 * Nomor Internal Office Memo, divisi pengirim dan penerima, serta tanggal
 * distribusi dan tanggal diterima diisi tangan — semuanya tidak dapat
 * disusun dari data yang ada. Lihat /api/claims/[id]/sirkulasi.
 *
 * Divisi pengirim tidak tersimpan pada klaimnya — yang tersimpan hanya
 * pemegang sekarang. Yang dapat disusun dari riwayat serah terima tetap
 * dihitung dan ditawarkan sebagai bayangan pada isiannya: pemegang sebelumnya
 * adalah tujuan perpindahan sebelumnya, dan klaim yang baru sekali berpindah
 * datang dari Admin Sales, sebab di sanalah dokumen dicetak sebelum
 * diedarkan.
 */

/** Status yang mengakhiri perjalanan; sesudahnya tidak ada yang menunggu. */
const BERHENTI = ["paid", "completed", "rejected", "cancelled", "clawback"];

/**
 * Empat kelompok pada bilah hitungan, sebagai pembagian yang tidak tumpang
 * tindih atas seluruh pengajuan project ini.
 *
 * Satu klaim hanya masuk satu kelompok, dan keempatnya menjumlah persis
 * sebanyak baris tabelnya. Kelompok yang saling tumpang tindih membuat jumlah
 * keempatnya melebihi jumlah klaimnya, dan yang membacanya tidak punya cara
 * tahu mana yang terhitung dua kali.
 *
 * Dahulu hanya peredaran fisik yang dihitung, sehingga bilahnya membaca "0
 * Dalam Proses" di atas tabel berisi lima pengajuan yang jelas masih
 * berjalan — angkanya menghitung hal lain daripada yang ditunjuk tabelnya.
 * Karena itu "proses" kini berarti sisanya: apa pun yang belum berakhir dan
 * fisiknya belum di tangan orang luar.
 */
const KELOMPOK: Record<string, string[]> = {
  // Fisiknya di tangan pihak lain.
  luar: ["circulating_head_finance", "circulating_management"],
  // Sudah kembali, menunggu pindaiannya diunggah.
  masuk: ["awaiting_scan_upload"],
  // Perjalanannya berakhir — tidak ada lagi yang ditunggu.
  selesai: BERHENTI,
};

const HARI = 24 * 60 * 60 * 1000;

export const GET = handler(async (req) => {
  const projectId = await projectAktif(req);

  const perStatus = await query<{ status: string; n: string }>(
    `SELECT status, COUNT(*)::text AS n FROM claims
      WHERE project_id = $1 GROUP BY status`, [projectId]);
  const jumlah = (nama: string) => perStatus
    .filter((r) => KELOMPOK[nama].includes(r.status))
    .reduce((t, r) => t + Number(r.n), 0);
  const semua = perStatus.reduce((t, r) => t + Number(r.n), 0);
  const luar = jumlah("luar");
  const masuk = jumlah("masuk");
  const selesai = jumlah("selesai");
  const hitung = {
    luar, masuk, selesai,
    proses: Math.max(0, semua - luar - masuk - selesai),
  };

  const baris = await query<any>(
    `SELECT c.id, c.claim_number, c.print_copy_number, c.claim_type, c.status,
            c.physical_location, c.physical_since, c.created_at,
            c.office_memo_no, c.sender_division, c.handed_to,
            to_char(c.received_at, 'YYYY-MM-DD') AS received_at,
            to_char(c.distributed_at, 'YYYY-MM-DD') AS distributed_at,
            u.code AS unit_code,
            EXTRACT(DAY FROM now() - c.physical_since)::int AS age_days,
            (SELECT to_char(s.transfer_date, 'YYYY-MM-DD')
               FROM settlements s
               JOIN settlement_lines sl ON sl.settlement_id = s.id
               JOIN payment_instructions pi ON pi.id = sl.instruction_id
              WHERE pi.claim_id = c.id
              ORDER BY s.transfer_date DESC LIMIT 1) AS tgl_bayar,
            (SELECT h.event FROM handoffs h
              WHERE h.claim_id = c.id
              ORDER BY h.occurred_at DESC OFFSET 1 LIMIT 1) AS prev_event
       FROM claims c
       LEFT JOIN units u ON u.id = c.unit_id
      WHERE c.project_id = $1
      ORDER BY c.created_at DESC`,
    [projectId]);

  // Satu kueri untuk seluruh jejaknya, bukan satu kueri per baris: tabel ini
  // memuat seluruh pengajuan project, dan satu kueri per baris menjadikannya
  // ratusan perjalanan bolak-balik untuk satu kali muat layar.
  const jejak = baris.length
    ? await query<{ entity_id: string; action: string; occurred_at: Date }>(
        `SELECT entity_id, action, occurred_at FROM audit_log
          WHERE entity_type = 'claim' AND action LIKE 'status:%'
            AND entity_id = ANY($1::text[])
          ORDER BY occurred_at`,
        [baris.map((b) => String(b.id))])
    : [];
  const perKlaim = new Map<string, typeof jejak>();
  for (const j of jejak) {
    const daftar = perKlaim.get(j.entity_id) ?? [];
    daftar.push(j);
    perKlaim.set(j.entity_id, daftar);
  }

  const sekarang = new Date();
  return {
    hitung,
    baris: baris.map((b) => {
      const mulai = new Date(b.created_at);
      const selesai = BERHENTI.includes(b.status);
      // Perjalanan berhenti pada tanggal uang keluar bila ada; klaim yang
      // berakhir tanpa pembayaran — ditolak, dibatalkan — berhenti pada
      // perpindahan terakhirnya, bukan berjalan terus sampai hari ini.
      const daftar = perKlaim.get(String(b.id)) ?? [];
      const akhir = b.tgl_bayar ? new Date(`${b.tgl_bayar}T00:00:00Z`)
        : selesai && daftar.length
          ? new Date(daftar[daftar.length - 1].occurred_at)
          : sekarang;
      // Langkah yang sedang berjalan, disebut sebagaimana layar Approval
      // menyebutnya — "Pajak", "Admin Sales", "Sales/Agent". Status mentah
      // seperti "awaiting_scan_upload" tidak berarti apa pun bagi yang
      // membaca tabel ini.
      const nKini = langkahDari(b.status);
      const lKini = nKini ? LANGKAH.find((x) => x.n === nKini) : null;

      return {
        ...b,
        dari: b.prev_event ? HANDOFF_NEXT[b.prev_event]?.[1] ?? null : "Admin Sales",
        selesai,
        durasi_hari: Math.max(0, Math.round(
          (akhir.getTime() - mulai.getTime()) / HARI)),
        kini: lKini ? sebutanLangkah(lKini, b.status) : null,
      };
    }),
  };
});
