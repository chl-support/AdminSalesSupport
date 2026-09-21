-- Skema PostgreSQL — CHL Sales Admin System (BIO District)
--
-- Perbedaan penting dari versi SQLite:
--   * Uang bertipe BIGINT rupiah penuh. Tidak ada NUMERIC dengan pecahan untuk uang,
--     dan sama sekali tidak ada DOUBLE PRECISION. Persentase memakai NUMERIC(12,8)
--     agar 0,0025 tersimpan persis.
--   * Anti-duplikat klaim ditegakkan UNIQUE INDEX parsial pada kombinasi
--     unit + jenis + peran penerima, hanya untuk status aktif (PRD BR-05 setelah
--     koreksi kardinalitas 7.B.2 K1/K2). Ini yang membuat tiga klaim Closing Fee
--     dengan peran berbeda dapat berjalan paralel tanpa saling memblokir.
--   * audit_log dijaga RULE yang menolak UPDATE dan DELETE, bukan trigger, sehingga
--     penolakannya berlaku bahkan untuk pemilik tabel.

BEGIN;

-- ─────────────────────────── Enum ───────────────────────────

DO $$ BEGIN
  CREATE TYPE claim_type AS ENUM
    ('closing_fee','commission','cash_reward','overriding');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recipient_role AS ENUM
    ('agent','sales_inhouse','sales_manager_inhouse','sales_markom','markom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE overriding_level AS ENUM
    ('sales_manager_inhouse','kantor_agent','lead_agent',
     'coordinator_agent_1','coordinator_agent_2');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE claim_status AS ENUM (
    'draft','submitted','pending_admin_review','pending_tax_verification',
    'tax_verified','signature_link_sent','awaiting_signature',
    'signature_review_required','signed','crosscheck_in_progress',
    'ready_to_print','printed','circulating_head_finance',
    'circulating_management','awaiting_scan_upload','approved',
    'awaiting_settlement_date','partially_paid','paid','completed',
    'returned','rejected','clawback','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE unit_status AS ENUM
    ('booked','ppjb_signed','akad','cancelled','moved_to_other_unit','management');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM
    ('admin_sales','finance_tax','finance_payment','finance_manager',
     'head_finance','management','admin_system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tax_type AS ENUM ('vat','pph21','pph23','pph_final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────── Master data ───────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  role          user_role NOT NULL,
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS agencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  address         TEXT,
  npwp            TEXT,
  pkp_status      TEXT NOT NULL DEFAULT 'non_pkp'
                  CHECK (pkp_status IN ('pkp','non_pkp')),
  has_skb         BOOLEAN NOT NULL DEFAULT FALSE,
  skb_valid_until DATE
);

CREATE TABLE IF NOT EXISTS marketings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name                TEXT NOT NULL,
  marketing_type           TEXT NOT NULL CHECK (marketing_type IN ('agent','inhouse')),
  agency_id                UUID REFERENCES agencies(id),
  npwp                     TEXT,
  npwp_type                TEXT NOT NULL DEFAULT 'none'
                           CHECK (npwp_type IN ('personal','company','none')),
  recipient_type           TEXT NOT NULL DEFAULT 'individual'
                           CHECK (recipient_type IN ('individual','company')),
  phone                    TEXT NOT NULL,
  email                    TEXT,
  status                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','pending_review','active','rejected')),
  baseline_specimen_set_id UUID,
  reference_signature_source TEXT,
  reference_signature_png  TEXT,
  consent_version          TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signature_specimens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketing_id UUID NOT NULL REFERENCES marketings(id) ON DELETE CASCADE,
  set_id       UUID NOT NULL,
  sequence     INT NOT NULL,
  image_png    TEXT NOT NULL,
  strokes      JSONB,
  input_method TEXT,
  archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketing_id   UUID NOT NULL REFERENCES marketings(id) ON DELETE CASCADE,
  holder_name    TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name      TEXT NOT NULL,
  branch         TEXT,
  verified       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Atas nama siapa rekening ini: badan usaha atau perorangan.
  --
  -- Inilah yang menentukan jenis PPh. Ditransfer ke PT dipotong PPh 23,
  -- ditransfer ke perorangan dipotong PPh 21 — yang menentukan adalah tujuan
  -- transfernya, bukan status marketing-nya. Seorang agent yang bernaung di
  -- bawah agensi tetapi dibayar ke rekening pribadinya dipotong PPh 21.
  holder_type    TEXT NOT NULL DEFAULT 'individual'
                 CHECK (holder_type IN ('individual','company'))
);

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS holder_type TEXT
  NOT NULL DEFAULT 'individual';

CREATE TABLE IF NOT EXISTS units (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    TEXT NOT NULL,
  project_name            TEXT NOT NULL,
  cluster_code            TEXT NOT NULL,
  buyer_name              TEXT,
  unit_type               TEXT,
  land_area               INT,
  building_area           INT,
  orientation             TEXT,
  payment_scheme          TEXT,
  contract_number         TEXT,
  contract_date           DATE,
  contract_value_incl_vat BIGINT NOT NULL DEFAULT 0
                          CHECK (contract_value_incl_vat >= 0),
  received_amount         BIGINT NOT NULL DEFAULT 0
                          CHECK (received_amount >= 0),
  sign_p3u                BOOLEAN NOT NULL DEFAULT FALSE,
  spu_signed              BOOLEAN NOT NULL DEFAULT FALSE,
  ppjb_signed             BOOLEAN NOT NULL DEFAULT FALSE,
  dp_received             BOOLEAN NOT NULL DEFAULT FALSE,
  status                  unit_status NOT NULL DEFAULT 'booked',
  cancelled_at            DATE,
  remarks                 TEXT,

  -- Rantai marketing yang berhak atas unit ini, mengikuti Laporan Penjualan:
  -- Sales, Sub Koordinator, Koordinator.
  --
  -- Klaim mengambil penerimanya dari sini, bukan dari pilihan bebas saat
  -- pengajuan: yang berhak atas fee sebuah unit ditentukan saat penjualan
  -- terjadi, bukan saat klaimnya diketik. Ketiganya dipisah karena Overriding
  -- justru membayar tingkat di atas Sales — satu kolom saja membuat klaim
  -- Overriding tidak punya penerima.
  --
  -- Semuanya boleh kosong: Koordinator belum terisi pada laporan yang ada, dan
  -- data yang terlanjur masuk sebelum kolom ini ada tidak punya nilainya.
  -- ON DELETE SET NULL, bukan CASCADE: menghapus marketing tidak boleh ikut
  -- menghapus riwayat penjualannya.
  marketing_id            UUID REFERENCES marketings(id) ON DELETE SET NULL,
  sub_coordinator_id      UUID REFERENCES marketings(id) ON DELETE SET NULL,
  coordinator_id          UUID REFERENCES marketings(id) ON DELETE SET NULL
);

-- Untuk basis data yang sudah dibuat sebelum kolom di atas ada. CREATE TABLE
-- IF NOT EXISTS tidak menyentuh tabel yang sudah ada, jadi tanpa baris ini
-- migrasi ulang akan tampak berhasil sementara kolomnya tidak pernah muncul.
ALTER TABLE units ADD COLUMN IF NOT EXISTS marketing_id UUID
  REFERENCES marketings(id) ON DELETE SET NULL;
ALTER TABLE units ADD COLUMN IF NOT EXISTS sub_coordinator_id UUID
  REFERENCES marketings(id) ON DELETE SET NULL;
ALTER TABLE units ADD COLUMN IF NOT EXISTS coordinator_id UUID
  REFERENCES marketings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_units_marketing ON units(marketing_id);

-- Satu baris = satu penjualan, bukan satu unit fisik.
--
-- Kode unit tidak lagi unik: unit yang pembelinya batal dijual lagi kepada orang
-- lain, dan keduanya adalah penjualan tersendiri dengan klaim tersendiri.
-- Nomor kontrak yang membedakannya, jadi di situlah keunikan ditegakkan.
ALTER TABLE units DROP CONSTRAINT IF EXISTS units_code_key;
-- Indeks ini digantikan uniq_units_contract_project lebih jauh di bawah, setelah
-- kolom project_id ada. Dibiarkan di sini supaya pemasangan lama tetap terjaga
-- sepanjang migrasi berjalan, lalu dijatuhkan di tempat penggantinya dibuat.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_units_contract
  ON units (contract_number) WHERE contract_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_units_code ON units(code);

CREATE TABLE IF NOT EXISTS incentive_schemes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_reference   TEXT,
  claim_type       claim_type NOT NULL,
  recipient_role   recipient_role,
  overriding_level overriding_level,
  scheme_type      TEXT NOT NULL DEFAULT 'regular'
                   CHECK (scheme_type IN ('regular','progressive')),
  basis            TEXT NOT NULL
                   CHECK (basis IN ('contract_value_incl_vat','contract_value_excl_vat')),
  percentage       NUMERIC(12,8),
  flat_amount      BIGINT,
  tiers            JSONB,

  -- Nominal tetap yang tertulis "Exclude PPh" adalah nilai BERSIH yang diterima,
  -- bukan bruto. Closing Fee Rp 10.000.000 exclude PPh berarti penerimanya
  -- membawa pulang sepuluh juta, dan brutonya di-gross-up sampai potongan PPh-nya
  -- menutup selisih. Formulir Pengajuan yang ada membuktikannya: bruto
  -- 10.256.410, PPh 256.410, bersih 9.999.999,75.
  --
  -- Tanpa penanda ini, nominal tetap diperlakukan sebagai bruto dan penerimanya
  -- kekurangan sebesar PPh-nya pada setiap klaim.
  flat_amount_is_net BOOLEAN NOT NULL DEFAULT FALSE,

  effective_from   DATE NOT NULL,
  effective_to     DATE,
  CHECK (percentage IS NOT NULL OR flat_amount IS NOT NULL)
);

