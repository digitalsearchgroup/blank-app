-- ============================================================
-- Migration 0008: Client & Campaign Archive System
-- Adds soft-archive capability: data is preserved but hidden
-- from active views. Can be restored at any time.
-- ============================================================

-- ── clients: add archive columns ───────────────────────────
ALTER TABLE clients ADD COLUMN is_archived INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN archived_at DATETIME;
ALTER TABLE clients ADD COLUMN archived_reason TEXT;     -- 'paused','churned','other' + custom note
ALTER TABLE clients ADD COLUMN archived_by TEXT;         -- team member name/email
ALTER TABLE clients ADD COLUMN archive_note TEXT;        -- free-text reason from the user

-- ── campaigns: add archive columns ─────────────────────────
ALTER TABLE campaigns ADD COLUMN is_archived INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN archived_at DATETIME;
ALTER TABLE campaigns ADD COLUMN archived_reason TEXT;
ALTER TABLE campaigns ADD COLUMN archived_by TEXT;

-- ── client_archive_log: audit trail ────────────────────────
CREATE TABLE IF NOT EXISTS client_archive_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK(action IN ('archived','restored')),
  reason      TEXT,         -- paused / churned / other
  note        TEXT,         -- free-text from user
  performed_by TEXT,        -- team member
  campaigns_affected INTEGER DEFAULT 0,
  plans_affected     INTEGER DEFAULT 0,
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_archived   ON clients(is_archived);
CREATE INDEX IF NOT EXISTS idx_campaigns_archived ON campaigns(is_archived);
CREATE INDEX IF NOT EXISTS idx_archive_log_client ON client_archive_log(client_id);
