-- ============================================================
-- Migration 0004: Client Onboarding & Brand Intelligence
-- Covers: brand profile, target audience, content guidelines,
--         service-specific intake, automated reminder tracking
-- ============================================================

-- -------------------------------------------------------
-- Master onboarding record (one per client/campaign)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_onboarding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  campaign_id INTEGER,
  proposal_id INTEGER,

  -- Lifecycle
  status TEXT DEFAULT 'pending' CHECK(status IN (
    'pending','in_progress','submitted','approved','archived'
  )),
  onboarding_token TEXT UNIQUE,          -- shared with client for form access
  submitted_at DATETIME,
  approved_at DATETIME,
  approved_by TEXT,

  -- Reminder tracking
  reminders_sent INTEGER DEFAULT 0,
  last_reminder_sent_at DATETIME,
  next_reminder_at DATETIME,
  reminder_channel TEXT DEFAULT 'email', -- email | sms | both

  -- Internal notes
  internal_notes TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);

-- -------------------------------------------------------
-- Section 1 – Business & Brand Fundamentals
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_brand (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL UNIQUE,

  -- Core identity
  legal_business_name TEXT,
  trading_name TEXT,
  abn TEXT,
  year_founded TEXT,
  business_structure TEXT,              -- sole_trader / partnership / company / trust
  business_description TEXT,           -- elevator pitch (≤200 words)
  long_description TEXT,               -- full about-us style text
  mission_statement TEXT,
  vision_statement TEXT,
  core_values TEXT,                     -- JSON array of strings

  -- Unique value proposition
  uvp TEXT,                             -- primary UVP sentence
  key_differentiators TEXT,             -- JSON array
  awards_and_certifications TEXT,       -- JSON array
  years_in_business INTEGER,
  number_of_staff TEXT,                 -- "1-5" / "6-20" / "21-50" / "50+"

  -- Products & services offered
  primary_service TEXT,
  secondary_services TEXT,              -- JSON array
  service_areas TEXT,                   -- JSON array of suburbs/cities/states
  service_radius_km INTEGER,
  national_service INTEGER DEFAULT 0,
  price_range TEXT,                     -- budget / mid / premium / enterprise

  -- Contact & access details
  primary_phone TEXT,
  after_hours_phone TEXT,
  support_email TEXT,
  sales_email TEXT,
  physical_address TEXT,
  postal_address TEXT,
  google_maps_link TEXT,

  -- Digital presence
  website_url TEXT,
  blog_url TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  linkedin_url TEXT,
  twitter_url TEXT,
  youtube_url TEXT,
  tiktok_url TEXT,
  pinterest_url TEXT,
  google_business_url TEXT,
  other_profiles TEXT,                  -- JSON array {platform, url}

  -- Access credentials (encrypted at app level)
  wordpress_admin_url TEXT,
  wordpress_admin_user TEXT,
  wordpress_admin_password TEXT,        -- stored encrypted
  google_analytics_access TEXT,         -- 'granted' / 'pending' / 'na'
  google_search_console_access TEXT,
  google_ads_access TEXT,
  facebook_ads_access TEXT,
  semrush_access TEXT,
  other_tool_access TEXT,               -- JSON array {tool, status, notes}

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES client_onboarding(id)
);

-- -------------------------------------------------------
-- Section 2 – Target Audience & Market Intelligence
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_audience (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL UNIQUE,

  -- Primary buyer persona
  primary_persona_name TEXT,
  primary_persona_age_range TEXT,
  primary_persona_gender TEXT,
  primary_persona_income TEXT,
  primary_persona_education TEXT,
  primary_persona_occupation TEXT,
  primary_persona_location TEXT,
  primary_persona_pain_points TEXT,     -- JSON array
  primary_persona_goals TEXT,           -- JSON array
  primary_persona_objections TEXT,      -- JSON array
  primary_persona_buying_triggers TEXT, -- JSON array
  primary_persona_preferred_channels TEXT, -- JSON array

  -- Secondary personas (JSON array of persona objects)
  secondary_personas TEXT,

  -- Customer journey
  awareness_channels TEXT,             -- JSON array: how customers find them
  consideration_factors TEXT,          -- JSON array: what matters in decision
  avg_sales_cycle TEXT,                -- "same day" / "1-7 days" / "1-4 weeks" / "1-3 months" / "3+ months"
  avg_transaction_value TEXT,
  customer_lifetime_value TEXT,
  repeat_purchase_rate TEXT,           -- percentage string
  referral_rate TEXT,

  -- Competitor landscape
  main_competitors TEXT,               -- JSON array {name, url, notes}
  competitor_strengths TEXT,
  competitor_weaknesses TEXT,
  our_advantage_over_competitors TEXT,

  -- Geographic targeting
  target_suburbs TEXT,                 -- JSON array
  target_cities TEXT,                  -- JSON array
  target_states TEXT,                  -- JSON array
  target_countries TEXT,               -- JSON array, default ['Australia']
  exclude_locations TEXT,              -- JSON array

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES client_onboarding(id)
);

