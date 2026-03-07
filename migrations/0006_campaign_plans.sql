-- ============================================================
-- Migration 0006: Campaign Plan Templates & Execution Engine
-- 4 tiers × 12 months × deliverables + task tracking
-- Internal terms mapped to premium client-facing language
-- ============================================================

-- -------------------------------------------------------
-- Tier definitions (the 4 packages)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier_key TEXT UNIQUE NOT NULL,        -- basic | core | ultimate | xtreme
  client_name TEXT NOT NULL,            -- AI Authority Foundation etc.
  internal_name TEXT NOT NULL,          -- Basic | Core | Ultimate | Xtreme
  tagline TEXT,
  monthly_price REAL NOT NULL,
  signal_level INTEGER NOT NULL,        -- 1-4
  description TEXT,
  phase1_outcome TEXT,
  phase2_outcome TEXT,
  phase3_outcome TEXT,
  phase4_outcome TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------
-- Deliverable master catalogue
-- Maps internal term → client-facing term + category
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS deliverable_catalogue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  internal_name TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,            -- premium public facing label
  category TEXT NOT NULL CHECK(category IN (
    'foundation','technical','on_page','content','authority_placement',
    'media_authority','entity_reinforcement','amplification','signal_acceleration',
    'social','reporting','review','ai_visibility'
  )),
  description TEXT,                     -- internal description for executors
  client_description TEXT,              -- shown in client reports
  task_type TEXT DEFAULT 'standard'
    CHECK(task_type IN ('standard','recurring','milestone','review')),
  estimated_hours REAL DEFAULT 1.0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------
-- Monthly deliverables per tier (the 12-month schedule)
-- qty = how many units of this deliverable this month
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS tier_monthly_deliverables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier_id INTEGER NOT NULL,
  month_number INTEGER NOT NULL CHECK(month_number BETWEEN 1 AND 12),
  deliverable_id INTEGER NOT NULL,
  qty INTEGER DEFAULT 1,
  notes TEXT,
  FOREIGN KEY (tier_id) REFERENCES plan_tiers(id),
  FOREIGN KEY (deliverable_id) REFERENCES deliverable_catalogue(id)
);

-- -------------------------------------------------------
-- Campaign execution plan (one per campaign)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL UNIQUE,
  client_id INTEGER NOT NULL,
  tier_id INTEGER NOT NULL,
  start_date DATE NOT NULL,
  current_month INTEGER DEFAULT 1,
  total_months INTEGER DEFAULT 12,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (tier_id) REFERENCES plan_tiers(id)
);

-- -------------------------------------------------------
-- Individual task instances generated from the plan
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  deliverable_id INTEGER NOT NULL,
  month_number INTEGER NOT NULL,
  qty INTEGER DEFAULT 1,
  title TEXT NOT NULL,                  -- auto-generated from deliverable
  internal_notes TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN (
    'pending','in_progress','review','completed','blocked','skipped'
  )),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  assigned_to TEXT,                     -- team member name/email
  due_date DATE,
  completed_at DATETIME,
  completed_by TEXT,
  client_visible INTEGER DEFAULT 0,     -- show in client report?
  client_label TEXT,                    -- override label for reports
  url_reference TEXT,                   -- relevant URL for on-page tasks
  deliverable_url TEXT,                 -- output URL (guest post, etc.)
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES campaign_plans(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (deliverable_id) REFERENCES deliverable_catalogue(id)
);

-- -------------------------------------------------------
-- Indexes
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tasks_campaign ON campaign_tasks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tasks_plan ON campaign_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON campaign_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_month ON campaign_tasks(month_number);
CREATE INDEX IF NOT EXISTS idx_tier_monthly ON tier_monthly_deliverables(tier_id, month_number);
CREATE INDEX IF NOT EXISTS idx_plan_campaign ON campaign_plans(campaign_id);