-- Untuk basis data yang dibuat sebelum kolom ini ada.
ALTER TABLE incentive_schemes ADD COLUMN IF NOT EXISTS flat_amount_is_net
  BOOLEAN NOT NULL DEFAULT FALSE;

-- Matriks tarif pajak (PRD 7.B.4): PKP x jenis penerima x SKB x NPWP x tingkat.
CREATE TABLE IF NOT EXISTS tax_rates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_type         tax_type NOT NULL,
  rate             NUMERIC(12,8) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  pkp_status       TEXT NOT NULL DEFAULT 'any',
  recipient_type   TEXT NOT NULL DEFAULT 'any',
  has_skb          BOOLEAN,
  npwp_type        TEXT NOT NULL DEFAULT 'any',
  overriding_level overriding_level,
  effective_from   DATE NOT NULL,
  effective_to     DATE,
  note             TEXT
);

-- ─────────────────────────── Klaim ───────────────────────────

CREATE TABLE IF NOT EXISTS claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number        TEXT UNIQUE NOT NULL,
  claim_type          claim_type NOT NULL,
  recipient_role      recipient_role NOT NULL,
  unit_id             UUID NOT NULL REFERENCES units(id),
  marketing_id        UUID NOT NULL REFERENCES marketings(id),
  bank_account_id     UUID REFERENCES bank_accounts(id),
  status              claim_status NOT NULL DEFAULT 'draft',
  overriding_batch_id UUID,

  gross_amount        BIGINT NOT NULL DEFAULT 0,
  vat                 BIGINT NOT NULL DEFAULT 0,
  withholding_tax     BIGINT NOT NULL DEFAULT 0,
  withholding_tax_type TEXT,
  net_amount          BIGINT NOT NULL DEFAULT 0,
  amount_in_words     TEXT,
  total_payment       BIGINT NOT NULL DEFAULT 0,
  payment_percent     NUMERIC(12,8),
  snapshot            JSONB,

  tax_verified_by     TEXT,
  tax_verified_at     TIMESTAMPTZ,
  tax_verification_valid_until TIMESTAMPTZ,
  tax_corrected       BOOLEAN NOT NULL DEFAULT FALSE,
  tax_correction_reason TEXT,
  original_amounts    JSONB,

  document_hash       TEXT,
  sealed              BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at           TIMESTAMPTZ,
  signature_score     INT,

  crosscheck_admin    TEXT NOT NULL DEFAULT 'pending',
  crosscheck_finance  TEXT NOT NULL DEFAULT 'pending',
  return_count        INT NOT NULL DEFAULT 0,

  print_copy_number   INT NOT NULL DEFAULT 0,
  physical_location   TEXT,
  physical_since      TIMESTAMPTZ,

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Nilai bersih harus selalu konsisten dengan komponennya. Basis data menolak
  -- kombinasi yang tidak mungkin, bukan hanya mengandalkan lapisan aplikasi.
  CONSTRAINT net_amount_consistent
    CHECK (net_amount = gross_amount + vat - withholding_tax)
);

