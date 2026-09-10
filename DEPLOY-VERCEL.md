# Deploy ke Vercel

Build di Vercel sudah berhasil sejak awal. Yang menyebabkan aplikasi tidak berfungsi
setelah deploy adalah hal-hal yang tidak tertangkap saat build: basis data.

Vercel menjalankan aplikasi, **bukan** menyediakan PostgreSQL. Tanpa basis data yang
dapat dijangkau dan sudah dimigrasikan, seluruh endpoint akan membalas 500 meskipun
build-nya hijau.

---

## 1. Sediakan PostgreSQL

Pilih salah satu. Ketiganya punya paket gratis yang cukup untuk pengujian:

| Penyedia | Catatan |
|---|---|
| **Neon** | Paling cocok untuk serverless. Gunakan **pooled connection string** (mengandung `-pooler`), bukan yang langsung. |
| **Supabase** | Ambil dari Settings → Database → Connection string → **Transaction pooler** (port 6543). |
| **Vercel Postgres** | Terintegrasi; `DATABASE_URL` terisi otomatis saat storage ditautkan ke project. |

Alasan memakai connection string yang *pooled*: tiap instance fungsi serverless
membuat pool sendiri. Saat trafik naik, puluhan instance menyala bersamaan dan
kuota koneksi Postgres habis. Pooler di sisi penyedia yang menyerap itu.

## 2. Isi variabel lingkungan di Vercel

**Settings → Environment Variables**, centang ketiga environment (Production,
Preview, Development):

| Nama | Nilai |
|---|---|
| `DATABASE_URL` | connection string dari langkah 1 |

TLS tidak perlu dikonfigurasi manual — aplikasi mengaktifkannya otomatis untuk host
non-lokal. Bila penyedia Anda justru menolak TLS, set `PGSSL=disable`.

## 3. Jalankan migrasi sekali

Migrasi **tidak** berjalan otomatis saat deploy. Dari mesin Anda:

```bash
git clone https://github.com/chl-support/AdminSalesSupport.git
cd AdminSalesSupport
npm install
DATABASE_URL='<connection string yang sama>' npm run db:migrate
DATABASE_URL='<connection string yang sama>' npm run db:seed     # opsional, data contoh
```

`db:migrate` idempoten — aman dijalankan berulang. `db:seed` **mengosongkan** tabel
sebelum mengisi, jadi jangan dijalankan terhadap basis data yang sudah berisi data
sungguhan.

## 4. Deploy ulang lalu periksa

Setelah variabel lingkungan diisi, jalankan **Redeploy** dari dashboard — variabel
baru tidak berlaku pada deployment yang sudah ada.

Lalu buka:

```
https://<domain-anda>.vercel.app/api/health
```

| Respons | Arti |
|---|---|
| `"status": "ok"` beserta jumlah klaim | Basis data terhubung dan skema sudah ada |
| `"status": "degraded"` + `"Tabel belum ada..."` | `DATABASE_URL` benar, migrasi belum dijalankan (langkah 3) |
| `"status": "degraded"` + `"DATABASE_URL belum diisi"` | Variabel belum terbaca; periksa environment-nya dan redeploy |
| `"status": "degraded"` + `"Koneksi ditolak"` | Host memblokir akses dari luar, atau string salah |

Endpoint ini sengaja benar-benar menyentuh basis data. Health check yang selalu
membalas "ok" tanpa menguji dependensinya justru hijau ketika aplikasinya tidak
dapat melayani apa pun.

---

## Yang berubah pada kode untuk mendukung ini

**Pool dibuat saat pertama dipakai, bukan saat modul dimuat.** Melempar galat pada
waktu impor akan mematikan seluruh route termasuk `/api/health` — padahal justru itu
yang dibutuhkan untuk mendiagnosis deploy yang variabelnya belum lengkap.

**Ukuran pool menyesuaikan lingkungan.** Terdeteksi serverless lewat `process.env.VERCEL`,
lalu pool dikecilkan menjadi 2 koneksi per instance. Nilai default 10 aman di server
tunggal, tetapi menghabiskan kuota Postgres terkelola begitu ada beberapa instance.

**TLS otomatis untuk host non-lokal.** Tanpa ini, kegagalan pertama di produksi
berupa `no pg_hba.conf entry for host` yang tidak jelas hubungannya dengan TLS.

**Galat basis data diterjemahkan.** Kode `42P01` menjadi "Tabel belum ada, jalankan
migrasi"; `ECONNREFUSED` menjadi penjelasan tentang `DATABASE_URL`. Kode pg mentah
tidak menuntun ke mana pun bagi orang yang sedang menatap dashboard Vercel.

**Next.js dinaikkan ke 16.** Log build Vercel memperingatkan bahwa 15.5.4 memuat
kerentanan keamanan (CVE-2025-66478).

**`vercel.json`** menaikkan batas waktu fungsi export laporan menjadi 60 detik.
Menyusun workbook 87 kolom bisa melewati batas bawaan 10 detik pada dataset besar.

---

## Batas yang perlu diketahui

**Seluruh route API bersifat dinamis** dan menyentuh basis data. Tidak ada yang
di-cache di edge. Ini disengaja: data klaim dan status persetujuan tidak boleh basi.

**Unggahan berkas belum disimpan.** Nama berkas dicatat, isinya tidak. Untuk produksi
diperlukan penyimpanan objek terenkripsi — Vercel Blob, S3, atau setara — beserta
kebijakan retensi yang belum ditetapkan Legal (PRD Q14, Q27).

**Autentikasi masih header `X-User`.** Cukup untuk demo, tidak untuk produksi. Ganti
dengan OIDC/JWT dan aktifkan MFA untuk peran Finance, Management, dan Admin Sistem
sebelum sistem ini menyentuh pembayaran sungguhan.

**Deployment ini publik.** Bila belum siap dilihat umum, aktifkan Vercel Authentication
di Settings → Deployment Protection.
