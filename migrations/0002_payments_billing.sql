-- ============================================================
-- Migration 0002: Payments, Billing Cycles, Expanded Content
-- ============================================================

-- Payments table (Stripe payment records)
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  proposal_id INTEGER,
  campaign_id INTEGER,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'AUD',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','succeeded','failed','refunded','cancelled')),
  payment_type TEXT DEFAULT 'first_payment' CHECK(payment_type IN ('first_payment','recurring','one_off','refund')),
  description TEXT,
  billing_cycle_number INTEGER DEFAULT 1,
  invoice_number TEXT UNIQUE,
  receipt_url TEXT,
  failure_reason TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);

-- Billing schedules (28-day recurring cycles)
CREATE TABLE IF NOT EXISTS billing_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  proposal_id INTEGER,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'AUD',
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','cancelled','completed')),
  billing_interval_days INTEGER DEFAULT 28,
  cycle_number INTEGER DEFAULT 1,
  total_cycles INTEGER,
  next_billing_date DATE NOT NULL,
  last_billed_date DATE,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- Expand clients table with extra fields
ALTER TABLE clients ADD COLUMN abn TEXT;
ALTER TABLE clients ADD COLUMN address TEXT;
ALTER TABLE clients ADD COLUMN city TEXT;
ALTER TABLE clients ADD COLUMN state TEXT;
ALTER TABLE clients ADD COLUMN postcode TEXT;
ALTER TABLE clients ADD COLUMN country TEXT DEFAULT 'Australia';
ALTER TABLE clients ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE clients ADD COLUMN account_manager TEXT;
ALTER TABLE clients ADD COLUMN referral_source TEXT;
ALTER TABLE clients ADD COLUMN contract_start DATE;
ALTER TABLE clients ADD COLUMN contract_end DATE;

-- Expand proposals with payment fields
ALTER TABLE proposals ADD COLUMN setup_fee REAL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN payment_link TEXT;
ALTER TABLE proposals ADD COLUMN stripe_price_id TEXT;
ALTER TABLE proposals ADD COLUMN paid_at DATETIME;
ALTER TABLE proposals ADD COLUMN first_payment_amount REAL;

-- Expand content_items with new types and fields
ALTER TABLE content_items ADD COLUMN content_subtype TEXT;
ALTER TABLE content_items ADD COLUMN platform TEXT;
ALTER TABLE content_items ADD COLUMN word_count_actual INTEGER;
ALTER TABLE content_items ADD COLUMN revision_count INTEGER DEFAULT 0;
ALTER TABLE content_items ADD COLUMN client_approved INTEGER DEFAULT 0;
ALTER TABLE content_items ADD COLUMN seo_score INTEGER;
ALTER TABLE content_items ADD COLUMN meta_title TEXT;
ALTER TABLE content_items ADD COLUMN meta_description TEXT;

-- Proposal line items (detailed deliverables breakdown)
CREATE TABLE IF NOT EXISTS proposal_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price REAL DEFAULT 0,
  included INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_proposal ON payments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_billing_client ON billing_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_billing_campaign ON billing_schedules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_billing_next ON billing_schedules(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_line_items_proposal ON proposal_line_items(proposal_id);