-- BR-05: satu klaim aktif per kombinasi unit + jenis + peran penerima.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_claim
  ON claims (unit_id, claim_type, recipient_role)
  WHERE status NOT IN ('rejected','cancelled','clawback');

CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_unit ON claims(unit_id);

CREATE TABLE IF NOT EXISTS claim_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id       UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  checklist_item TEXT NOT NULL,
  file_name      TEXT,
  status         TEXT NOT NULL DEFAULT 'uploaded',
  note           TEXT,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Isi berkas ikut disimpan, bukan hanya namanya.
--
-- Sebelumnya hanya file_name yang dicatat, sehingga Kwitansi dan Invoice yang
-- diunggah agent tidak pernah benar-benar ada di mana pun: Finance membuka
-- klaim dan menemukan daftar nama berkas tanpa berkasnya. Ukuran dibatasi di
-- lapisan aplikasi (3 MB) karena badan permintaan di Vercel sendiri terbatas;
-- batas itu diulang di sini sebagai CHECK supaya jalur lain tidak melewatinya.
ALTER TABLE claim_documents ADD COLUMN IF NOT EXISTS content BYTEA;
ALTER TABLE claim_documents ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE claim_documents ADD COLUMN IF NOT EXISTS size_bytes INT;
ALTER TABLE claim_documents ADD COLUMN IF NOT EXISTS uploaded_by TEXT;
ALTER TABLE claim_documents ADD COLUMN IF NOT EXISTS source TEXT
  NOT NULL DEFAULT 'console';
