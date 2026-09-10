# Sistem Klaim Insentif Marketing — BIO District

Next.js 15 (App Router) + PostgreSQL 16 + TypeScript.

Implementasi PRD v1.7 untuk PT. Serpong Bangun Lestari: pengajuan klaim Closing Fee,
Komisi, Cash Reward, dan Overriding; gate verifikasi pajak; tanda tangan digital lewat
tautan WhatsApp; crosscheck paralel; sirkulasi dokumen cetak; penginputan tanggal
pembayaran; dan export Laporan Master ke Excel.

---

## Menjalankan

### Dengan Docker

```bash
cp .env.example .env
docker compose up --build
```

Aplikasi tersedia di **http://localhost:3000**; migrasi dijalankan otomatis saat
kontainer aplikasi menyala.

### Tanpa Docker

Butuh Node 22 dan PostgreSQL 16 yang sudah berjalan.

```bash
npm install
cp .env.example .env          # sesuaikan DATABASE_URL
npm run db:migrate            # buat 24 tabel, enum, indeks, dan rule
npm run db:seed               # konfigurasi dan data contoh
npm run dev                   # http://localhost:3000
```

Menjalankan uji alur ujung-ke-ujung terhadap basis data sungguhan:

```bash
npm run test                  # 39 pengujian
```

### Mencoba alurnya

1. Di konsol, tekan **Jalankan alur sampai tanda tangan**. Satu klaim komisi dibuat,
   dokumennya dilengkapi, diteruskan ke Finance, lalu diverifikasi pajak dengan
   koreksi nominal.
2. Konsol menampilkan tautan yang biasanya dikirim lewat WhatsApp beserta kode OTP.
   Buka tautannya — itu layar yang dilihat agent.
3. Masukkan OTP, tinjau dokumen. Selisih nominal dan alasan koreksinya ditampilkan
   sebelum kanvas tanda tangan aktif.
4. Tanda tangani. Coretan acak ditolak dengan skor dan saran perbaikan; setelah tiga
   percobaan klaim naik ke tinjauan Admin, bukan ditolak.
5. Kembali ke konsol untuk crosscheck, cetak, sirkulasi, pindaian, dan tanggal transfer.

Tombol **Uji gate** memanggil endpoint penerbitan tautan pada klaim yang belum
diverifikasi pajak. Jawaban `409` adalah perilaku yang benar.

Pengguna demo (ganti lewat dropdown): `admin` · `ratna` (Finance Pajak) ·
`ratih` (Finance Pembayaran) · `fmanager` · `mgmt` · `sysadmin`.

---

## Struktur

```
db/schema.sql               Skema PostgreSQL: enum, tabel, indeks parsial, rule
src/lib/
  db.ts                     Pool, transaksi, audit, konfigurasi, idempotensi
  money.ts                  Aritmetika rupiah eksak dan terbilang
  calc.ts                   Perhitungan insentif dan matriks tarif pajak
  signature.ts              Pencocokan tanda tangan: lapis statis + dinamis
  workflow.ts               State machine, empat gate, aturan bisnis
  settlement.ts             Tanggal transfer, penguncian periode, rekap
  report.ts                 Penyusun Laporan Master (view atas data klaim)
  api.ts                    Helper route: auth, peran, problem+json
src/app/
  page.tsx                  Konsol internal
  sign/[token]/page.tsx     Layar tanda tangan agent
  api/**/route.ts           33 route handler
scripts/
  migrate.ts  seed.ts  test-flow.ts  synthetic-signature.ts
```

---

## Empat gate yang ditegakkan di server

Berada di `src/lib/workflow.ts`, bukan di komponen React. Menyembunyikan tombol tidak
menghentikan siapa pun yang memanggil API langsung.