-- ================================================================
-- SEED: Deliverable Catalogue
-- ================================================================
INSERT OR IGNORE INTO deliverable_catalogue (internal_name, client_name, category, description, client_description, task_type, estimated_hours, sort_order) VALUES
-- Foundation
('Onboarding Call','Authority Discovery Session','foundation','Initial onboarding call with client','Strategic discovery session to map authority goals and baseline','milestone',1.5,10),
('Google Search Console Access','Search Authority Access Setup','foundation','Request and confirm GSC access','Technical foundation access for authority tracking','milestone',0.5,11),
('Google Analytics Access','Analytics Authority Access Setup','foundation','Request and confirm GA4 access','Performance tracking infrastructure setup','milestone',0.5,12),
('Website Access','Platform Access Configuration','foundation','WordPress/CMS admin access','Technical platform access for implementation','milestone',0.5,13),
('Google Data Studio Report','Authority Intelligence Dashboard','foundation','Set up Data Studio / Looker Studio report','Live authority intelligence dashboard configuration','milestone',2.0,14),
('Keyword Research / URL Mapping','Keyword Architecture & Intent Mapping','foundation','Full keyword research and URL mapping','Strategic intent mapping and topical architecture design','milestone',4.0,15),
('Rank Tracking Setup','Authority Monitoring Configuration','foundation','Set up rank tracking for all target keywords','Real-time authority position monitoring setup','milestone',1.0,16),
('Link Plan / Anchor Mapping','Authority Anchor Architecture','foundation','Build link plan and anchor text strategy','Strategic anchor distribution framework design','milestone',2.0,17),
('Competitor Analysis','Competitive Authority Intelligence','foundation','Full competitor SEO analysis','Competitive authority gap analysis and modelling','milestone',3.0,18),
-- Technical
('Technical Audit Reporting','Technical Authority Audit','technical','Full technical SEO audit','Comprehensive technical authority barrier identification','milestone',4.0,20),
('Technical Audit Fixes','Technical Authority Implementation','technical','Implement technical audit recommendations','Technical barrier resolution and authority infrastructure repair','standard',3.0,21),
('Site Level Optimization','Site-Level Authority Architecture','technical','Site-wide SEO optimisation','Entity-level site architecture alignment','standard',3.0,22),
-- On-Page
('Main URL #1 Standard On Page Optimization','Primary Entity Alignment Optimisation','on_page','Standard on-page for main URL','Primary entity alignment and intent structuring','standard',2.0,30),
('Main URL #1 Premium On Page Optimization','Primary Entity Alignment Optimisation (Premium)','on_page','Premium on-page for main URL','Premium entity alignment with advanced intent architecture','standard',3.0,31),
('Main URL #1 Standard On Page Implementation/Recommendations','Primary Entity Alignment Implementation','on_page','Implement main URL on-page changes','Deploy primary entity alignment and intent structuring','standard',1.5,32),
('Main URL #1 Premium On Page Implementation/Recommendations','Primary Entity Alignment Implementation (Premium)','on_page','Implement premium main URL on-page','Deploy premium entity alignment','standard',2.0,33),
('URL #2 Standard On Page Optimization','Entity Alignment Optimisation – URL 2','on_page','Standard on-page optimisation for URL 2','Entity alignment and intent structuring for URL 2','standard',2.0,34),
('URL #2 Premium On Page Optimization','Entity Alignment Optimisation – URL 2 (Premium)','on_page','Premium on-page for URL 2','Premium entity alignment for URL 2','standard',3.0,35),
('URL #2 Standard On Page Implementation/Recommendations','Entity Alignment Implementation – URL 2','on_page','Implement URL 2 on-page','Deploy entity alignment for URL 2','standard',1.5,36),
('URL #2 Premium On Page Implementation/Recommendations','Entity Alignment Implementation – URL 2 (Premium)','on_page','Implement premium URL 2 on-page','Deploy premium entity alignment for URL 2','standard',2.0,37),
('URL #3 Standard On Page Optimization','Entity Alignment Optimisation – URL 3','on_page','Standard on-page optimisation for URL 3','Entity alignment and intent structuring for URL 3','standard',2.0,38),
('URL #3 Premium On Page Optimization','Entity Alignment Optimisation – URL 3 (Premium)','on_page','Premium on-page for URL 3','Premium entity alignment for URL 3','standard',3.0,39),
('URL #3 Standard On Page Implementation/Recommendations','Entity Alignment Implementation – URL 3','on_page','Implement URL 3 on-page','Deploy entity alignment for URL 3','standard',1.5,40),
('URL #3 Premium On Page Implementation/Recommendations','Entity Alignment Implementation – URL 3 (Premium)','on_page','Implement premium URL 3 on-page','Deploy premium entity alignment for URL 3','standard',2.0,41),
('URL #4 Standard On Page Optimization','Entity Alignment Optimisation – URL 4','on_page','Standard on-page for URL 4','Entity alignment for URL 4','standard',2.0,42),
('URL #4 Premium On Page Optimization','Entity Alignment Optimisation – URL 4 (Premium)','on_page','Premium on-page for URL 4','Premium entity alignment for URL 4','standard',3.0,43),
('URL #4 Standard On Page Implementation/Recommendations','Entity Alignment Implementation – URL 4','on_page','Implement URL 4 on-page','Deploy entity alignment for URL 4','standard',1.5,44),
('URL #4 Premium On Page Implementation/Recommendations','Entity Alignment Implementation – URL 4 (Premium)','on_page','Implement premium URL 4 on-page','Deploy premium entity alignment for URL 4','standard',2.0,45),
('URL #5 Standard On Page Optimization','Entity Alignment Optimisation – URL 5','on_page','Standard on-page for URL 5','Entity alignment for URL 5','standard',2.0,46),
('URL #5 Premium On Page Optimization','Entity Alignment Optimisation – URL 5 (Premium)','on_page','Premium on-page for URL 5','Premium entity alignment for URL 5','standard',3.0,47),
('URL #5 Standard On Page Implementation/Recommendations','Entity Alignment Implementation – URL 5','on_page','Implement URL 5 on-page','Deploy entity alignment for URL 5','standard',1.5,48),
('URL #5 Premium On Page Implementation/Recommendations','Entity Alignment Implementation – URL 5 (Premium)','on_page','Implement premium URL 5 on-page','Deploy premium entity alignment for URL 5','standard',2.0,49),
('URL #6 Standard On Page Optimization','Entity Alignment Optimisation – URL 6','on_page','Standard on-page for URL 6','Entity alignment for URL 6','standard',2.0,50),
('URL #6 Premium On Page Optimization','Entity Alignment Optimisation – URL 6 (Premium)','on_page','Premium on-page for URL 6','Premium entity alignment for URL 6','standard',3.0,51),
('URL #6 Standard On Page Implementation/Recommendations','Entity Alignment Implementation – URL 6','on_page','Implement URL 6 on-page','Deploy entity alignment for URL 6','standard',1.5,52),
('URL #6 Premium On Page Implementation/Recommendations','Entity Alignment Implementation – URL 6 (Premium)','on_page','Implement premium URL 6 on-page','Deploy premium entity alignment for URL 6','standard',2.0,53),
('URL #7 Standard On Page Optimization','Entity Alignment Optimisation – URL 7','on_page','Standard on-page for URL 7','Entity alignment for URL 7','standard',2.0,54),
('URL #7 Premium On Page Optimization','Entity Alignment Optimisation – URL 7 (Premium)','on_page','Premium on-page for URL 7','Premium entity alignment for URL 7','standard',3.0,55),
('URL #7 Standard On Page Implementation/Recommendations','Entity Alignment Implementation – URL 7','on_page','Implement URL 7 on-page','Deploy entity alignment for URL 7','standard',1.5,56),
('URL #7 Premium On Page Implementation/Recommendations','Entity Alignment Implementation – URL 7 (Premium)','on_page','Implement premium URL 7 on-page','Deploy premium entity alignment for URL 7','standard',2.0,57),
('Internal Link Optimization','Internal Authority Flow Engineering','on_page','Optimise internal linking structure','Strategic internal authority flow engineering','standard',2.0,58),
-- Content
('Quarterly Content Plan','Quarterly Content Authority Strategy','content','Plan content for next quarter','Strategic content authority roadmap for next 3 months','milestone',2.0,60),
('Write Service Page/Blog Content','Content Authority Publishing','content','Write service page or blog content','Authority content creation for topical relevance expansion','recurring',3.0,61),
('Content Publishing','Authority Content Deployment','content','Publish and optimise content','Deploy and optimise authority content across platforms','recurring',1.0,62),
-- Authority Placement (Guest Posts)
('(1) Authority Google News Link','Media Authority Injection','media_authority','Place 1 Google News authority link','Single media trust injection via Google News network','recurring',2.0,70),
('(2) Authority Google News Link','Dual Media Authority Injection','media_authority','Place 2 Google News authority links','Double media trust injection via Google News network','recurring',3.5,71),
('(1) 1k Traffic Guest Post','Authority Placement – Tier 1','authority_placement','Place 1 guest post on 1k traffic site','Tier 1 authority placement on established domain','recurring',2.5,72),
('(2) 1k Traffic Guest Post','Dual Authority Placement – Tier 1','authority_placement','Place 2 guest posts on 1k traffic sites','Dual Tier 1 authority placements','recurring',4.5,73),
('(1) 3k Traffic Guest Post','Authority Placement – Tier 2','authority_placement','Place 1 guest post on 3k traffic site','Tier 2 authority placement on higher-authority domain','recurring',3.0,74),
('(2) 3k Traffic Guest Post','Dual Authority Placement – Tier 2','authority_placement','Place 2 guest posts on 3k traffic sites','Dual Tier 2 authority placements','recurring',5.5,75),
('(1) 7k Traffic Guest Post','Authority Placement – Tier 3','authority_placement','Place 1 guest post on 7k traffic site','Tier 3 authority placement on premium domain','recurring',4.0,76),
('(2) 7k Traffic Guest Post','Dual Authority Placement – Tier 3','authority_placement','Place 2 guest posts on 7k traffic sites','Dual Tier 3 authority placements on premium domains','recurring',7.0,77),
-- Entity Reinforcement (Custom Signals)
('Level 1 Custom Signal Building','Entity Signal Reinforcement – Level 1','entity_reinforcement','Level 1 custom signal building','Core entity signal reinforcement layer','recurring',2.0,80),
('Level 2 Custom Signal Building','Entity Signal Reinforcement – Level 2','entity_reinforcement','Level 2 custom signal building','Enhanced entity signal reinforcement layer','recurring',3.0,81),
('Level 3 Custom Signal Building','Entity Signal Reinforcement – Level 3','entity_reinforcement','Level 3 custom signal building','Advanced entity signal reinforcement layer','recurring',4.0,82),
('Level 4 Custom Signal Building','Entity Signal Reinforcement – Level 4','entity_reinforcement','Level 4 custom signal building','Maximum entity signal reinforcement layer','recurring',5.0,83),
-- Amplification (Tiered Stacks)
('(1) Tiered Link Authority Stack','Authority Amplification Framework','amplification','Build 1 tiered link authority stack','Single authority amplification framework deployment','recurring',2.0,85),
('(2) Tiered Link Authority Stack','Dual Authority Amplification Framework','amplification','Build 2 tiered link authority stacks','Dual authority amplification framework deployment','recurring',3.5,86),
-- Signal Acceleration (Index Links)
('Index Links','Signal Acceleration & Discovery Layer','signal_acceleration','Submit and index all links','Accelerate signal discovery and indexation across all placements','recurring',0.5,90),
-- Social
('Social Essentials','Social Authority Foundation','social','Set up social essentials package','Core social authority foundation setup','milestone',3.0,95),
('Social Fortress','Social Authority Fortification','social','Social fortress setup','Social authority fortification layer','milestone',4.0,96),
('Social Ultimate','Social Authority Ecosystem','social','Social ultimate package','Complete social authority ecosystem deployment','milestone',5.0,97),
('Social Power Up','Social Authority Amplification','social','Social power up package','Social authority amplification across key platforms','standard',2.0,98),
-- Link Building
('Branded Link Building','Branded Authority Reinforcement','entity_reinforcement','Build branded links','Strategic branded authority signal reinforcement','recurring',2.0,100),
('Bio Entity Stack','Bio Entity Authority Stack','entity_reinforcement','Build bio entity stack','Entity biography authority stack construction','standard',3.0,101),
-- Press
('Premium Press Release','Brand Signal Broadcast','media_authority','Write and distribute premium press release','Premium brand signal broadcast via authoritative media network','recurring',3.0,105),
-- SEO Power-Ups
('SEO Quarter Power-Up','Quarterly Authority Power-Up','reporting','Quarterly SEO power-up activities','Quarterly authority infrastructure reinforcement and expansion','milestone',4.0,110),
-- Reviews
('Quarterly Review Meeting','Quarterly Authority Strategy Review','review','Client quarterly review meeting','Strategic authority performance review and roadmap alignment','review',1.5,115),
-- AI Visibility
('AI Overview Content Engineering','AI Overview Content Engineering','ai_visibility','Engineer content for AI overviews','Structure content for AI overview citation and generative retrieval','standard',2.0,120),
('FAQ Structuring for Generative Retrieval','Generative Retrieval Optimisation','ai_visibility','Structure FAQs for AI retrieval','FAQ architecture optimised for AI generative retrieval','standard',1.5,121),
('Entity Relationship Mapping','Entity Relationship Architecture','ai_visibility','Map entity relationships','Structured entity relationship mapping for LLM parsing','standard',2.0,122),
('Structured Data Reinforcement','Schema Authority Reinforcement','ai_visibility','Implement structured data for AI','Schema markup reinforcement for AI system parsing and trust','standard',2.0,123);

