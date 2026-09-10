-- Skema PostgreSQL — Sistem Klaim Insentif Marketing (BIO District)
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
  verified       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS units (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    TEXT UNIQUE NOT NULL,
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
  remarks                 TEXT
);

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
  effective_from   DATE NOT NULL,
  effective_to     DATE,
  CHECK (percentage IS NOT NULL OR flat_amount IS NOT NULL)
);

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

COMMIT;