| Gate | Perilaku | Rujukan |
|---|---|---|
| **Verifikasi pajak** | `POST /api/claims/{id}/signature-requests` menolak `409` selama status bukan `tax_verified`. Tidak ada parameter, peran, atau flag yang melewatinya. | BR-13 |
| **Dokumen bersegel** | Setelah tanda tangan terverifikasi, hitung ulang dan perubahan dokumen ditolak `409`. Perubahan nilai hanya lewat `financial-findings`, yang membatalkan tanda tangan. | BR-11, BR-20 |
| **Pemisahan tugas** | Verifikator pajak tidak dapat menyetujui pembayaran klaim yang sama. | FR-4.23 |
| **Tanpa penolakan permanen** | Verifikasi tanda tangan tidak pernah mengembalikan status ditolak. Setelah percobaan ketiga, klaim naik ke tinjauan manusia. | FR-5.13 |

Penginputan tanggal pembayaran menambah empat batas lagi: tanggal masa depan ditolak,
bukti transfer wajib, mundur melebihi toleransi perlu Finance Manager, dan periode
tertutup mengalihkan entri terlambat ke periode terbuka berikutnya dengan rujukan.

---

## Yang dipindahkan ke basis data

Beberapa aturan sekarang dijaga PostgreSQL, bukan hanya kode aplikasi. Ini yang paling
berubah dibanding versi sebelumnya:

**Anti-duplikat klaim** memakai `UNIQUE INDEX` parsial pada kombinasi
`(unit_id, claim_type, recipient_role)` untuk status aktif saja. Satu unit boleh punya
tiga klaim Closing Fee dengan peran berbeda (Sales Inhouse, Sales Manager, Markom) dan
dua Cash Reward — sesuai koreksi kardinalitas PRD 7.B.2. Race condition antar-request
ditolak basis data, bukan diserahkan ke pemeriksaan aplikasi yang bisa saling menyalip.

**Konsistensi nilai bersih** dijaga `CHECK (net_amount = gross_amount + vat -
withholding_tax)`. Kombinasi yang tidak mungkin ditolak sebelum tersimpan.

**Tanggal transfer masa depan** ditolak `CHECK (transfer_date <= CURRENT_DATE)` pada
tabel `settlements`, selain pemeriksaan di lapisan aplikasi.

**`audit_log` append-only** memakai `RULE ... DO INSTEAD NOTHING` untuk `UPDATE` dan
`DELETE`. Rule berlaku bahkan bagi pemilik tabel, tidak seperti trigger yang dapat
dilewati dengan `ALTER TABLE ... DISABLE TRIGGER`.

---

## Penanganan uang

**Uang selalu `BIGINT` rupiah penuh** di basis data dan `number` di TypeScript.
Persentase memakai `NUMERIC(12,8)` dan dibiarkan sebagai string oleh driver `pg` —
parser `int8` diubah menjadi angka, `numeric` sengaja tidak.

**Perkalian persentase memakai BigInt berskala**, bukan floating point. Alasannya
konkret: `185_000_000 * 0.0025` pada IEEE-754 menghasilkan `462499.99999999994`.
Dibulatkan memang tetap benar untuk kasus ini, tetapi pada tarif dan nilai lain
selisihnya muncul sebagai rupiah yang hilang — kecil per transaksi, tidak pernah nol
saat direkonsiliasi setahun. Seluruh perkalian melewati `applyRate()` di
`src/lib/money.ts`, dan pembulatan hanya terjadi di sana.

**Setiap perhitungan menyimpan snapshot** berisi versi skema, basis, tarif, status PKP,
jenis NPWP, dan aturan pembulatan. Ini yang memungkinkan auditor tiga tahun ke depan
menjawab "mengapa angkanya segini" tanpa menebak konfigurasi saat itu.

---

## Pencocokan tanda tangan

Dua lapis di `src/lib/signature.ts`, tanpa dependensi biner:

- **Statis** — PNG didekode manual (chunk IHDR/IDAT, `zlib.inflateSync`, pembalikan
  filter per baris), dinormalisasi dengan menjaga rasio aspek, lalu dibandingkan lewat
  tumpang tindih (IoU), jarak momen Hu, profil proyeksi, dan rasio aspek.