-- ================================================================
-- SEED: Plan Tiers
-- ================================================================
INSERT OR IGNORE INTO plan_tiers (tier_key, client_name, internal_name, tagline, monthly_price, signal_level, description, phase1_outcome, phase2_outcome, phase3_outcome, phase4_outcome, sort_order) VALUES
('basic','AI Authority Foundation','Basic','Establish structured authority and entity clarity'     ,1497,1,'Core authority placement layer with foundational media trust signals and baseline AI visibility optimisation. Ideal for businesses establishing their digital authority foundation.',
 'AI-ready structural authority and technical foundation','Growing citation probability and competitive lift','Brand begins dominating topical authority space','Compounded authority and AI visibility positioning',1),
('core','AI Authority Growth','Core','Expand authority velocity with multi-layer reinforcement',2497,2,'Multi-tier authority placements with quarterly media injections and structured reinforcement. The strategic choice for businesses accelerating authority growth.',
 'AI-ready structural authority and technical foundation','Expanded authority placement network and multi-layer reinforcement','Enhanced AI citation optimisation and authority velocity','Compounded multi-tier authority and AI citation dominance',2),
('ultimate','AI Authority Accelerator','Ultimate','High-velocity authority engineering for competitive markets',3997,3,'High-velocity placements, premium media injections and advanced amplification framework with competitive authority modelling. For businesses in competitive markets demanding rapid authority growth.',
 'AI-ready structural authority and technical foundation','High-velocity authority engineering and premium media injections','Advanced amplification framework and competitive authority modelling','Compounded authority and AI citation dominance strategy',3),
