-- ============================================================
-- Migration 0003: WordPress Services, Extended Content Types,
--                 Service Delivery Blocks, Full Client Fields
-- ============================================================

-- WordPress projects table
CREATE TABLE IF NOT EXISTS wordpress_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  campaign_id INTEGER,
  project_name TEXT NOT NULL,
  project_type TEXT DEFAULT 'new_site' CHECK(project_type IN (
    'new_site','redesign','plugin_dev','theme_dev','consultancy',
    'maintenance','performance','security','migration','custom'
  )),
  status TEXT DEFAULT 'scoping' CHECK(status IN (
    'scoping','quoted','approved','in_progress','review',
    'client_review','revisions','completed','on_hold','cancelled'
  )),
  site_url TEXT,
  staging_url TEXT,
  wordpress_version TEXT,
  theme_used TEXT,
  page_builder TEXT,
  hosting_provider TEXT,
  monthly_maintenance REAL DEFAULT 0,
  project_budget REAL DEFAULT 0,
  hourly_rate REAL DEFAULT 150,
  hours_quoted REAL DEFAULT 0,
  hours_used REAL DEFAULT 0,
  go_live_date DATE,
  start_date DATE,
  end_date DATE,
  brief TEXT,
  notes TEXT,
  login_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- WordPress implementation blocks (predefined deliverable blocks)
CREATE TABLE IF NOT EXISTS wordpress_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  block_type TEXT NOT NULL CHECK(block_type IN (
    'homepage','about_page','service_page','contact_page','blog_setup',
    'landing_page','product_page','team_page','testimonials','gallery',
    'faq_section','pricing_table','calculator_tool','lead_form',
    'booking_system','woocommerce_setup','payment_gateway','seo_setup',
    'speed_optimisation','security_hardening','backup_setup','cdn_setup',
    'google_analytics','schema_markup','local_seo_schema','custom'
  )),
  block_name TEXT NOT NULL,
  description TEXT,
  hours_estimated REAL DEFAULT 0,
  hours_actual REAL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN (
    'pending','in_progress','review','approved','completed','cancelled'
  )),
  price REAL DEFAULT 0,
  included_in_quote INTEGER DEFAULT 1,
  notes TEXT,
  completed_at DATETIME,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES wordpress_projects(id)
);

-- Press releases
CREATE TABLE IF NOT EXISTS press_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  campaign_id INTEGER,
  content_item_id INTEGER,
  headline TEXT NOT NULL,
  subheadline TEXT,
  body_text TEXT,
  quote TEXT,
  quote_attribution TEXT,
  boilerplate TEXT,
  contact_info TEXT,
  distribution_list TEXT,
  distribution_date DATE,
  embargo_date DATE,
  target_publications TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN (
    'draft','review','approved','distributed','published','archived'
  )),
  seo_keywords TEXT,
  published_urls TEXT,
  media_coverage TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Social media posts
CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  campaign_id INTEGER,
  content_item_id INTEGER,
  platform TEXT NOT NULL CHECK(platform IN (
    'facebook','instagram','twitter','linkedin','google_business',
    'tiktok','youtube','pinterest','threads','all_platforms'
  )),
  post_type TEXT DEFAULT 'organic' CHECK(post_type IN (
    'organic','story','reel','carousel','video','infographic',
    'poll','event','product','testimonial','blog_share','custom'
  )),
  caption TEXT,
  hashtags TEXT,
  image_url TEXT,
  video_url TEXT,
  link_url TEXT,
  scheduled_at DATETIME,
  published_at DATETIME,
  status TEXT DEFAULT 'draft' CHECK(status IN (
    'draft','scheduled','published','failed','archived'
  )),
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- SEO tools/calculators (custom tool creation)
CREATE TABLE IF NOT EXISTS seo_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  campaign_id INTEGER,
  tool_name TEXT NOT NULL,
  tool_type TEXT DEFAULT 'calculator' CHECK(tool_type IN (
    'calculator','quiz','assessment','comparison','checklist',
    'estimator','generator','analyzer','custom'
  )),
  description TEXT,
  purpose TEXT,
  target_keyword TEXT,
  target_url TEXT,
  status TEXT DEFAULT 'planned' CHECK(status IN (
    'planned','briefed','in_development','review','live','archived'
  )),
  embed_code TEXT,
  published_url TEXT,
  monthly_searches INTEGER,
  leads_generated INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Service delivery checklists (monthly deliverables tracking)