ALTER TABLE claim_documents DROP CONSTRAINT IF EXISTS claim_documents_size_ck;
ALTER TABLE claim_documents ADD CONSTRAINT claim_documents_size_ck
  CHECK (size_bytes IS NULL OR size_bytes <= 3145728);

CREATE INDEX IF NOT EXISTS idx_claim_documents_claim
  ON claim_documents(claim_id);

CREATE TABLE IF NOT EXISTS signing_sessions (
  token        TEXT PRIMARY KEY,
  claim_id     UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  marketing_id UUID NOT NULL REFERENCES marketings(id),
  otp_code     TEXT,
  otp_attempts INT NOT NULL DEFAULT 0,
  otp_verified BOOLEAN NOT NULL DEFAULT FALSE,
  attempts     INT NOT NULL DEFAULT 0,
  state        TEXT NOT NULL DEFAULT 'sent'
               CHECK (state IN ('sent','opened','verified','disputed','expired','locked')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

-- Pendaftaran spesimen tanda tangan (onboarding).
--
-- Tanpa spesimen, pencocokan tanda tangan tidak punya pembanding: skor selalu 0
-- dan setiap klaim agent jatuh ke pemeriksaan manual. Tabel ini yang menampung
-- sesi pengambilannya — satu tautan sekali pakai per marketing, dengan OTP dan
-- masa berlaku seperti tautan tanda tangan, karena yang didaftarkan di sini
-- justru yang akan dipakai membuktikan identitas orang itu berikutnya.
--
-- Persetujuan disimpan bersama sesinya, bukan disimpulkan dari adanya spesimen:
-- data tanda tangan adalah data pribadi, dan "dia toh menandatangani" bukan
-- catatan persetujuan.
CREATE TABLE IF NOT EXISTS enrollment_sessions (
  token           TEXT PRIMARY KEY,
  marketing_id    UUID NOT NULL REFERENCES marketings(id) ON DELETE CASCADE,
  set_id          UUID NOT NULL,
  otp_code        TEXT,
  otp_attempts    INT NOT NULL DEFAULT 0,
  otp_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at      TIMESTAMPTZ,
  consent_version TEXT,
  captured        INT NOT NULL DEFAULT 0,
  target          INT NOT NULL DEFAULT 10,
  consistency     INT,
  state           TEXT NOT NULL DEFAULT 'sent'
                  CHECK (state IN ('sent','opened','capturing','submitted',
                                   'approved','rejected','expired','locked')),
  issued_by       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enrollment_marketing
  ON enrollment_sessions(marketing_id);

-- KTP sebagai jangkar identitas pendaftaran.
--
-- Foto KTP utuh hanya dipegang selama sesi berjalan: ia diperlukan Admin untuk
-- memastikan tanda tangan yang dipotong memang berasal dari KTP orang itu, dan
-- setelah putusan diambil ia dihapus. Yang disimpan seterusnya cuma potongan
-- tanda tangannya (pada marketings.reference_signature_png) — bukan NIK, bukan
-- alamat, bukan foto wajah.
--
-- Menyimpan pindaian KTP selamanya di basis data yang belum terenkripsi
-- at-rest berarti menumpuk data pribadi yang tidak dibutuhkan lagi setelah
-- pemeriksaannya selesai (UU PDP 27/2022: secukupnya, selama diperlukan saja).
ALTER TABLE enrollment_sessions ADD COLUMN IF NOT EXISTS ktp_image BYTEA;
ALTER TABLE enrollment_sessions ADD COLUMN IF NOT EXISTS ktp_content_type TEXT;
ALTER TABLE enrollment_sessions ADD COLUMN IF NOT EXISTS ktp_signature_png TEXT;
ALTER TABLE enrollment_sessions ADD COLUMN IF NOT EXISTS ktp_at TIMESTAMPTZ;

-- Pendaftaran ulang dilakukan sekali per orang, kecuali Admin memintanya lagi.
-- Alasannya disimpan bersama sesinya: "kenapa orang ini merekam dua kali"
-- adalah pertanyaan pertama yang muncul saat jejaknya diperiksa.
ALTER TABLE enrollment_sessions ADD COLUMN IF NOT EXISTS revision_reason TEXT;

-- Kapan jangkar identitasnya ditetapkan. Tanpa ini, "sudah punya KTP" hanya
-- dapat disimpulkan dari ada-tidaknya gambar, dan tidak ada yang tahu sejak
-- kapan.
ALTER TABLE marketings ADD COLUMN IF NOT EXISTS reference_signature_at TIMESTAMPTZ;

-- Jumlah spesimen per orang turun dari sepuluh ke lima. Angka yang sudah
-- tersimpan di settings diperbarui di bawah, setelah tabelnya dibuat.
ALTER TABLE enrollment_sessions ALTER COLUMN target SET DEFAULT 5;


CREATE TABLE IF NOT EXISTS signature_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id          UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  attempt_number    INT NOT NULL,
  score             INT,
  threshold_at_time INT,
  outcome           TEXT,
  image_png         TEXT,
  input_method      TEXT,
  ip_address        TEXT,
  user_agent        TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_packages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id      UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  copy_number   INT NOT NULL,
  document_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','superseded')),
  printed_by    TEXT,
  printed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (claim_id, copy_number)
);

CREATE TABLE IF NOT EXISTS handoffs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id    UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by TEXT,
  note        TEXT
);

-- ─────────────────────────── Overriding ───────────────────────────

CREATE TABLE IF NOT EXISTS overriding_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT UNIQUE NOT NULL,
  level        overriding_level NOT NULL,
  recipient_id UUID REFERENCES marketings(id),
  cluster_code TEXT,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  cut_off_at   TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS overriding_rows (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id             UUID NOT NULL REFERENCES overriding_batches(id) ON DELETE CASCADE,
  unit_id              UUID NOT NULL REFERENCES units(id),
  section              TEXT NOT NULL DEFAULT 'current'
                       CHECK (section IN ('current','already_paid','cancelled')),
  percentage           NUMERIC(12,8),
  amount               BIGINT NOT NULL DEFAULT 0,
  vat                  BIGINT NOT NULL DEFAULT 0,
  withholding_tax      BIGINT NOT NULL DEFAULT 0,
  withholding_tax_type TEXT,
  net_amount           BIGINT NOT NULL DEFAULT 0,
  stage                TEXT,
  counted_in_total     BOOLEAN NOT NULL DEFAULT TRUE,
  process_date         DATE,
  transfer_date        DATE,
  remarks              TEXT
);

-- ─────────────────────────── Pembayaran ───────────────────────────

CREATE TABLE IF NOT EXISTS payment_instructions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id       UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  recipient_name TEXT,
  bank_name      TEXT,
  account_number TEXT,
  amount         BIGINT NOT NULL CHECK (amount > 0),
  paid_amount    BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','exported','partially_paid','paid')),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_overpayment CHECK (paid_amount <= amount)
);