- **Dinamis** — urutan titik diresampel seragam menurut panjang busur, lalu
  dibandingkan dengan Dynamic Time Warping. Menangkap ritme dan urutan goresan.

Bila data goresan tidak tersedia, verifikasi jatuh ke lapis statis saja dan skornya
cenderung lebih rendah. Ini dilaporkan lewat `layers_used`, bukan disembunyikan.

Pembanding per klaim adalah **baseline spesimen digital**, bukan tanda tangan KTP. KTP
hanya dipakai sekali saat onboarding sebagai jangkar identitas, dengan ambang lebih
longgar karena sifatnya lintas-medium.

### Yang harus dikerjakan sebelum produksi

**Ambang 75 belum dikalibrasi.** Angka itu berasal dari PRD sebagai nilai sementara,
bukan hasil pengukuran. Skor kemiripan tidak punya makna universal — 75 pada algoritma
ini tidak setara 75 pada algoritma lain. Jalankan protokol PRD §12.2 (30–50 agent,
10 tanda tangan asli per orang, ditambah percobaan tiruan), ukur distribusi skornya,
lalu tetapkan ambang berdasarkan False Accept Rate dan False Reject Rate yang dapat
diterima bisnis. Ambang diubah lewat `PUT /api/settings` tanpa deploy ulang, dan setiap
percobaan menyimpan ambang yang berlaku saat itu (`threshold_at_time`) agar riwayat
lama tetap dapat ditafsirkan.

---

## Deploy

Aplikasi ini butuh Node runtime dan koneksi PostgreSQL yang tahan lama. Cocok untuk
Vercel (dengan Neon/Supabase), Railway, Fly.io, atau kontainer di VPS sendiri.

Untuk Postgres terkelola yang mewajibkan TLS, set `PGSSL=require` selain `DATABASE_URL`.

Sebelum produksi, ganti autentikasi header `X-User` dengan OIDC/JWT dan aktifkan MFA
untuk peran Finance, Management, dan Admin Sistem.

---

## Yang belum diimplementasikan

| Bagian | Status | Alasan |
|---|---|---|
| Pengiriman WhatsApp sungguhan | Tautan dan OTP ditampilkan di layar | Perlu akun WhatsApp Business API lewat BSP resmi dan template yang disetujui Meta (PRD Q11) |
| Autentikasi | Header `X-User` | Prototipe. Ganti dengan OIDC/JWT + MFA sebelum produksi |
| Unggah berkas | Nama berkas dicatat, isinya tidak disimpan | Perlu penyimpanan objek terenkripsi dan kebijakan retensi yang belum ditetapkan Legal (PRD Q14, Q27) |
| PDF paket cetak & QR | Hash, nomor salinan, dan watermark dihasilkan; PDF-nya belum | Tata letak cetak perlu disepakati dulu |
| Batch Overriding | Tabel dan tingkat sudah ada; penyusun batch periodik belum | Menunggu persentase dan penerima tiap tingkat (PRD Q35) |
| Insentif non-tunai | Tersimpan dan tampil di laporan; belum ada alur pengajuan | Menunggu kepastian apakah dicatat manual atau punya form sendiri (PRD Q36, Q37) |
| Enkripsi at-rest, PSrE, Dukcapil, host-to-host bank | Belum | Fase 4 pada roadmap PRD |

Angka tarif pada `scripts/seed.ts` adalah dugaan terbaik dari catatan laporan master
dan Form Klaim Komisi. Keduanya belum sejalan: laporan menulis PPN 10%, form klaim
menyiratkan 11%. Seed memakai 10% untuk kontrak sebelum April 2022 dan 11% sesudahnya.
**Konfirmasi Finance tetap diperlukan sebelum dipakai menghitung pembayaran nyata**
(PRD Q38).
