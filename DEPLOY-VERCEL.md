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
| `SETUP_SECRET` | opsional, hanya bila memakai Cara A pada langkah 3. Hapus setelah selesai. |

TLS tidak perlu dikonfigurasi manual — aplikasi mengaktifkannya otomatis untuk host
non-lokal. Bila penyedia Anda justru menolak TLS, set `PGSSL=disable`.

## 3. Jalankan migrasi sekali

Migrasi **tidak** berjalan otomatis saat deploy. Ada dua cara.

### Cara A — lewat browser, tanpa memasang apa pun

Tambahkan satu variabel lagi di Vercel, lalu **Redeploy**:

| Nama | Nilai |
|---|---|
| `SETUP_SECRET` | kata sandi **yang Anda tentukan sendiri**, satu kata tanpa spasi, mis. `bio-district-2026` |

> `SETUP_SECRET` adalah kata sandi yang Anda karang sendiri, bukan nilai yang
> diberikan sistem. Isi dengan satu kata tanpa spasi. Nilai yang sama itulah yang
> nanti Anda ketikkan di halaman `/setup`.
>
> Pada contoh baris perintah di bawah, tulisan `<SETUP_SECRET>` adalah penanda
> tempat — ganti dengan kata sandi Anda, jangan disalin apa adanya.

Buka `https://<domain-anda>.vercel.app/api/admin/setup` untuk melihat status. Lalu
jalankan penyiapannya:

```bash
curl -X POST "https://<domain-anda>.vercel.app/api/admin/setup?seed=true" \
  -H "x-setup-secret: setup-9f2a7c14be03"
```

Respons yang diharapkan:

```json
{ "ok": true, "steps": ["migrasi selesai — 24 tabel",
                        "seed selesai — 6 unit, 4 marketing, 7 pengguna"] }
```

**Setelah berhasil, hapus `SETUP_SECRET` lalu redeploy.** Tanpa variabel itu route
membalas 404 dan kembali tidak aktif.

Tiga pengaman pada endpoint ini: mati secara bawaan bila `SETUP_SECRET` kosong;
rahasia dibandingkan secara constant-time; dan seed menolak berjalan bila sudah ada
klaim tersimpan, kecuali ditambahi `&force=true`.

### Cara B — dari mesin Anda

```bash
git clone https://github.com/chl-support/AdminSalesSupport.git
cd AdminSalesSupport
npm install
DATABASE_URL='<connection string yang sama>' npm run db:migrate
DATABASE_URL='<connection string yang sama>' npm run db:seed     # data contoh
```

`db:migrate` idempoten — aman dijalankan berulang. `db:seed` **mengosongkan** tabel
sebelum mengisi, jadi jangan dijalankan terhadap basis data berisi data sungguhan.

> Seed bukan sekadar data contoh: ia juga membuat tujuh pengguna dan konfigurasi
> skema insentif serta tarif pajak. Tanpa itu, konsol tidak dapat dipakai sama
> sekali karena tidak ada pengguna yang dapat dikenali.

## 3b. Masuk ke konsol

Konsol kini menuntut login. Tidak ada lagi pemilih "Masuk sebagai" — identitas
berasal dari cookie sesi, dan seluruh endpoint menolak permintaan tanpa sesi yang
sah.

`db:seed` membuat tujuh akun, masing-masing dengan kata sandi sendiri. Seed
mencetaknya saat dijalankan; nilainya juga tertulis di `scripts/seed.ts`.

| Username | Peran |
|---|---|
| `admin` | Admin Sales |
| `ratna` | Finance (Pajak) |
| `ratih` | Finance (Pembayaran) |
| `fmanager` | Finance Manager |
| `headfin` | Head Finance |
| `mgmt` | Management |
| `sysadmin` | Admin Sistem |

> Sandi bawaan itu dapat ditebak dan tertulis di repositori publik. **Ganti
> seluruhnya sebelum dipakai sungguhan.**
>
> Lewat konsol: menu **Administrasi**. Setiap pengguna dapat mengganti sandinya
> sendiri di sana (perlu sandi lama); Admin Sistem dapat mengganti sandi siapa
> pun. Mengganti sandi selalu memutus sesi yang sedang berjalan — kecuali saat
> seseorang mengganti sandinya sendiri, di mana layar yang sedang dipakai tetap
> terbuka dan hanya perangkat lain yang terputus.
>
> Tersedia juga dari baris perintah:
>
> ```bash
> DATABASE_URL='<url>' npm run db:password -- <username> '<sandi baru>'
> ```

**Basis data yang sudah berjalan sebelum perubahan ini** perlu migrasi sekali lagi
(langkah 3; `db:migrate` idempoten) untuk menambahkan tabel `sessions` dan
`login_attempts`. Tanpa seed ulang, ketujuh akun masih memakai sandi lama `demo` —
hash lamanya tetap diterima sekali lalu ditulis ulang ke bentuk yang lebih kuat
saat pemiliknya masuk. Gantilah dengan perintah di atas; seed ulang akan
menghapus data klaim.