('xtreme','AI Market Domination','Xtreme','Authority saturation and AI citation dominance',5997,4,'Double media injections, advanced tiered amplification stacks, aggressive entity saturation and continuous reinforcement cycles. Maximum authority velocity for market leaders.',
 'AI-ready structural authority and technical foundation','Double media injections and multi-layer amplification architecture','Aggressive entity saturation and continuous reinforcement cycles','Complete authority ecosystem and AI citation dominance',4);

-- ================================================================
-- SEED: Tier Monthly Deliverables
-- All 4 tiers × 12 months
-- ================================================================

-- ---- HELPER: get IDs by internal_name ----
-- We use subqueries to remain portable

-- =====================
-- BASIC - 12 MONTHS
-- =====================

-- Month 1
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Onboarding Call';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Google Search Console Access';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Google Analytics Access';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Website Access';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Google Data Studio Report';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Keyword Research / URL Mapping';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Rank Tracking Setup';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Link Plan / Anchor Mapping';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Competitor Analysis';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Technical Audit Reporting';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Site Level Optimization';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Main URL #1 Standard On Page Optimization';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #2 Standard On Page Optimization';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #3 Standard On Page Optimization';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Internal Link Optimization';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Quarterly Content Plan';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Write Service Page/Blog Content';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Premium Press Release';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) Authority Google News Link';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) 1k Traffic Guest Post';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Level 1 Custom Signal Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Main URL #1 Standard On Page Implementation/Recommendations';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Index Links';
-- Month 2
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Technical Audit Fixes';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Content Publishing';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Social Essentials';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Social Fortress';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Social Ultimate';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #2 Standard On Page Implementation/Recommendations';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #3 Standard On Page Implementation/Recommendations';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #4 Standard On Page Optimization';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #5 Standard On Page Optimization';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) Authority Google News Link';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) 1k Traffic Guest Post';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Level 1 Custom Signal Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Write Service Page/Blog Content';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Index Links';
-- Month 3
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Content Publishing';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Social Power Up';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Branded Link Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) Authority Google News Link';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) 1k Traffic Guest Post';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Level 1 Custom Signal Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #4 Standard On Page Implementation/Recommendations';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #5 Standard On Page Implementation/Recommendations';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #6 Standard On Page Optimization';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #7 Standard On Page Optimization';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Write Service Page/Blog Content';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Index Links';
-- Month 4
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='SEO Quarter Power-Up';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Quarterly Review Meeting';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Quarterly Content Plan';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Premium Press Release';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) Authority Google News Link';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) 1k Traffic Guest Post';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Level 1 Custom Signal Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Content Publishing';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #6 Standard On Page Implementation/Recommendations';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='URL #7 Standard On Page Implementation/Recommendations';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Write Service Page/Blog Content';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Index Links';
-- Months 5-12: recurring deliverables for Basic (varying by month)
-- Month 5
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Content Publishing';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Branded Link Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Bio Entity Stack';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) Authority Google News Link';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) 1k Traffic Guest Post';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Level 1 Custom Signal Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Write Service Page/Blog Content';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Index Links';
-- Month 6
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,6,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Content Publishing';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,6,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) Authority Google News Link';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,6,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) 1k Traffic Guest Post';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,6,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Level 1 Custom Signal Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,6,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Write Service Page/Blog Content';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,6,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Index Links';
-- Month 7
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Quarterly Review Meeting';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Quarterly Content Plan';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Premium Press Release';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) Authority Google News Link';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='(1) 1k Traffic Guest Post';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Level 1 Custom Signal Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Content Publishing';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Write Service Page/Blog Content';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name='Index Links';
-- Months 8,9
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,8,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name IN ('Content Publishing','Branded Link Building','(1) Authority Google News Link','(1) 1k Traffic Guest Post','Level 1 Custom Signal Building','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,9,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name IN ('Content Publishing','(1) Authority Google News Link','(1) 1k Traffic Guest Post','Level 1 Custom Signal Building','Write Service Page/Blog Content','Index Links');
-- Month 10
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,10,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name IN ('SEO Quarter Power-Up','Quarterly Review Meeting','Quarterly Content Plan','Premium Press Release','(1) Authority Google News Link','(1) 1k Traffic Guest Post','Level 1 Custom Signal Building','Content Publishing','Write Service Page/Blog Content','Index Links');
-- Months 11,12
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,11,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name IN ('Content Publishing','Branded Link Building','(1) Authority Google News Link','(1) 1k Traffic Guest Post','Level 1 Custom Signal Building','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,12,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='basic' AND d.internal_name IN ('Content Publishing','(1) Authority Google News Link','(1) 1k Traffic Guest Post','Level 1 Custom Signal Building','Write Service Page/Blog Content','Index Links');

-- =====================
-- CORE - 12 MONTHS (adds 3k guest post, tiered stack, level 2 signals)
-- =====================
-- Month 1 (same foundation as Basic + extra deliverables)
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('Onboarding Call','Google Search Console Access','Google Analytics Access','Website Access','Google Data Studio Report','Keyword Research / URL Mapping','Rank Tracking Setup','Link Plan / Anchor Mapping','Competitor Analysis','Technical Audit Reporting','Site Level Optimization','Main URL #1 Standard On Page Optimization','URL #2 Standard On Page Optimization','URL #3 Standard On Page Optimization','Internal Link Optimization','Quarterly Content Plan','Write Service Page/Blog Content','Premium Press Release','Main URL #1 Standard On Page Implementation/Recommendations','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack');
-- Months 2-12 for Core (recurring pattern with 3k + tiered stack + level 2)
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('Technical Audit Fixes','Content Publishing','Social Essentials','Social Fortress','Social Ultimate','URL #2 Standard On Page Implementation/Recommendations','URL #3 Standard On Page Implementation/Recommendations','URL #4 Standard On Page Optimization','URL #5 Standard On Page Optimization','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('Content Publishing','URL #4 Standard On Page Implementation/Recommendations','URL #5 Standard On Page Implementation/Recommendations','URL #6 Standard On Page Optimization','URL #7 Standard On Page Optimization','Social Power Up','Branded Link Building','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,4,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('SEO Quarter Power-Up','URL #6 Standard On Page Implementation/Recommendations','URL #7 Standard On Page Implementation/Recommendations','Quarterly Review Meeting','Quarterly Content Plan','Premium Press Release','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Content Publishing','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('Content Publishing','Branded Link Building','Bio Entity Stack','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,6,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('Content Publishing','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,7,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('SEO Quarter Power-Up','Quarterly Review Meeting','Quarterly Content Plan','Content Publishing','Premium Press Release','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,8,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('Content Publishing','Branded Link Building','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,9,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('Content Publishing','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,10,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('SEO Quarter Power-Up','Quarterly Review Meeting','Quarterly Content Plan','Content Publishing','Premium Press Release','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,11,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('Content Publishing','Branded Link Building','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,12,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='core' AND d.internal_name IN ('Content Publishing','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','Level 2 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');

-- =====================
-- ULTIMATE - 12 MONTHS (adds 7k, level 3, premium on-page in some months)
-- =====================
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='ultimate' AND d.internal_name IN ('Onboarding Call','Google Search Console Access','Google Analytics Access','Website Access','Google Data Studio Report','Keyword Research / URL Mapping','Rank Tracking Setup','Link Plan / Anchor Mapping','Competitor Analysis','Technical Audit Reporting','Site Level Optimization','Internal Link Optimization','Quarterly Content Plan','Write Service Page/Blog Content','Premium Press Release','Main URL #1 Standard On Page Optimization','URL #2 Standard On Page Optimization','URL #3 Standard On Page Optimization','Main URL #1 Standard On Page Implementation/Recommendations','URL #2 Standard On Page Implementation/Recommendations','URL #3 Standard On Page Implementation/Recommendations','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='ultimate' AND d.internal_name IN ('(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','(1) 7k Traffic Guest Post','Level 3 Custom Signal Building','(1) Tiered Link Authority Stack');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='ultimate' AND d.internal_name IN ('Technical Audit Fixes','Content Publishing','Social Essentials','Social Fortress','Social Ultimate','URL #4 Standard On Page Optimization','URL #5 Standard On Page Optimization','URL #4 Standard On Page Implementation/Recommendations','URL #5 Standard On Page Implementation/Recommendations','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','(1) 7k Traffic Guest Post','Level 3 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='ultimate' AND d.internal_name IN ('Content Publishing','URL #6 Standard On Page Optimization','URL #7 Standard On Page Optimization','URL #6 Standard On Page Implementation/Recommendations','URL #7 Standard On Page Implementation/Recommendations','Social Power Up','Branded Link Building','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','(1) 7k Traffic Guest Post','Level 3 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,m.month_number,d.id,1 FROM plan_tiers t, (SELECT 4 AS month_number UNION SELECT 7 UNION SELECT 10) m, deliverable_catalogue d WHERE t.tier_key='ultimate' AND d.internal_name IN ('SEO Quarter Power-Up','Quarterly Review Meeting','Quarterly Content Plan','Content Publishing','Premium Press Release','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','(1) 7k Traffic Guest Post','Level 3 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,m.month_number,d.id,1 FROM plan_tiers t, (SELECT 5 AS month_number UNION SELECT 8 UNION SELECT 11) m, deliverable_catalogue d WHERE t.tier_key='ultimate' AND d.internal_name IN ('Content Publishing','Branded Link Building','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','(1) 7k Traffic Guest Post','Level 3 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,m.month_number,d.id,1 FROM plan_tiers t, (SELECT 6 AS month_number UNION SELECT 9 UNION SELECT 12) m, deliverable_catalogue d WHERE t.tier_key='ultimate' AND d.internal_name IN ('Content Publishing','(1) Authority Google News Link','(1) 1k Traffic Guest Post','(1) 3k Traffic Guest Post','(1) 7k Traffic Guest Post','Level 3 Custom Signal Building','(1) Tiered Link Authority Stack','Write Service Page/Blog Content','Index Links');
-- Month 5 Bio Entity Stack
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='ultimate' AND d.internal_name='Bio Entity Stack';

-- =====================
-- XTREME - 12 MONTHS (2x all links, level 4, premium on-page)
-- =====================
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('Onboarding Call','Google Search Console Access','Google Analytics Access','Website Access','Google Data Studio Report','Keyword Research / URL Mapping','Rank Tracking Setup','Link Plan / Anchor Mapping','Competitor Analysis','Technical Audit Reporting','Site Level Optimization','Internal Link Optimization','Quarterly Content Plan','Write Service Page/Blog Content','Premium Press Release','Main URL #1 Premium On Page Optimization','URL #2 Premium On Page Optimization','URL #3 Premium On Page Optimization','Main URL #1 Premium On Page Implementation/Recommendations','URL #2 Premium On Page Implementation/Recommendations','URL #3 Premium On Page Implementation/Recommendations','Index Links');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,2 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('(2) Authority Google News Link','(2) 1k Traffic Guest Post','(2) 3k Traffic Guest Post','(2) 7k Traffic Guest Post','(2) Tiered Link Authority Stack');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,1,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name='Level 4 Custom Signal Building';
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('Technical Audit Fixes','Content Publishing','Social Essentials','Social Fortress','Social Ultimate','URL #4 Premium On Page Optimization','URL #5 Premium On Page Optimization','URL #4 Premium On Page Implementation/Recommendations','URL #5 Premium On Page Implementation/Recommendations','Write Service Page/Blog Content','Index Links','Level 4 Custom Signal Building');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,2,d.id,2 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('(2) Authority Google News Link','(2) 1k Traffic Guest Post','(2) 3k Traffic Guest Post','(2) 7k Traffic Guest Post','(2) Tiered Link Authority Stack');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('Content Publishing','URL #6 Premium On Page Optimization','URL #7 Premium On Page Optimization','URL #6 Premium On Page Implementation/Recommendations','URL #7 Premium On Page Implementation/Recommendations','Social Power Up','Branded Link Building','Write Service Page/Blog Content','Index Links','Level 4 Custom Signal Building');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,3,d.id,2 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('(2) Authority Google News Link','(2) 1k Traffic Guest Post','(2) 3k Traffic Guest Post','(2) 7k Traffic Guest Post','(2) Tiered Link Authority Stack');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,m.month_number,d.id,1 FROM plan_tiers t, (SELECT 4 AS month_number UNION SELECT 7 UNION SELECT 10) m, deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('SEO Quarter Power-Up','Quarterly Review Meeting','Quarterly Content Plan','Content Publishing','Premium Press Release','Write Service Page/Blog Content','Index Links','Level 4 Custom Signal Building');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,m.month_number,d.id,2 FROM plan_tiers t, (SELECT 4 AS month_number UNION SELECT 7 UNION SELECT 10) m, deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('(2) Authority Google News Link','(2) 1k Traffic Guest Post','(2) 3k Traffic Guest Post','(2) 7k Traffic Guest Post','(2) Tiered Link Authority Stack');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,m.month_number,d.id,1 FROM plan_tiers t, (SELECT 5 AS month_number UNION SELECT 8 UNION SELECT 11) m, deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('Content Publishing','Branded Link Building','Write Service Page/Blog Content','Index Links','Level 4 Custom Signal Building');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,m.month_number,d.id,2 FROM plan_tiers t, (SELECT 5 AS month_number UNION SELECT 8 UNION SELECT 11) m, deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('(2) Authority Google News Link','(2) 1k Traffic Guest Post','(2) 3k Traffic Guest Post','(2) 7k Traffic Guest Post','(2) Tiered Link Authority Stack');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,m.month_number,d.id,1 FROM plan_tiers t, (SELECT 6 AS month_number UNION SELECT 9 UNION SELECT 12) m, deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('Content Publishing','Write Service Page/Blog Content','Index Links','Level 4 Custom Signal Building');
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,m.month_number,d.id,2 FROM plan_tiers t, (SELECT 6 AS month_number UNION SELECT 9 UNION SELECT 12) m, deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name IN ('(2) Authority Google News Link','(2) 1k Traffic Guest Post','(2) 3k Traffic Guest Post','(2) 7k Traffic Guest Post','(2) Tiered Link Authority Stack');
-- Month 5 Bio Entity Stack for Xtreme
INSERT OR IGNORE INTO tier_monthly_deliverables (tier_id,month_number,deliverable_id,qty) SELECT t.id,5,d.id,1 FROM plan_tiers t,deliverable_catalogue d WHERE t.tier_key='xtreme' AND d.internal_name='Bio Entity Stack';