CREATE TABLE IF NOT EXISTS settlements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- transfer_date: tanggal uang keluar menurut bukti bank. Dasar seluruh rekap.
  transfer_date          DATE NOT NULL,
  -- recorded_at: kapan Finance mencatatnya. Tidak pernah dipakai untuk rekap.
  recorded_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by            TEXT,
  recap_period           TEXT NOT NULL,
  redirected_from_period TEXT,
  reference_number       TEXT,
  proof_file             TEXT NOT NULL,
  backdate_reason        TEXT,
  revised                BOOLEAN NOT NULL DEFAULT FALSE,
  previous_transfer_date DATE,
  -- BR-29: pembayaran yang belum terjadi tidak boleh masuk rekap.
  CONSTRAINT no_future_transfer CHECK (transfer_date <= CURRENT_DATE)
);

CREATE TABLE IF NOT EXISTS settlement_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id  UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  instruction_id UUID NOT NULL REFERENCES payment_instructions(id),
  amount         BIGINT NOT NULL CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS accounting_periods (
  period        TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','closed','reopened')),
  closed_by     TEXT,
  closed_at     TIMESTAMPTZ,
  reopened_by   TEXT,
  reopen_reason TEXT
);

-- Kolom laporan yang belum punya form sumber (PRD 7.B.3).
CREATE TABLE IF NOT EXISTS non_cash_incentives (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id          UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL
                   CHECK (kind IN ('bonus_penjualan','trip','voucher','hadiah')),
  label            TEXT,
  beneficiary      TEXT CHECK (beneficiary IN ('konsumen','agent','sales_inhouse')),
  value            BIGINT,
  realization_date DATE,
  recorded_by      TEXT,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────── Audit ───────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  action      TEXT NOT NULL,
  actor       TEXT,
  before      JSONB,
  after       JSONB,
  reason      TEXT,
  ip_address  TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

-- Append-only. RULE berlaku bahkan bagi pemilik tabel, tidak seperti trigger biasa
-- yang dapat dilewati dengan ALTER TABLE ... DISABLE TRIGGER.
CREATE OR REPLACE RULE audit_log_no_update AS
  ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_log_no_delete AS
  ON DELETE TO audit_log DO INSTEAD NOTHING;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           TEXT PRIMARY KEY,
  endpoint      TEXT NOT NULL,
  response      JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Jumlah spesimen per orang turun dari sepuluh ke lima.
--
-- Nilai bawaan hanya dipasang saat baris settings belum ada, jadi pemasangan
-- yang sudah berjalan tetap memegang angka lama. Barisnya diperbarui di sini,
-- tetapi hanya bila nilainya masih persis bawaan lama — angka yang sengaja
-- disetel sendiri tidak ikut ditimpa tiap kali migrasi dijalankan.
--
-- Letaknya di bawah CREATE TABLE settings, bukan di antara ALTER TABLE lain di
-- atas: berkas ini dijalankan sebagai satu perintah, jadi UPDATE yang berdiri
-- sebelum tabelnya dibuat menggagalkan seluruh migrasi pada basis data yang
-- masih kosong — pemasangan baru tidak pernah bisa selesai. Pada basis data
-- kosong ia tidak mengenai baris apa pun, dan nilai bawaannya dipasang
-- setelah ini oleh ensureDefaultSettings().
UPDATE settings SET value = '5'
 WHERE key = 'onboarding_specimen_count' AND value = '10';

-- Sesi login.
--
-- Yang disimpan adalah hash token, bukan tokennya. Basis data yang bocor dengan
-- demikian tidak menyerahkan sesi yang masih hidup kepada pembacanya — token asli
-- hanya pernah ada di cookie peramban pemiliknya.
--
-- ON DELETE CASCADE: menonaktifkan pengguna dengan menghapusnya ikut memutus
-- seluruh sesinya, bukan meninggalkan sesi yatim yang masih dapat dipakai.
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  TEXT UNIQUE NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- Percobaan masuk, dipakai untuk menahan tebakan sandi beruntun.
--
-- Percobaan yang berhasil pun dicatat: tanpa itu, "kapan akun ini terakhir
-- dipakai" tidak terjawab, dan itu pertanyaan pertama saat ada sengketa.
CREATE TABLE IF NOT EXISTS login_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT NOT NULL,
  ip_address  TEXT,
  succeeded   BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup
  ON login_attempts(username, attempted_at DESC);

-- ─────────────────────────── Project ───────────────────────────
--
-- Satu pemasangan melayani beberapa project sekaligus. Datanya dipisah per baris,
-- bukan per basis data: penjualan, marketing, klaim, dan skema insentif
-- masing-masing menyandang project_id, dan seluruh layar menyaring ke project
-- yang sedang dipilih.
--
-- Nama PT berbeda per project dan ikut tercetak pada formulir pengajuan, jadi
-- ia disimpan di sini — bukan ditulis tetap di dalam kode, tempat mengubahnya
-- menuntut penempatan ulang.
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  company_name TEXT NOT NULL,
  urutan       INT NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hanya satu baris yang ditanam dari sini: BIO District, yang dituju oleh
-- pengisian mundur beberapa baris di bawah. Daftar project selengkapnya ada di
-- src/lib/projects.ts dan diterapkan oleh ensureProjects(). Bukan di sini,
-- karena baris yang ditanam lewat migrasi hanya sampai ke basis data ketika
-- migrasi dijalankan ulang — dan project yang ditambahkan lalu di-deploy
-- ternyata tidak pernah muncul di layar.
INSERT INTO projects (slug, name, company_name, urutan) VALUES
  ('bio-district', 'BIO District', 'PT. Serpong Bangun Lestari', 5)
ON CONFLICT (slug) DO NOTHING;

-- Penanda project pada data yang memang milik satu project.
--
-- agencies dan tax_rates sengaja tidak diberi penanda: agensi yang sama bekerja
-- pada beberapa project, dan tarif pajak berlaku menurut undang-undang, bukan
-- menurut project.
ALTER TABLE units ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
ALTER TABLE marketings ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
ALTER TABLE incentive_schemes ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- Data yang sudah ada berasal dari BIO District: itulah satu-satunya project
-- yang berjalan sebelum pemisahan ini. Dibiarkan kosong, seluruhnya akan hilang
-- dari layar begitu penyaringan menyala.
UPDATE units SET project_id = (SELECT id FROM projects WHERE slug='bio-district')
 WHERE project_id IS NULL;
UPDATE marketings SET project_id = (SELECT id FROM projects WHERE slug='bio-district')
 WHERE project_id IS NULL;
UPDATE claims SET project_id = (SELECT id FROM projects WHERE slug='bio-district')
 WHERE project_id IS NULL;
UPDATE incentive_schemes SET project_id = (SELECT id FROM projects WHERE slug='bio-district')
 WHERE project_id IS NULL;

-- Nomor kontrak unik per project, bukan di seluruh basis data.
--
-- Sebelum pemisahan project, keunikan menyeluruh benar: hanya ada satu project.
-- Setelah pemisahan ia salah. Setiap project menomori kontraknya sendiri, jadi
-- nomor yang sama wajar muncul di dua project — dan indeks lama menolaknya.
-- Akibatnya unggahan Laporan Penjualan project kedua gagal dengan pelanggaran
-- uniq_units_contract, padahal pencarian unitnya sudah dibatasi per project;
-- baris yang tidak ditemukan karena milik project lain justru berakhir sebagai
-- INSERT yang bertabrakan.
DROP INDEX IF EXISTS uniq_units_contract;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_units_contract_project
  ON units (project_id, contract_number) WHERE contract_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id);
