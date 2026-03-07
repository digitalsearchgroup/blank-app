-- ============================================================
-- Digital Search Group - Campaign Management System
-- Initial Schema
-- ============================================================

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT UNIQUE NOT NULL,
  contact_phone TEXT,
  website TEXT NOT NULL,
  industry TEXT,
  location TEXT,
  timezone TEXT DEFAULT 'UTC',
  status TEXT DEFAULT 'prospect' CHECK(status IN ('prospect','active','paused','churned')),
  monthly_budget REAL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Proposals table
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','approved','rejected','expired')),
  proposal_type TEXT DEFAULT 'organic_seo' CHECK(proposal_type IN ('organic_seo','local_seo','content','technical_seo','full_service')),
  monthly_investment REAL NOT NULL,
  contract_length INTEGER DEFAULT 6,
  scope_summary TEXT,
  deliverables TEXT,
  target_keywords TEXT,
  competitor_domains TEXT,
  target_locations TEXT,
  goals TEXT,
  baseline_data TEXT,
  sent_at DATETIME,
  approved_at DATETIME,
  expires_at DATETIME,
  approval_token TEXT UNIQUE,
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  proposal_id INTEGER,
  name TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'organic_seo',
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
  start_date DATE NOT NULL,
  end_date DATE,
  monthly_investment REAL DEFAULT 0,
  target_locations TEXT,
  target_languages TEXT DEFAULT 'en',
  goals TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);

-- Keywords table
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  target_url TEXT,
  location_code INTEGER DEFAULT 2840,
  language_code TEXT DEFAULT 'en',
  search_engine TEXT DEFAULT 'google',
  keyword_group TEXT,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  monthly_search_volume INTEGER,
  keyword_difficulty INTEGER,
  cpc REAL,
  is_tracking INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Rank tracking history
CREATE TABLE IF NOT EXISTS rank_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  rank_position INTEGER,
  previous_position INTEGER,
  url_ranked TEXT,
  serp_features TEXT,
  search_volume INTEGER,
  tracked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (keyword_id) REFERENCES keywords(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- LLM Prompt tracking
CREATE TABLE IF NOT EXISTS llm_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_category TEXT DEFAULT 'brand_mention',
  target_brand TEXT,
  llm_model TEXT DEFAULT 'chatgpt',
  location_code INTEGER DEFAULT 2840,
  language_code TEXT DEFAULT 'en',
  is_tracking INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- LLM mention history
CREATE TABLE IF NOT EXISTS llm_mention_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  is_mentioned INTEGER DEFAULT 0,
  mention_rank INTEGER,
  mention_context TEXT,
  sentiment TEXT CHECK(sentiment IN ('positive','neutral','negative','not_mentioned')),
  response_snippet TEXT,
  full_response TEXT,
  tracked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (prompt_id) REFERENCES llm_prompts(id)
);

-- Content calendar/tasks
CREATE TABLE IF NOT EXISTS content_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT DEFAULT 'blog_post' CHECK(content_type IN ('blog_post','landing_page','meta_optimization','guestpost','press_release','social_post','infographic','video_script','faq_page')),
  status TEXT DEFAULT 'planned' CHECK(status IN ('planned','briefed','in_progress','review','approved','published','cancelled')),
  target_keyword TEXT,
  target_url TEXT,
  word_count_target INTEGER,
  brief TEXT,
  content_body TEXT,
  published_url TEXT,
  due_date DATE,
  published_at DATETIME,
  assigned_to TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Monthly reports
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  report_period TEXT NOT NULL,
  report_type TEXT DEFAULT 'monthly' CHECK(report_type IN ('weekly','monthly','quarterly')),
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','generated','sent','viewed')),
  summary TEXT,
  keywords_improved INTEGER DEFAULT 0,
  keywords_declined INTEGER DEFAULT 0,
  keywords_new INTEGER DEFAULT 0,
  avg_position REAL,
  top10_keywords INTEGER DEFAULT 0,
  top3_keywords INTEGER DEFAULT 0,
  llm_mentions INTEGER DEFAULT 0,
  content_published INTEGER DEFAULT 0,
  backlinks_acquired INTEGER DEFAULT 0,
  organic_traffic_estimate INTEGER,
  report_data TEXT,
  sent_at DATETIME,
  viewed_at DATETIME,
  report_token TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  campaign_id INTEGER,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Competitor tracking
CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  label TEXT,
  is_primary INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_proposals_client ON proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_keywords_campaign ON keywords(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rank_history_keyword ON rank_history(keyword_id);
CREATE INDEX IF NOT EXISTS idx_rank_history_tracked ON rank_history(tracked_at);
CREATE INDEX IF NOT EXISTS idx_llm_prompts_campaign ON llm_prompts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_llm_mentions_prompt ON llm_mention_history(prompt_id);
CREATE INDEX IF NOT EXISTS idx_content_campaign ON content_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_reports_campaign ON reports(campaign_id);
CREATE INDEX IF NOT EXISTS idx_activity_client ON activity_log(client_id);