-- -------------------------------------------------------
-- Section 3 – Brand Voice & Content Guidelines
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_content_guidelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL UNIQUE,

  -- Tone & voice
  brand_tone TEXT,                      -- JSON array e.g. ['professional','friendly','authoritative']
  brand_personality TEXT,               -- JSON array of adjectives
  voice_description TEXT,               -- free-text description of voice
  writing_style TEXT,                   -- formal / semi-formal / conversational / casual

  -- Language preferences
  preferred_language TEXT DEFAULT 'en-AU',
  use_first_person INTEGER DEFAULT 0,   -- "we / our" or third person
  use_industry_jargon INTEGER DEFAULT 1,
  jargon_glossary TEXT,                 -- JSON array {term, definition}
  words_to_always_use TEXT,             -- JSON array
  words_to_never_use TEXT,              -- JSON array
  brand_name_variations TEXT,           -- JSON array: acceptable ways to write brand name
  tagline TEXT,
  slogans TEXT,                         -- JSON array

  -- Content rules
  call_to_action_phrases TEXT,          -- JSON array of preferred CTAs
  avoid_topics TEXT,                    -- JSON array of topics to never write about
  sensitive_topics TEXT,                -- JSON array with handling notes
  disclaimer_required INTEGER DEFAULT 0,
  disclaimer_text TEXT,
  legal_restrictions TEXT,

  -- Visual/Brand identity
  primary_colour TEXT,                  -- hex
  secondary_colour TEXT,                -- hex
  accent_colour TEXT,                   -- hex
  logo_url TEXT,
  font_primary TEXT,
  font_secondary TEXT,
  imagery_style TEXT,                   -- JSON array: e.g. ['real photos','lifestyle','no stock']
  imagery_notes TEXT,

  -- Content preferences by type
  blog_preferred_length TEXT,           -- "800-1200" / "1200-2000" / "2000+" words
  blog_heading_style TEXT,              -- question-based / keyword-rich / benefit-led
  blog_use_author_bio INTEGER DEFAULT 1,
  blog_author_name TEXT,
  blog_author_bio TEXT,
  social_caption_length TEXT,           -- short / medium / long
  social_emoji_usage TEXT,              -- none / minimal / moderate / heavy
  social_hashtag_strategy TEXT,

  -- Existing content assets
  existing_content_urls TEXT,           -- JSON array of reference URLs
  content_to_repurpose TEXT,            -- JSON: existing content that can be reused
  competitor_content_to_beat TEXT,      -- JSON array of competitor URLs to outperform
  sample_content_liked TEXT,            -- JSON array of URLs client likes (external)
  sample_content_disliked TEXT,         -- JSON array of URLs client dislikes

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES client_onboarding(id)
);

