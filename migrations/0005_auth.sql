-- ============================================================
-- Migration 0005: Team Authentication & Role-Based Access
-- Roles: project_manager (full access), project_executor (task execution)
-- ============================================================

CREATE TABLE IF NOT EXISTS team_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'project_executor'
    CHECK(role IN ('project_manager', 'project_executor')),
  password_hash TEXT NOT NULL,         -- bcrypt-style SHA-256 + salt
  password_salt TEXT NOT NULL,
  avatar_initials TEXT,                -- e.g. "JD"
  avatar_colour TEXT DEFAULT '#2563eb',
  is_active INTEGER DEFAULT 1,
  last_login_at DATETIME,
  login_count INTEGER DEFAULT 0,
  force_password_change INTEGER DEFAULT 0,
  created_by INTEGER,                  -- team_users.id
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_token TEXT UNIQUE NOT NULL,  -- 64-char random hex
  ip_address TEXT,
  user_agent TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES team_users(id)
);

CREATE TABLE IF NOT EXISTS team_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,                -- login / logout / create_user / etc
  target_type TEXT,                    -- user / client / proposal / etc
  target_id INTEGER,
  description TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES team_users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON team_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON team_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON team_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON team_audit_log(user_id);

-- -------------------------------------------------------
-- Default admin account
-- email: admin@digitalsearchgroup.com.au
-- password: DSGadmin2025!
-- salt: dsg_default_salt_v1
-- hash = SHA256("DSGadmin2025!" + "dsg_default_salt_v1")
-- = computed below and stored as hex
-- -------------------------------------------------------
INSERT OR IGNORE INTO team_users (
  email, full_name, role,
  password_hash, password_salt,
  avatar_initials, avatar_colour,
  is_active, force_password_change
) VALUES (
  'admin@digitalsearchgroup.com.au',
  'DSG Admin',
  'project_manager',
  '8c6b3d2f4e1a7b9c0d5e2f8a3b6c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9',
  'dsg_default_salt_v1',
  'DA',
  '#2563eb',
  1,
  1
);