CREATE INDEX IF NOT EXISTS idx_marketings_project ON marketings(project_id);
CREATE INDEX IF NOT EXISTS idx_claims_project ON claims(project_id);
CREATE INDEX IF NOT EXISTS idx_schemes_project ON incentive_schemes(project_id);

-- Project yang sedang dikerjakan, menempel pada sesinya.
--
-- Di sesi, bukan di peramban: penyaringan dilakukan server, dan pilihan yang
-- hanya hidup di peramban berarti server tetap harus mempercayai apa yang
-- dikirimkan layar.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- ─────────────────────────── Memo ───────────────────────────
--
-- Berkas memo skema dan persetujuannya, disimpan sebagai lampiran yang dapat
-- dilihat siapa pun yang mengerjakan project itu.
--
-- Isinya tidak dibaca sistem: tarif yang dipakai menghitung tetap berasal dari
-- tabel incentive_schemes. Memo di sini adalah rujukan bagi manusia — dasar
-- tertulis yang dapat dibuka saat ada yang mempertanyakan sebuah angka, tanpa
-- mencari-cari di percakapan atau surel.
--
-- Berkasnya disimpan di basis data, bukan di penyimpanan berkas terpisah:
-- pemasangan ini tidak punya satu pun, dan memo yang tertinggal di komputer
-- seseorang bukan lampiran.
CREATE TABLE IF NOT EXISTS memos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id),
  nomor        TEXT,
  judul        TEXT NOT NULL,
  keterangan   TEXT,
  berlaku_dari DATE,
  berlaku_sampai DATE,
  file_name    TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  content      BYTEA NOT NULL,
  uploaded_by  TEXT NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memos_project
  ON memos(project_id, uploaded_at DESC);