-- -------------------------------------------------------
-- Section 4 – SEO & Organic Campaign Intake
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_seo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL UNIQUE,

  -- Current SEO baseline
  current_seo_performed INTEGER DEFAULT 0,
  previous_agency TEXT,
  previous_agency_end_reason TEXT,
  penalty_history INTEGER DEFAULT 0,    -- Google penalty ever?
  penalty_details TEXT,

  -- Target keywords (client's own list)
  client_seed_keywords TEXT,            -- JSON array
  priority_pages TEXT,                  -- JSON array {url, target_keyword, current_rank}
  pages_to_exclude TEXT,                -- JSON array of URLs not to optimise

  -- Technical access
  sitemap_url TEXT,
  robots_txt_url TEXT,
  site_last_redesigned TEXT,
  cms_platform TEXT DEFAULT 'wordpress',
  cms_version TEXT,
  site_speed_priority INTEGER DEFAULT 1,
  mobile_first_priority INTEGER DEFAULT 1,

  -- Local SEO (if applicable)
  is_local_seo INTEGER DEFAULT 0,
  gmb_name TEXT,                        -- exact name on Google Business Profile
  gmb_category TEXT,
  gmb_claimed INTEGER DEFAULT 0,
  service_area_business INTEGER DEFAULT 0, -- SAB vs storefront
  nap_consistency_notes TEXT,           -- any NAP issues client is aware of

  -- Link building preferences
  link_building_approved INTEGER DEFAULT 1,
  link_types_approved TEXT,             -- JSON array: guest_post/niche_edit/citation/pr
  link_niches_to_avoid TEXT,            -- JSON array
  existing_backlinks_exported INTEGER DEFAULT 0, -- has client provided a backlink export?
  disavow_required INTEGER DEFAULT 0,

  -- Reporting preferences
  reporting_frequency TEXT DEFAULT 'monthly', -- weekly / monthly / quarterly
  reporting_metrics TEXT,               -- JSON array of KPIs they care about
  reporting_contact_name TEXT,
  reporting_contact_email TEXT,
  kpi_organic_traffic_target TEXT,
  kpi_keyword_rank_target TEXT,         -- e.g. "top 3 for 5 core keywords in 6 months"
  kpi_lead_volume_target TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES client_onboarding(id)
);

-- -------------------------------------------------------
-- Section 5 – Social Media Intake
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_social (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL UNIQUE,

  -- Platform presence
  platforms_active TEXT,                -- JSON array: facebook/instagram/linkedin/twitter/tiktok/youtube/pinterest
  platforms_to_grow TEXT,               -- JSON array
  platforms_to_avoid TEXT,              -- JSON array

  -- Account details
  facebook_page_url TEXT,
  facebook_page_id TEXT,
  instagram_handle TEXT,
  instagram_account_type TEXT,          -- personal / business / creator
  linkedin_company_url TEXT,
  linkedin_company_id TEXT,
  twitter_handle TEXT,
  tiktok_handle TEXT,
  youtube_channel_url TEXT,
  youtube_channel_id TEXT,
  pinterest_profile TEXT,

  -- Content strategy
  posting_frequency TEXT,               -- JSON: {platform: frequency}
  best_posting_times TEXT,              -- JSON: {platform: [times]}
  content_mix TEXT,                     -- JSON: {educational: 40, promotional: 20, ...}
  campaign_themes TEXT,                 -- JSON array of recurring themes/series
  content_pillars TEXT,                 -- JSON array (4-6 main topics)
  hashtag_sets TEXT,                    -- JSON: {platform: [hashtags]}

  -- Community management
  response_time_target TEXT,            -- "within 1 hour" / "same day" / "24-48 hours"
  escalation_contact TEXT,
  crisis_keywords TEXT,                 -- JSON array of words that need immediate escalation
  auto_reply_approved INTEGER DEFAULT 0,
  negative_comment_handling TEXT,

  -- Assets
  profile_image_url TEXT,
  cover_image_url TEXT,
  branded_templates_available INTEGER DEFAULT 0,
  brand_kit_url TEXT,

  -- Paid social (if applicable)
  paid_social_included INTEGER DEFAULT 0,
  monthly_ad_budget REAL DEFAULT 0,
  facebook_ads_account_id TEXT,
  target_audience_saved INTEGER DEFAULT 0,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES client_onboarding(id)
);

