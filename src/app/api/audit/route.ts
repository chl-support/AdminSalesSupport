import { audit, one, query } from "@/lib/db";
import { body, clientIp, currentUser, handler, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";

/**
 * Siapa boleh apa atas jejak audit.
 *
 * Membaca terbuka bagi seluruh peran konsol, termasuk Admin Sales: jejak audit
 * yang hanya dapat dilihat pihak yang diawasinya sendiri tidak mengawasi apa pun.
 *
 * Yang dibatasi adalah menulis. Itu pun bukan menyunting: tabel ini append-only
 * di sisi basis data (RULE yang berlaku bahkan bagi pemilik tabel), jadi satu-
 * satunya bentuk koreksi yang mungkin adalah membubuhkan entri baru yang menunjuk
 * entri lama. Sifat itu disengaja, bukan keterbatasan — jejak audit yang dapat
 * disunting satu peran berhenti membuktikan apa pun tentang peran itu.
 */
const PEMBACA = [
  "admin_sales", "finance_tax", "finance_payment", "finance_manager",
  "head_finance", "management", "admin_system",
];

/** Finance/Pajak beserta atasannya di jalur yang sama. */
const PENGOREKSI = ["finance_tax", "finance_manager", "head_finance"];

/**
 * Jejak audit sebagai sumber yang dapat ditelusuri, bukan sekadar cuplikan.
 *
 * Sebelumnya endpoint ini hanya menerima `entity_id` dan `limit`, lalu
 * mengembalikan array polos. Itu cukup untuk menempelkan 40 baris terakhir di
 * kaki konsol, tetapi tidak untuk menjawab pertanyaan yang membuat jejak audit
 * ada: siapa mengubah apa, kapan, dan dengan alasan apa. Menyaring di peramban
 * bukan jalan keluarnya — yang terkirim hanya 40 baris terakhir, jadi entri yang
 * dicari justru yang paling mungkin sudah terpotong sebelum sampai.
 *
 * Penyaringan karena itu dilakukan di SQL, dan responsnya memuat `total` agar
 * pemanggil tahu ada berapa yang cocok, bukan hanya berapa yang terkirim.
 */

/** Nilai yang tersedia untuk disaring, diambil dari isi tabel yang sebenarnya. */
async function facets() {
  const [actors, actions, types] = await Promise.all([
    query<{ v: string }>(
      "SELECT DISTINCT actor AS v FROM audit_log WHERE actor IS NOT NULL ORDER BY 1"),
    query<{ v: string }>("SELECT DISTINCT action AS v FROM audit_log ORDER BY 1"),
    query<{ v: string }>("SELECT DISTINCT entity_type AS v FROM audit_log ORDER BY 1"),
  ]);
  return {
    actors: actors.map((r) => r.v),
    actions: actions.map((r) => r.v),
    entity_types: types.map((r) => r.v),
  };
}

export const GET = handler(async (req) => {
  const user = await requireRole(req, ...PEMBACA);
  const url = new URL(req.url);
  const get = (k: string) => url.searchParams.get(k)?.trim() || null;

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  // Dibangun sebagai daftar agar tiap filter yang kosong benar-benar tidak
  // menyentuh query, dan tiap nilai tetap lewat parameter — bukan digabung
  // ke dalam teks SQL.
  const where: string[] = [];
  const params: any[] = [];
  const add = (clause: string, value: any) => {
    params.push(value);
    where.push(clause.replace("$?", `$${params.length}`));
  };

  const entityId = get("entity_id");
  if (entityId) add("entity_id = $?", entityId);

  const entityType = get("entity_type");
  if (entityType) add("entity_type = $?", entityType);

  const actor = get("actor");
  if (actor) add("actor = $?", actor);

  const action = get("action");
  if (action) add("action = $?", action);

  const since = get("since");
  if (since) add("occurred_at >= $?", since);

  const until = get("until");
  // Tanggal polos berarti "sampai akhir hari itu", bukan tengah malam awalnya —
  // kalau tidak, menyaring satu hari yang sama pada since dan until selalu kosong.
  if (until) add("occurred_at < ($?::timestamptz + interval '1 day')", until);

  const q = get("q");
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(`(action ILIKE $${i} OR reason ILIKE $${i} OR actor ILIKE $${i} ` +
               `OR entity_id ILIKE $${i} OR entity_type ILIKE $${i})`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query(
    `SELECT id, entity_type, entity_id, action, actor, before, after, reason,
            ip_address, occurred_at
       FROM audit_log ${clause}
      ORDER BY occurred_at DESC, id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]);

  const totalRow = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM audit_log ${clause}`, params);
  const total = totalRow?.n ?? 0;

  return {
    rows,
    total,
    limit,
    offset,
    has_more: offset + rows.length < total,
    facets: await facets(),
    // Dilaporkan supaya layar tidak menawarkan kendali yang akan ditolak server.
    // Penegakannya tetap di server: menyembunyikan tombol tidak menghentikan
    // siapa pun yang memanggil API langsung.
    viewer: {
      username: user.username,
      role: user.role,
      can_annotate: PENGOREKSI.includes(user.role),
    },
  };
});

/**
 * Membubuhkan koreksi pada satu entri.
 *
 * Bukan penyuntingan: entri lama tetap utuh dan tetap terbaca. Yang terjadi
 * adalah entri baru yang menunjuk entri lama, sehingga riwayat koreksinya pun
 * ikut terekam. Inilah satu-satunya "kendali" yang dapat diberikan atas tabel
 * append-only tanpa merusak alasan keberadaannya.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, ...PENGOREKSI);
  const p = await body<{ entry_id?: string; reason?: string }>(req);

  const entryId = p.entry_id?.trim();
  const reason = p.reason?.trim();
  if (!entryId) {
    throw new WorkflowError("entry_id wajib diisi.", "validation", 422);
  }
  if (!reason) {
    // Koreksi tanpa alasan tidak menjelaskan apa pun kepada pembaca berikutnya,
    // dan entri ini tidak dapat diperbaiki setelah tertulis.
    throw new WorkflowError(
      "Alasan koreksi wajib diisi — entri ini tidak dapat disunting setelah tersimpan.",
      "validation", 422);
  }

  const asli = await one<{ id: string; entity_type: string; entity_id: string | null }>(
    "SELECT id, entity_type, entity_id FROM audit_log WHERE id=$1", [entryId]);
  if (!asli) {
    throw new WorkflowError("Entri audit tidak ditemukan.", "not_found", 404);
  }

  const id = await audit({
    entityType: asli.entity_type,
    entityId: asli.entity_id,
    action: "audit_correction",
    actor: user.username,
    after: { corrects_entry: asli.id },
    reason,
    ip: clientIp(req),
  });

  return {
    ok: true,
    id,
    corrects_entry: asli.id,
    note: "Entri asli tidak diubah. Koreksi tercatat sebagai entri baru.",
  };
});
