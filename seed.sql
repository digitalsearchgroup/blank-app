-- Seed data for Digital Search Group Campaign Management System

-- Sample clients
INSERT OR IGNORE INTO clients (id, company_name, contact_name, contact_email, contact_phone, website, industry, location, status, monthly_budget, notes)
VALUES
  (1, 'Apex Plumbing Services', 'James Mitchell', 'james@apexplumbing.com.au', '+61 2 9876 5432', 'apexplumbing.com.au', 'Trades & Home Services', 'Sydney, NSW, Australia', 'active', 2500, 'Local SEO focus - multiple suburbs'),
  (2, 'BlueSky Legal', 'Sarah Chen', 'sarah@blueskylegal.com.au', '+61 3 8765 4321', 'blueskylegal.com.au', 'Legal Services', 'Melbourne, VIC, Australia', 'active', 4500, 'Competitive legal market, organic focus'),
  (3, 'TechNova Solutions', 'Mark Williams', 'mark@technovasolutions.com', '+1 555 987 6543', 'technovasolutions.com', 'B2B Software', 'Austin, TX, USA', 'prospect', 0, 'Initial proposal stage'),
  (4, 'Coastal Dental Group', 'Dr. Emily Torres', 'emily@coastaldental.com.au', '+61 7 3456 7890', 'coastaldental.com.au', 'Healthcare', 'Brisbane, QLD, Australia', 'active', 3000, 'Multi-location dental practice');

-- Sample campaigns
INSERT OR IGNORE INTO campaigns (id, client_id, name, campaign_type, status, start_date, monthly_investment, target_locations, goals)
VALUES
  (1, 1, 'Apex Plumbing Organic SEO', 'organic_seo', 'active', '2025-10-01', 2500, '{"primary":"Sydney, NSW","suburbs":["Parramatta","Chatswood","Bondi","Penrith"]}', '{"rankings":"Top 3 for plumber sydney","traffic":"200% organic growth","leads":"50 leads/month"}'),
  (2, 2, 'BlueSky Legal Brand Authority', 'organic_seo', 'active', '2025-09-01', 4500, '{"primary":"Melbourne, VIC","secondary":"Australia"}', '{"rankings":"Page 1 for family law melbourne","authority":"DA 40+","leads":"30 qualified leads/month"}'),
  (3, 4, 'Coastal Dental Local SEO', 'local_seo', 'active', '2025-11-01', 3000, '{"primary":"Brisbane, QLD","suburbs":["Fortitude Valley","New Farm","Clayfield"]}', '{"rankings":"Top 3 in local pack","reviews":"100+ Google reviews","appointments":"40 new patients/month"}');

-- Sample keywords for Apex Plumbing
INSERT OR IGNORE INTO keywords (campaign_id, client_id, keyword, target_url, location_code, language_code, keyword_group, priority, monthly_search_volume, keyword_difficulty)
VALUES
  (1, 1, 'plumber sydney', 'apexplumbing.com.au', 2036, 'en', 'Core Services', 'high', 2400, 78),
  (1, 1, 'emergency plumber sydney', 'apexplumbing.com.au', 2036, 'en', 'Emergency Services', 'high', 1200, 65),
  (1, 1, 'blocked drain sydney', 'apexplumbing.com.au/blocked-drains', 2036, 'en', 'Service Pages', 'high', 880, 58),
  (1, 1, 'hot water system repair sydney', 'apexplumbing.com.au/hot-water', 2036, 'en', 'Service Pages', 'medium', 590, 52),
  (1, 1, 'plumber parramatta', 'apexplumbing.com.au/parramatta', 2036, 'en', 'Location Pages', 'medium', 390, 45),
  (1, 1, 'plumber chatswood', 'apexplumbing.com.au/chatswood', 2036, 'en', 'Location Pages', 'medium', 320, 42);

-- Sample keywords for BlueSky Legal
INSERT OR IGNORE INTO keywords (campaign_id, client_id, keyword, target_url, location_code, language_code, keyword_group, priority, monthly_search_volume, keyword_difficulty)
VALUES
  (2, 2, 'family lawyer melbourne', 'blueskylegal.com.au', 2036, 'en', 'Core Services', 'high', 1900, 82),
  (2, 2, 'divorce lawyer melbourne', 'blueskylegal.com.au/divorce', 2036, 'en', 'Core Services', 'high', 1600, 79),
  (2, 2, 'property settlement lawyer melbourne', 'blueskylegal.com.au/property-settlement', 2036, 'en', 'Specialist Services', 'high', 720, 71),
  (2, 2, 'child custody lawyer melbourne', 'blueskylegal.com.au/child-custody', 2036, 'en', 'Specialist Services', 'high', 980, 76);

-- Sample LLM prompts
INSERT OR IGNORE INTO llm_prompts (campaign_id, client_id, prompt_text, prompt_category, target_brand, llm_model)
VALUES
  (1, 1, 'Who are the best plumbers in Sydney for emergency plumbing?', 'brand_mention', 'Apex Plumbing', 'chatgpt'),
  (1, 1, 'What are the top-rated plumbing companies in Sydney?', 'brand_mention', 'Apex Plumbing', 'chatgpt'),
  (2, 2, 'Who are the best family lawyers in Melbourne?', 'brand_mention', 'BlueSky Legal', 'chatgpt'),
  (2, 2, 'What law firms in Melbourne specialise in divorce?', 'brand_mention', 'BlueSky Legal', 'gemini');

-- Sample competitors
INSERT OR IGNORE INTO competitors (campaign_id, client_id, domain, label, is_primary)
VALUES
  (1, 1, 'priorityplumbing.com.au', 'Priority Plumbing', 1),
  (1, 1, 'sydneyplumbingspecialists.com.au', 'Sydney Plumbing Specialists', 0),
  (2, 2, 'slatergordon.com.au', 'Slater & Gordon', 1),
  (2, 2, 'kellylegal.com.au', 'Kelly Legal', 0);

-- Sample content items
INSERT OR IGNORE INTO content_items (campaign_id, client_id, title, content_type, status, target_keyword, word_count_target, due_date)
VALUES
  (1, 1, '10 Signs You Need an Emergency Plumber in Sydney', 'blog_post', 'published', 'emergency plumber sydney', 1800, '2025-11-15'),
  (1, 1, 'Complete Guide to Blocked Drains: Causes & Solutions', 'blog_post', 'approved', 'blocked drain sydney', 2200, '2025-12-01'),
  (1, 1, 'Plumbing Services in Parramatta - Apex Plumbing', 'landing_page', 'in_progress', 'plumber parramatta', 800, '2025-12-10'),
  (2, 2, 'Property Settlement in Melbourne: What You Need to Know', 'blog_post', 'planned', 'property settlement lawyer melbourne', 2500, '2025-12-15'),
  (2, 2, 'Child Custody Rights in Victoria: A Parent''s Guide', 'blog_post', 'briefed', 'child custody lawyer melbourne', 3000, '2026-01-05');