-- -------------------------------------------------------
-- Section 6 – Press Release / PR Intake
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_pr (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL UNIQUE,

  -- Newsworthy angles
  upcoming_announcements TEXT,          -- JSON array of planned news items
  recent_milestones TEXT,               -- JSON array
  spokesperson_name TEXT,
  spokesperson_title TEXT,
  spokesperson_bio TEXT,
  spokesperson_headshot_url TEXT,
  spokesperson_quote_approved INTEGER DEFAULT 0,

  -- Distribution preferences
  distribution_targets TEXT,            -- JSON array: national / state / industry / local
  target_publications TEXT,             -- JSON array of specific outlets
  embargo_policy TEXT,                  -- none / standard_24h / custom
  media_contact_name TEXT,
  media_contact_email TEXT,

  -- Brand story
  founding_story TEXT,
  key_company_milestones TEXT,          -- JSON array
  company_stats TEXT,                   -- JSON array of impressive stats/numbers
  social_proof TEXT,                    -- JSON array of testimonials/case study highlights

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES client_onboarding(id)
);

-- -------------------------------------------------------
-- Section 7 – WordPress / Website Intake
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_website (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL UNIQUE,

  -- Site goals
  website_goal TEXT,                    -- lead_gen / ecommerce / brochure / booking / membership
  primary_conversion_action TEXT,       -- e.g. "Submit enquiry form"
  secondary_conversion_actions TEXT,    -- JSON array
  current_monthly_visitors TEXT,
  current_conversion_rate TEXT,

  -- Design preferences
  design_style TEXT,                    -- modern / classic / minimal / bold / corporate / creative
  design_references TEXT,               -- JSON array of URLs they like
  design_references_disliked TEXT,      -- JSON array of URLs they dislike
  colour_preferences TEXT,              -- free text
  must_have_elements TEXT,              -- JSON array
  must_not_have_elements TEXT,          -- JSON array
  responsive_priority TEXT,             -- mobile / desktop / equal

  -- Technical requirements
  ecommerce_required INTEGER DEFAULT 0,
  ecommerce_platform TEXT,              -- woocommerce / shopify / other
  number_of_products TEXT,
  booking_required INTEGER DEFAULT 0,
  booking_platform TEXT,
  membership_required INTEGER DEFAULT 0,
  live_chat_required INTEGER DEFAULT 0,
  multi_language_required INTEGER DEFAULT 0,
  languages_required TEXT,              -- JSON array

  -- Content provided by client
  logo_files_provided INTEGER DEFAULT 0,
  brand_guidelines_provided INTEGER DEFAULT 0,
  copy_provided INTEGER DEFAULT 0,      -- will client write copy?
  images_provided INTEGER DEFAULT 0,    -- will client provide photos?
  video_provided INTEGER DEFAULT 0,
  existing_content_to_migrate INTEGER DEFAULT 0,
  number_of_pages_to_migrate TEXT,

  -- Integrations
  crm_integration TEXT,                 -- none / hubspot / salesforce / activecamp / other
  email_platform TEXT,                  -- mailchimp / klaviyo / activecampaign / other
  analytics_platform TEXT,              -- ga4 / plausible / other
  tag_manager_used INTEGER DEFAULT 0,
  other_integrations TEXT,              -- JSON array

  -- Hosting & maintenance
  current_host TEXT,
  preferred_host TEXT,
  wants_managed_hosting INTEGER DEFAULT 0,
  maintenance_plan_wanted INTEGER DEFAULT 0,
  maintenance_scope TEXT,               -- JSON array: updates/backups/security/uptime

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES client_onboarding(id)
);

-- -------------------------------------------------------
-- Reminder / Notification log
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('email','sms','both')),
  recipient_email TEXT,
  recipient_phone TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','bounced')),
  message_preview TEXT,
  sent_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES client_onboarding(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- -------------------------------------------------------
-- Indexes
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_onboarding_client ON client_onboarding(client_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_campaign ON client_onboarding(campaign_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_token ON client_onboarding(onboarding_token);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON client_onboarding(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_reminders ON onboarding_reminders(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_next_reminder ON client_onboarding(next_reminder_at);

-- -------------------------------------------------------
-- Add onboarding_status flag to clients table
-- -------------------------------------------------------
ALTER TABLE clients ADD COLUMN onboarding_status TEXT DEFAULT 'not_sent'
  CHECK(onboarding_status IN ('not_sent','sent','in_progress','submitted','approved'));
ALTER TABLE clients ADD COLUMN onboarding_id INTEGER;