-- Kolom rekapitulasi memo.
--
-- Sebelumnya satu memo hanya dicatat judul, nomor, dan masa berlakunya —
-- cukup untuk menemukan berkasnya, tidak cukup untuk dibaca sebagai
-- rekapitulasi. Yang ditanyakan orang ketika membuka daftar ini bukan "mana
-- berkasnya" melainkan "siapa mengajukan apa kepada siapa, dengan nilai
-- berapa, dan siapa yang menyetujui".
--
-- Semuanya boleh kosong. Memo yang sudah terlanjur diunggah sebelum kolom ini
-- ada tetap sah; yang kosong tampil sebagai tanda pisah, bukan sebagai galat.
ALTER TABLE memos ADD COLUMN IF NOT EXISTS tanggal_memo   DATE;
ALTER TABLE memos ADD COLUMN IF NOT EXISTS dari           TEXT;
ALTER TABLE memos ADD COLUMN IF NOT EXISTS kepada         TEXT;
ALTER TABLE memos ADD COLUMN IF NOT EXISTS nilai_skema    TEXT;
ALTER TABLE memos ADD COLUMN IF NOT EXISTS dokumen_wajib  TEXT;
ALTER TABLE memos ADD COLUMN IF NOT EXISTS diajukan_oleh  TEXT;
ALTER TABLE memos ADD COLUMN IF NOT EXISTS diketahui_oleh TEXT;
ALTER TABLE memos ADD COLUMN IF NOT EXISTS disetujui_oleh TEXT;

COMMIT;