CREATE TABLE IF NOT EXISTS service_checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','sent')),
  completed_by TEXT,
  sent_to_client INTEGER DEFAULT 0,
  sent_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- Service checklist items
CREATE TABLE IF NOT EXISTS service_checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  is_completed INTEGER DEFAULT 0,
  completed_at DATETIME,
  completed_by TEXT,
  evidence_url TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (checklist_id) REFERENCES service_checklists(id)
);

-- Client files/assets
CREATE TABLE IF NOT EXISTS client_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  campaign_id INTEGER,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_url TEXT,
  category TEXT DEFAULT 'general' CHECK(category IN (
    'general','logo','brand_guidelines','contract','report',
    'content','images','credentials','misc'
  )),
  description TEXT,
  uploaded_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Expand proposals to support all service types
ALTER TABLE proposals ADD COLUMN service_line TEXT DEFAULT 'seo';
ALTER TABLE proposals ADD COLUMN content_items_count INTEGER DEFAULT 0;
ALTER TABLE proposals ADD COLUMN press_releases_count INTEGER DEFAULT 0;
ALTER TABLE proposals ADD COLUMN social_posts_count INTEGER DEFAULT 0;
ALTER TABLE proposals ADD COLUMN tools_count INTEGER DEFAULT 0;
ALTER TABLE proposals ADD COLUMN wordpress_hours REAL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN reporting_frequency TEXT DEFAULT 'monthly';
ALTER TABLE proposals ADD COLUMN onboarding_call INTEGER DEFAULT 1;
ALTER TABLE proposals ADD COLUMN account_manager TEXT;

-- Update proposal_type to include all service types
-- Note: SQLite doesn't support modifying CHECK constraints, handled in app logic

-- Expand content_items with ALL new content types (content_type managed in app)
ALTER TABLE content_items ADD COLUMN content_format TEXT;
ALTER TABLE content_items ADD COLUMN target_audience TEXT;
ALTER TABLE content_items ADD COLUMN cta TEXT;
ALTER TABLE content_items ADD COLUMN internal_links TEXT;
ALTER TABLE content_items ADD COLUMN external_links TEXT;
ALTER TABLE content_items ADD COLUMN images_required INTEGER DEFAULT 0;
ALTER TABLE content_items ADD COLUMN approved_by TEXT;
ALTER TABLE content_items ADD COLUMN approved_at DATETIME;
ALTER TABLE content_items ADD COLUMN content_url TEXT;

-- Add extra client fields
ALTER TABLE clients ADD COLUMN linkedin_url TEXT;
ALTER TABLE clients ADD COLUMN facebook_url TEXT;
ALTER TABLE clients ADD COLUMN instagram_handle TEXT;
ALTER TABLE clients ADD COLUMN google_business_id TEXT;
ALTER TABLE clients ADD COLUMN ga4_property_id TEXT;
ALTER TABLE clients ADD COLUMN gsc_property TEXT;
ALTER TABLE clients ADD COLUMN cms_platform TEXT DEFAULT 'wordpress';
ALTER TABLE clients ADD COLUMN hosting_provider TEXT;
ALTER TABLE clients ADD COLUMN secondary_contact_name TEXT;
ALTER TABLE clients ADD COLUMN secondary_contact_email TEXT;
ALTER TABLE clients ADD COLUMN onboarding_completed INTEGER DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wp_projects_client ON wordpress_projects(client_id);
CREATE INDEX IF NOT EXISTS idx_wp_blocks_project ON wordpress_blocks(project_id);
CREATE INDEX IF NOT EXISTS idx_press_releases_client ON press_releases(client_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_client ON social_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_seo_tools_client ON seo_tools(client_id);
CREATE INDEX IF NOT EXISTS idx_checklists_campaign ON service_checklists(campaign_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items ON service_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_client_files ON client_files(client_id);