Lima kali salah sandi mengunci akun selama 15 menit. Penguncian berlaku per akun,
bukan per alamat IP.

## 3c. Impor data penjualan

Lewat konsol: masuk sebagai Admin Sistem, buka menu **Administrasi** → **Unggah
Laporan Penjualan**. Pilih berkas, tekan **Lihat pratinjau** untuk melihat apa
yang akan terjadi, lalu **Tulis ke basis data**. Tidak ada yang ditulis sebelum
tombol kedua ditekan.

Tersedia juga dari baris perintah, memakai kode yang sama:

```bash
DATABASE_URL='<url>' npm run db:import -- 'Report_Penjualan_20260914.xls' --dry-run
DATABASE_URL='<url>' npm run db:import -- 'Report_Penjualan_20260914.xls'
```

Impor idempoten: dijalankan ulang atas laporan yang sama tidak menggandakan baris.

Satu baris = satu **penjualan**, bukan satu unit fisik. Unit yang pembelinya
batal lalu dijual lagi menjadi dua baris dengan nomor kontrak berbeda, karena
klaim melekat pada penjualannya.

Dua hal yang **tidak** diambil dari laporan, dan memang tidak bisa:

- **Prasyarat pencairan** (SPU, PPJB, DP, Sign P3U) tidak ada di laporan. Nilainya
  tidak disentuh impor — Admin Sales yang mencatatnya.
- **Marketing hasil impor berstatus `draft`**, belum `active`. Status aktif berarti
  pendaftaran dan perekaman spesimen tanda tangan sudah selesai; itu tidak dapat
  disimpulkan dari laporan penjualan. Selama masih draft, mereka belum dapat
  menerima pembayaran dan unitnya belum dapat diklaim.

## 4. Deploy ulang lalu periksa

Setelah variabel lingkungan diisi, jalankan **Redeploy** dari dashboard — variabel
baru tidak berlaku pada deployment yang sudah ada.

Lalu buka:

```
https://<domain-anda>.vercel.app/api/health
```

Selain status, respons memuat blok `config` yang melaporkan apa yang **benar-benar
terbaca oleh fungsi yang sedang berjalan** — tanpa kredensial:

```json
"config": {
  "database_url": { "present": true, "host": "ep-xxx-pooler...", "pooled": true,
                    "sslmode": "require", "trimmed": false },
  "setup_secret_present": true,
  "vercel": { "env": "production", "branch": "main", "commit": "5a63cd6" }
}
```

Cara membacanya ketika variabel sudah diisi tetapi pesannya tetap muncul:

| Yang terlihat | Artinya |
|---|---|
| `present: false` | Fungsi ini tidak melihat variabelnya. Hampir selalu karena deployment dibuat **sebelum** variabel ditambahkan — jalankan Redeploy. |
| `present: false` dan `vercel.env` berbeda dari yang Anda centang | Variabel hanya dicentang untuk sebagian environment. Buka Settings dan centang ketiganya. |
| `trimmed: true` | Ada spasi atau tanda petik ikut tersalin. Aplikasi membersihkannya otomatis, tetapi sebaiknya diperbaiki di dashboard. |
| `pooled: false` pada Neon/Supabase | Anda memakai connection string langsung. Ganti dengan yang pooled. |

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

**Unggahan berkas tersimpan di basis data, maksimal 3 MB per berkas.** Kwitansi,
Invoice, dan dokumen pendukung yang diunggah agent dari tautan tanda tangan
tersimpan utuh sebagai `bytea` pada `claim_documents`, bukan sekadar namanya.
Batas 3 MB mengikuti batas badan permintaan Vercel (4,5 MB); berkas yang lebih
besar tidak akan pernah sampai ke server berapa pun longgarnya kolomnya.
Yang belum: enkripsi at-rest dan kebijakan retensi yang belum ditetapkan Legal
(PRD Q14, Q27). Bila volume lampiran tumbuh, pindahkan isinya ke penyimpanan
objek dan sisakan rujukannya di kolom yang sama.

**Autentikasi berupa username dan kata sandi dengan sesi cookie.** Sandi di-hash
dengan scrypt bergaram, token sesi disimpan sebagai hash, dan cookie-nya HttpOnly.
Yang masih kurang sebelum menyentuh pembayaran sungguhan: MFA untuk peran Finance,
Management, dan Admin Sistem; kebijakan usia dan kerumitan sandi; serta alur ganti
sandi mandiri. Header `X-User` yang lama sudah dihapus.

**Deployment ini publik.** Bila belum siap dilihat umum, aktifkan Vercel Authentication
di Settings → Deployment Protection.
